CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    request_id uuid NOT NULL UNIQUE,
    request_fingerprint text NOT NULL,
    customer_name text NOT NULL CHECK (length(trim(customer_name)) BETWEEN 2 AND 150),
    delivery_address text NOT NULL CHECK (length(trim(delivery_address)) BETWEEN 5 AND 1000),
    phone text NOT NULL CHECK (length(phone) BETWEEN 7 AND 30),
    email text NOT NULL CHECK (length(email) <= 254),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'purchasing', 'ready', 'delivered', 'cancelled')),
    total numeric(16,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    email_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    product_sku text,
    product_slug text NOT NULL,
    material text,
    color text,
    size text,
    availability text NOT NULL,
    unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99)
);

CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX orders_status_created_at_idx ON public.orders(status, created_at DESC);
CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orders, public.order_items FROM anon, authenticated;
GRANT SELECT ON public.orders, public.order_items TO authenticated;
GRANT UPDATE (status) ON public.orders TO authenticated;
GRANT ALL ON public.orders, public.order_items TO service_role;

CREATE POLICY "Admins read orders" ON public.orders FOR SELECT TO authenticated
USING ((SELECT app_private.is_admin()));
CREATE POLICY "Admins update order status" ON public.orders FOR UPDATE TO authenticated
USING ((SELECT app_private.is_admin())) WITH CHECK ((SELECT app_private.is_admin()));
CREATE POLICY "Admins read order items" ON public.order_items FOR SELECT TO authenticated
USING ((SELECT app_private.is_admin()));

-- The only public write path. Prices and snapshots always come from the catalog.
-- A transaction saves the entire order or nothing; retries reuse the receipt.
CREATE FUNCTION public.place_catalog_order(p_request_id uuid, p_customer jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_product public.products%ROWTYPE;
    v_item jsonb;
    v_quantity integer;
    v_ids uuid[] := '{}';
    v_total numeric(16,2) := 0;
    v_fingerprint text;
    v_name text := trim(p_customer->>'name');
    v_address text := trim(p_customer->>'address');
    v_phone text := trim(p_customer->>'phone');
    v_email text := lower(trim(p_customer->>'email'));
BEGIN
    IF p_request_id IS NULL OR jsonb_typeof(p_customer) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'El pedido no es válido.';
    END IF;
    IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'El carrito debe contener entre 1 y 50 productos.';
    END IF;
    IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 150
       OR v_address IS NULL OR length(v_address) NOT BETWEEN 5 AND 1000
       OR v_phone IS NULL OR length(v_phone) NOT BETWEEN 7 AND 30
       OR v_phone !~ '^[+0-9() .-]+$'
       OR length(regexp_replace(v_phone, '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15
       OR v_email IS NULL OR length(v_email) > 254
       OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION 'Revisa el nombre, la dirección, el teléfono y el correo.';
    END IF;

    v_fingerprint := encode(sha256(convert_to(jsonb_build_object('customer', p_customer, 'items', p_items)::text, 'UTF8')), 'hex');
    -- Serialize retries, including simultaneous requests with the same key.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
    SELECT * INTO v_order FROM public.orders WHERE request_id = p_request_id;
    IF FOUND THEN
        IF v_order.request_fingerprint <> v_fingerprint THEN
            RAISE EXCEPTION 'Esta solicitud ya corresponde a otro pedido. Revisa tu carrito.';
        END IF;
        RETURN jsonb_build_object('order_number', v_order.order_number, 'total', v_order.total);
    END IF;

    INSERT INTO public.orders (request_id, request_fingerprint, customer_name, delivery_address, phone, email)
    VALUES (p_request_id, v_fingerprint, v_name, v_address, v_phone, v_email)
    RETURNING * INTO v_order;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
           OR (v_item->>'quantity') IS NULL OR (v_item->>'quantity') !~ '^[0-9]{1,2}$'
           OR (v_item->>'expected_price') IS NULL THEN
            RAISE EXCEPTION 'La cantidad o el precio de un producto no es válido.';
        END IF;
        v_quantity := (v_item->>'quantity')::integer;
        IF v_quantity NOT BETWEEN 1 AND 99 THEN
            RAISE EXCEPTION 'La cantidad debe estar entre 1 y 99.';
        END IF;
        SELECT * INTO v_product FROM public.products
        WHERE id = (v_item->>'product_id')::uuid AND is_published = true
        FOR SHARE;
        IF NOT FOUND OR v_product.availability = 'out_of_stock' THEN
            RAISE EXCEPTION 'Un producto ya no está disponible. Actualiza el carrito.';
        END IF;
        IF v_product.id = ANY(v_ids) THEN
            RAISE EXCEPTION 'Hay productos duplicados en el carrito.';
        END IF;
        IF (v_item->>'expected_price')::numeric IS DISTINCT FROM v_product.price THEN
            RAISE EXCEPTION 'El precio de un producto cambió. Actualiza el carrito antes de confirmar.';
        END IF;
        v_ids := array_append(v_ids, v_product.id);
        INSERT INTO public.order_items (order_id, product_id, product_name, product_sku, product_slug, material, color, size, availability, unit_price, quantity)
        VALUES (v_order.id, v_product.id, v_product.name, v_product.sku, v_product.slug, v_product.material, v_product.color, v_product.size, v_product.availability, v_product.price, v_quantity);
        v_total := v_total + v_product.price * v_quantity;
    END LOOP;
    UPDATE public.orders SET total = v_total WHERE id = v_order.id;
    RETURN jsonb_build_object('order_number', v_order.order_number, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.place_catalog_order(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_catalog_order(uuid, jsonb, jsonb) TO anon, authenticated;
