CREATE TABLE public.instagram_manual_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid UNIQUE REFERENCES public.products(id) ON DELETE SET NULL,
    product_name text NOT NULL CHECK (length(trim(product_name)) > 0),
    caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 2200),
    instagram_url text NOT NULL DEFAULT '',
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (instagram_url = '' OR instagram_url ~ '^https://www[.]instagram[.]com/(p|reel|tv)/[A-Za-z0-9_-]+/$'),
    CHECK (completed_at IS NULL OR instagram_url <> '')
);

CREATE TRIGGER instagram_manual_posts_updated_at BEFORE UPDATE ON public.instagram_manual_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.instagram_manual_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_manual_posts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.instagram_manual_posts TO authenticated;
CREATE POLICY "Admins manage manual Instagram posts" ON public.instagram_manual_posts
FOR ALL TO authenticated
USING ((SELECT app_private.is_admin())) WITH CHECK ((SELECT app_private.is_admin()));
