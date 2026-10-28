-- Valores predeterminados configurables para nuevos productos.
CREATE TABLE public.product_form_defaults (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    material text,
    is_published boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER product_form_defaults_updated_at
BEFORE UPDATE ON public.product_form_defaults
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.product_form_defaults (id, category_id, material, is_published)
SELECT true, id, 'Acero Inoxidable', true
FROM public.categories
WHERE slug = 'aretes'
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.product_form_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read product form defaults" ON public.product_form_defaults
FOR SELECT TO authenticated USING ((SELECT app_private.is_admin()));

CREATE POLICY "Admins manage product form defaults" ON public.product_form_defaults
FOR ALL TO authenticated USING ((SELECT app_private.is_admin())) WITH CHECK ((SELECT app_private.is_admin()));
