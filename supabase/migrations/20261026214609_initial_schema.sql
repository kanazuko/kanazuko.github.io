
-- =========================================================
-- PRArtJewelry - Migración inicial
-- Catálogo público + administración protegida
-- =========================================================

-- 1. CATEGORÍAS
CREATE TABLE public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id uuid REFERENCES public.categories(id)
        ON DELETE RESTRICT,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT category_name_not_empty
        CHECK (length(trim(name)) > 0),
    CONSTRAINT category_not_own_parent
        CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX idx_categories_parent
    ON public.categories(parent_id);


-- 2. PRODUCTOS
CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid REFERENCES public.categories(id)
        ON DELETE SET NULL,

    sku text UNIQUE,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,

    price numeric(12,2) NOT NULL,
    compare_at_price numeric(12,2),

    material text,
    color text,
    size text,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,

    availability text NOT NULL DEFAULT 'available',
    is_published boolean NOT NULL DEFAULT false,
    is_featured boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT product_name_not_empty
        CHECK (length(trim(name)) > 0),
    CONSTRAINT product_price_valid
        CHECK (price >= 0),
    CONSTRAINT product_compare_price_valid
        CHECK (
            compare_at_price IS NULL
            OR compare_at_price > price
        ),
    CONSTRAINT product_availability_valid
        CHECK (
            availability IN (
                'available',
                'out_of_stock',
                'made_to_order'
            )
        ),
    CONSTRAINT product_attributes_object
        CHECK (jsonb_typeof(attributes) = 'object')
);

CREATE INDEX idx_products_category
    ON public.products(category_id);

CREATE INDEX idx_products_catalog
    ON public.products(is_published, sort_order);

CREATE INDEX idx_products_featured
    ON public.products(is_featured)
    WHERE is_published = true;


-- 3. IMÁGENES DE PRODUCTOS
CREATE TABLE public.product_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL
        REFERENCES public.products(id) ON DELETE CASCADE,

    storage_path text NOT NULL UNIQUE,
    alt_text text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT image_path_not_empty
        CHECK (length(trim(storage_path)) > 0)
);

CREATE INDEX idx_images_product_order
    ON public.product_images(product_id, sort_order);


-- 4. ADMINISTRADORES
CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY
        REFERENCES auth.users(id) ON DELETE CASCADE,

    created_at timestamptz NOT NULL DEFAULT now()
);


-- 5. ACTUALIZACIÓN AUTOMÁTICA DE FECHAS
CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- 6. FUNCIÓN SEGURA PARA VERIFICAR ADMINISTRADORES
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE FUNCTION app_private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_admin()
FROM PUBLIC;

GRANT USAGE ON SCHEMA app_private
TO authenticated;

GRANT EXECUTE ON FUNCTION app_private.is_admin()
TO authenticated;


-- 7. ACTIVAR ROW LEVEL SECURITY
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;


-- 8. LECTURA PÚBLICA DE CATEGORÍAS
CREATE POLICY "Public read active categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (is_active = true);


-- 9. LECTURA PÚBLICA DE PRODUCTOS
CREATE POLICY "Public read published products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_published = true);


-- 10. LECTURA PÚBLICA DE IMÁGENES
CREATE POLICY "Public read published product images"
ON public.product_images
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.products
        WHERE products.id = product_images.product_id
          AND products.is_published = true
    )
);


-- 11. ADMINISTRACIÓN DE CATEGORÍAS
CREATE POLICY "Admins manage categories"
ON public.categories
FOR ALL
TO authenticated
USING ((SELECT app_private.is_admin()))
WITH CHECK ((SELECT app_private.is_admin()));


-- 12. ADMINISTRACIÓN DE PRODUCTOS
CREATE POLICY "Admins manage products"
ON public.products
FOR ALL
TO authenticated
USING ((SELECT app_private.is_admin()))
WITH CHECK ((SELECT app_private.is_admin()));


-- 13. ADMINISTRACIÓN DE IMÁGENES
CREATE POLICY "Admins manage product images"
ON public.product_images
FOR ALL
TO authenticated
USING ((SELECT app_private.is_admin()))
WITH CHECK ((SELECT app_private.is_admin()));


-- 14. LOS ADMINISTRADORES PUEDEN VER SU REGISTRO
CREATE POLICY "Admins read own membership"
ON public.admin_users
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));


-- 15. CATEGORÍAS INICIALES
INSERT INTO public.categories (name, slug, sort_order)
VALUES
    ('Anillos', 'anillos', 1),
    ('Pulseras', 'pulseras', 2),
    ('Collares', 'collares', 3),
    ('Aretes', 'aretes', 4),
    ('Dijes', 'dijes', 5),
    ('Conjuntos', 'conjuntos', 6);
