-- Subcategorías, etiquetas y relaciones de producto.
ALTER TABLE public.products
    ADD COLUMN subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX idx_products_subcategory ON public.products(subcategory_id);

INSERT INTO public.categories (parent_id, name, slug, sort_order)
SELECT parent.id, item.name, item.slug, item.sort_order
FROM public.categories AS parent
CROSS JOIN (VALUES
    ('Huggies', 'huggies', 1),
    ('Broqueles', 'broqueles', 2),
    ('Broches', 'broches', 3),
    ('Tope de rosca', 'tope-de-rosca', 4)
) AS item(name, slug, sort_order)
WHERE parent.slug = 'aretes'
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE public.tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tag_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE public.product_tags (
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX idx_product_tags_tag ON public.product_tags(tag_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tags" ON public.tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read published product tags" ON public.product_tags FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_tags.product_id AND products.is_published = true));
CREATE POLICY "Admins manage tags" ON public.tags FOR ALL TO authenticated
USING ((SELECT app_private.is_admin())) WITH CHECK ((SELECT app_private.is_admin()));
CREATE POLICY "Admins manage product tags" ON public.product_tags FOR ALL TO authenticated
USING ((SELECT app_private.is_admin())) WITH CHECK ((SELECT app_private.is_admin()));
