-- Instagram drafts and tracked public derivatives. Originals are never modified.
CREATE TABLE public.instagram_posts (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  mode text NOT NULL CHECK (mode IN ('single', 'carousel')),
  product_ids uuid[] NOT NULL,
  image_ids uuid[] NOT NULL,
  products jsonb NOT NULL,
  images jsonb NOT NULL,
  caption text NOT NULL CHECK (char_length(caption) <= 2200),
  template text NOT NULL CHECK (char_length(template) <= 4000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'preparing', 'uploading', 'prepared', 'preparation_failed',
    'cleaning', 'cleanup_failed', 'publishing', 'publish_unknown', 'published', 'publish_failed'
  )),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  prepared_images jsonb NOT NULL DEFAULT '[]',
  permission_checked_at timestamptz,
  instagram_account_id text,
  instagram_id text UNIQUE,
  instagram_url text,
  container_id text,
  publish_attempt_id uuid UNIQUE,
  publish_started_at timestamptz,
  published_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(product_ids) BETWEEN 1 AND 10),
  CHECK ((mode = 'single' AND cardinality(image_ids) = 1)
    OR (mode = 'carousel' AND cardinality(image_ids) BETWEEN 2 AND 10))
);
CREATE INDEX instagram_posts_created ON public.instagram_posts(created_at DESC);
CREATE TRIGGER instagram_posts_updated BEFORE UPDATE ON public.instagram_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_posts FROM anon, authenticated;
GRANT SELECT ON public.instagram_posts TO authenticated;
GRANT ALL ON public.instagram_posts TO service_role;
CREATE POLICY "Admins read Instagram history" ON public.instagram_posts
FOR SELECT TO authenticated USING ((SELECT app_private.is_admin()));

-- All browser writes go through this guarded RPC. Provider/state fields are server-only.
CREATE FUNCTION public.save_instagram_draft(
  p_id uuid, p_revision integer, p_mode text, p_product_ids uuid[], p_image_ids uuid[],
  p_caption text, p_template text
) RETURNS public.instagram_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing public.instagram_posts;
  v_products jsonb;
  v_images jsonb;
  v_result public.instagram_posts;
BEGIN
  IF NOT (SELECT app_private.is_admin()) THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL OR p_revision IS NULL OR p_mode IS NULL OR p_caption IS NULL OR p_template IS NULL
    OR p_product_ids IS NULL OR p_image_ids IS NULL
    OR cardinality(p_product_ids) NOT BETWEEN 1 AND 10
    OR cardinality(p_image_ids) NOT BETWEEN 1 AND 10
    OR char_length(p_caption) > 2200 OR char_length(p_template) > 4000
    OR p_mode NOT IN ('single', 'carousel')
    OR (p_mode = 'single' AND cardinality(p_image_ids) <> 1)
    OR (p_mode = 'carousel' AND cardinality(p_image_ids) < 2)
    OR cardinality(p_product_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_product_ids) x)
    OR cardinality(p_image_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_image_ids) x)
  THEN RAISE EXCEPTION 'INVALID_DRAFT'; END IF;

  -- Serializes saves/retries for this draft ID, including the first insert.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  SELECT * INTO v_existing FROM public.instagram_posts WHERE id = p_id FOR UPDATE;
  IF FOUND THEN
    -- A lost response may be retried with identical input without duplicating a draft.
    IF v_existing.mode = p_mode AND v_existing.product_ids = p_product_ids AND v_existing.image_ids = p_image_ids
      AND v_existing.caption = p_caption AND v_existing.template = p_template
      AND v_existing.status = 'draft' AND v_existing.revision = p_revision + 1 THEN RETURN v_existing; END IF;
    IF v_existing.status <> 'draft' OR v_existing.revision <> p_revision THEN RAISE EXCEPTION 'DRAFT_CONFLICT'; END IF;
  ELSIF p_revision <> 0 THEN RAISE EXCEPTION 'DRAFT_CONFLICT'; END IF;

  SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'price', p.price, 'description', p.description) ORDER BY s.ord)
    INTO v_products FROM unnest(p_product_ids) WITH ORDINALITY s(id, ord) JOIN public.products p ON p.id = s.id;
  SELECT jsonb_agg(jsonb_build_object('id', i.id, 'product_id', i.product_id, 'storage_path', i.storage_path, 'alt_text', i.alt_text) ORDER BY s.ord)
    INTO v_images FROM unnest(p_image_ids) WITH ORDINALITY s(id, ord) JOIN public.product_images i ON i.id = s.id
    WHERE i.product_id = ANY(p_product_ids)
      AND i.storage_path LIKE 'products/' || i.product_id::text || '/%'
      AND i.storage_path !~ '(^|/)\.\.(/|$)';
  IF coalesce(jsonb_array_length(v_products), 0) <> cardinality(p_product_ids)
    OR coalesce(jsonb_array_length(v_images), 0) <> cardinality(p_image_ids)
    OR EXISTS (SELECT 1 FROM unnest(p_product_ids) p WHERE NOT EXISTS (
      SELECT 1 FROM public.product_images i WHERE i.id = ANY(p_image_ids) AND i.product_id = p
    )) THEN RAISE EXCEPTION 'INVALID_SELECTION'; END IF;

  INSERT INTO public.instagram_posts (id, created_by, mode, product_ids, image_ids, products, images, caption, template)
  VALUES (p_id, auth.uid(), p_mode, p_product_ids, p_image_ids, v_products, v_images, p_caption, p_template)
  ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, product_ids = EXCLUDED.product_ids,
    image_ids = EXCLUDED.image_ids, products = EXCLUDED.products, images = EXCLUDED.images,
    caption = EXCLUDED.caption, template = EXCLUDED.template, revision = instagram_posts.revision + 1,
    error_code = NULL
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_instagram_draft(uuid, integer, text, uuid[], uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_instagram_draft(uuid, integer, text, uuid[], uuid[], text, text) TO authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('instagram-prepared', 'instagram-prepared', true, 8388608, ARRAY['image/jpeg']);
-- Public downloads are needed by Meta. There are deliberately no browser write/delete policies.
CREATE POLICY "Admins read prepared image metadata" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'instagram-prepared' AND (SELECT app_private.is_admin()));
