ALTER TABLE public.product_form_defaults
    ADD COLUMN subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    ADD COLUMN color text;
