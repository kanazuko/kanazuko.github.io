
-- =========================================================
-- PRArtJewelry - Storage de fotografías
-- =========================================================

-- 1. CREAR BUCKET PÚBLICO
INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880,
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif'
    ]
);


-- 2. PERMITIR LECTURA DE METADATOS A ADMINISTRADORES
CREATE POLICY "Admins read product image objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'product-images'
    AND (SELECT app_private.is_admin())
);


-- 3. PERMITIR SUBIR IMÁGENES A ADMINISTRADORES
CREATE POLICY "Admins upload product images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product-images'
    AND (SELECT app_private.is_admin())
);


-- 4. PERMITIR REEMPLAZAR IMÁGENES
CREATE POLICY "Admins update product images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'product-images'
    AND (SELECT app_private.is_admin())
)
WITH CHECK (
    bucket_id = 'product-images'
    AND (SELECT app_private.is_admin())
);


-- 5. PERMITIR ELIMINAR IMÁGENES
CREATE POLICY "Admins delete product images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'product-images'
    AND (SELECT app_private.is_admin())
);
