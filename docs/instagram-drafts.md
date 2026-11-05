# Instagram: borradores y preparación manual

Consulta también la [auditoría funcional y de seguridad](instagram-audit.md), con evidencia de PostgreSQL Cloud, validación de los archivos públicos y los pasos pendientes antes de publicar.

Esta etapa implementa selección de productos/fotos, orden, descripción, vista previa, guardado y preparación de imágenes con comprobación de acceso a publicación. **No publica contenido.** En su configuración actual, `instagram-publish` permite únicamente una revisión autenticada de la versión preparada (`action=review`); cualquier intento de envío responde `423 PUBLISHING_DISABLED`. No hay una variable de entorno ni un parámetro de petición que quite el bloqueo. El [motor de publicación y sus límites de activación](instagram-publication.md) ya tienen pruebas simuladas y requieren una autorización de prueba concreta en código antes de activarse.

## Preparación y despliegue

Desde la raíz del repositorio y con la CLI autenticada al proyecto Supabase vinculado:

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy instagram-prepare --use-api
npx supabase functions deploy instagram-publish --use-api
```

Revisa el dry-run antes del push. La migración original es `20261104120000_instagram_drafts.sql`; el nuevo registro de progreso se añade en `20261105010000_instagram_publish_progress.sql`. No se modifican migraciones anteriores. Estos comandos **no se ejecutaron contra Cloud durante este desarrollo**. El frontend se prueba con `npm run dev`; publicar el sitio sigue el procedimiento habitual de GitHub Pages.

Mantén `verify_jwt = true` en las tres funciones de Instagram. No uses `--no-verify-jwt`. La función existente `instagram-status` no cambia y no hace falta desplegarla nuevamente.

Secretos del backend:

- `INSTAGRAM_ACCESS_TOKEN`: ya administrado por Supabase. No copiarlo al repositorio, React, historial de comandos ni logs. No se leyó durante el desarrollo.
- `SUPABASE_URL` y `SUPABASE_ANON_KEY`: variables de plataforma para verificar la sesión y la membresía con el JWT del solicitante.
- `SUPABASE_SERVICE_ROLE_KEY`: variable **exclusiva del runtime de Edge Functions**, necesaria en esta etapa para administrar estados y archivos que el navegador no puede escribir. Solo se utiliza después de validar usuario y `admin_users`; nunca se transmite al frontend.

El bucket público `instagram-prepared` y la tabla `instagram_posts` se crean con la migración. El bucket acepta JPEG de hasta 8 MiB. El código Deno fija `jpeg-js@0.4.4` y su integridad en `deno.lock`; el frontend no incorpora esta dependencia.

## Configuración de Meta y comprobación de permisos

Se conserva **Unified Login**, host `graph.facebook.com`, Graph API **v26.0**, y la cuenta exacta `prartjewelry`. Se consulta:

1. `GET /me/assigned_instagram_accounts?fields=id,username&limit=100`: obtiene los activos compartidos por el token SUAT; `/me` no es la cuenta de Instagram.
2. `GET /{instagram-account-id}/content_publishing_limit?fields=config,quota_usage`: comprueba acceso efectivo a esta operación para la cuenta concreta y su cuota disponible. La referencia oficial para **Unified Login** exige **`instagram_basic` e `instagram_content_publish`**. Se exige una respuesta válida y cuota disponible; no basta con que `instagram-status` diga «Conectado».

Si el token actual solo tiene acceso básico, configura `instagram_content_publish` en la configuración de Unified Login, vuelve a autorizar el activo y reemplaza el secreto manualmente. Cambiar la configuración de la app no garantiza que el token anterior reciba nuevos permisos. No hace falta una página de Facebook ni permisos de anuncios, comentarios, mensajes o `pages_*` para estas consultas. No se amplían permisos automáticamente.

La comprobación de cuota verifica acceso actual; no garantiza que una publicación futura sea aceptada por Meta (por ejemplo, podría cambiar el token, la cuota o el estado de la cuenta). La futura operación de publicación deberá repetirla. Los fallos de permisos/token/cuota o respuestas incompletas bloquean la preparación. No se interpreta un error como éxito ni se cambia al flujo antiguo de Instagram Login.

La guía general y algunas referencias de Meta muestran cifras distintas de publicaciones por día. Esta implementación usa **la cuota devuelta para la cuenta**, sin codificar 50 o 100 como límite fijo.

Documentación oficial consultada el 4 de noviembre de 2026:

- [Unified Login: inicio](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started).
- [Publicación de contenido y permisos por tipo de login](https://developers.facebook.com/documentation/instagram-platform/content-publishing).
- [Cuota y permisos de content_publishing_limit](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit).
- [Especificaciones de imágenes y descripciones](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media).

## Flujo para el administrador

1. Abre `/#/admin/instagram` e inicia sesión con tu administrador.
2. Selecciona productos y al menos una fotografía de cada uno. Elige individual (exactamente una foto) o carrusel (2–10 fotos en esta versión; límite propio conservador inferior al máximo documentado de Meta).
3. Ordena las fotos con ↑/↓. Configura la plantilla con `{nombre}`, `{precio}` y `{descripcion}`, genera el texto y edítalo. La plantilla se guarda por borrador; cambiar selección no sobrescribe automáticamente un texto editado.
4. Revisa la vista previa y pulsa **Guardar borrador**. No se consulta Meta ni se suben archivos al guardar. La descripción puede quedar vacía en el borrador, pero debe completarse antes de preparar. Se admiten hasta 2200 caracteres, 30 hashtags y 20 menciones.
5. Pulsa **Preparar imágenes y verificar permisos**. Se comprueba Meta, se convierten las fotos y se verifican las copias públicas. Mientras haya cambios sin guardar no se puede preparar.
6. Revisa las fotos finales en la vista previa, que ahora utiliza los JPEG almacenados y validados. **Publicar en Instagram permanece deshabilitado.**

En un borrador guardado, **Verificar permisos de publicación** consulta cuenta y cuota sin modificar datos ni crear contenedores. Sirve para volver a comprobar el acceso sin limpiar los JPEG. Si el ID de la cuenta cambió respecto de la preparación, la verificación falla. Las URLs multimedia deben ser HTTPS públicas, sin credenciales, firmas ni parámetros de consulta.

Cada borrador guarda IDs y una copia del nombre, precio, descripción y rutas seleccionadas. El contenido no cambia silenciosamente si se edita el catálogo. Para actualizarlo, limpia la preparación, edita y vuelve a guardar/generar el texto. La base de datos comprueba que los IDs existen y que cada foto pertenece a un producto seleccionado. Los precios/descripciones de la copia se leen del catálogo en SQL, no del navegador.

El historial muestra los 50 registros más recientes. Se puede abrir un borrador para consultarlo o editarlo. Los estados y campos reservados de publicación no pueden modificarse directamente desde el navegador. No se implementa borrado de historial que pudiera dejar archivos sin referencia.

## Imágenes, almacenamiento y recuperación

- Se descargan únicamente rutas canónicas del bucket `product-images`, derivadas de las fotos guardadas. Se rechazan rutas con traversal o componentes de URL externos. No se aceptan URLs proporcionadas por el cliente en la Edge Function.
- El navegador convierte JPEG, PNG, WebP o AVIF que pueda decodificar mediante canvas sRGB a **JPEG 1080 × 1080**, con fondo blanco, ajustando la pieza completa sin recortarla. Los originales se conservan. La previsualización inicial aproxima esta composición; la final muestra el archivo real.
- Cada JPEG se envía individualmente al backend: no se envía WebP/AVIF a Meta. El backend limita la lectura a 8 MiB, decodifica los píxeles con límites de memoria/resolución, exige 1080 × 1080 y vuelve a codificar JPEG sin EXIF, comentarios ni perfiles ajenos. No confía en extensión, MIME ni dimensiones declaradas.
- La relación 1:1, ancho 1080 y tamaño ≤8 MiB están dentro de las especificaciones documentadas (JPEG, relación entre 4:5 y 1.91:1). Todas las fotos del carrusel tienen la misma geometría.
- Las rutas `instagram-prepared/{draft-id}/{revision}/{image-id}.jpg` se registran **antes** de subir. Las copias son públicas porque Meta debe descargarlas sin autenticación. No contienen tokens ni datos personales administrativos. El navegador no tiene políticas INSERT/UPDATE/DELETE en ese bucket.
- Las cargas no sobrescriben archivos. Se registra SHA-256 y se comprueba una descarga pública sin autorización antes de declarar la preparación completa.
- Un borrador preparado queda bloqueado para edición. **Limpiar preparación y editar** elimina únicamente las rutas registradas, invalida la comprobación de permisos y aumenta la revisión.
- Si una carga falla después de haber sido aceptada por Storage, el manifiesto permite encontrarla y limpiarla. Si falla la limpieza, se conserva el manifiesto y se muestra `cleanup_failed`; no se olvida la ruta.
- Si cierras el navegador entre fotos, vuelve a abrir el borrador y usa **Continuar preparación**, o limpia. Si una Edge Function queda interrumpida en `uploading`/`cleaning`, espera **10 minutos** y limpia para recuperar el bloqueo. No hay una tarea automática que elimine activos de borradores abandonados: permanecen vinculados al historial hasta la limpieza manual.

## Seguridad y concurrencia

- Auth verifica el JWT en servidor; se rechazan sesiones anónimas y usuarios fuera de `public.admin_users` antes de leer secretos o realizar operaciones privilegiadas. Se mantiene la comprobación JWT del gateway.
- RLS restringe la lectura del historial a administradores. La escritura desde el cliente se realiza solo por `save_instagram_draft`, con autorización administrativa explícita, validación de IDs, bloqueo transaccional y revisión esperada. Un reintento idéntico tras perder una respuesta no crea otro borrador.
- Estados, manifiestos, IDs de Meta y fechas de publicación son de gestión exclusiva del backend. Las transiciones usan comparación atómica de ID/revisión/estado/fecha; dos solicitudes simultáneas no adquieren el mismo trabajo.
- Las rutas desplegables solo permiten solicitudes **GET** a Meta. El motor aislado contiene las futuras operaciones POST, pero ninguna petición al endpoint puede ejecutarlas. Se rechazan redirecciones; los tokens van en encabezados, nunca en query strings, respuestas o logs. Los errores se traducen a códigos propios. React muestra el texto como texto, sin HTML inyectado.
- El botón deshabilitado es informativo: el bloqueo real está también en `instagram-publish`, que devuelve 423 incluso si alguien manipula el navegador o envía `confirmed: true`.

## Etapa posterior: publicación explícita

El motor aislado implementa creación de contenedores, consulta de su estado y `POST /{account-id}/media_publish`, con pruebas que simulan toda la red. **No hay un motor de publicación activo u oculto tras un flag en esta entrega.** El endpoint no lo invoca. Consulta [publicación y activación](instagram-publication.md) antes de habilitar una prueba real.

El esquema reserva `container_id`, `publish_attempt_id` único, `publish_started_at`, `instagram_id` único, `instagram_url`, `published_at`, `publish_unknown` y estados de resultado. Antes de habilitar el envío se necesita:

1. Confirmación explícita del administrador sobre la versión preparada y la cuenta destino.
2. Reserva atómica de un intento, nueva comprobación de permisos/cuota/integridad y creación de contenedores con sus IDs persistidos.
3. Comprobar `FINISHED` antes de publicar y manejar `IN_PROGRESS`, `ERROR`, `EXPIRED` y `PUBLISHED`.
4. Ante un timeout de `media_publish`, conservar el intento como resultado incierto y conciliar con Meta; no repetir a ciegas ni desbloquear el borrador para otro envío.

## Verificación local

```bash
npm run lint
npm run build
npm test
npm run test:instagram-browser
npx --yes --package deno deno check --config supabase/functions/instagram-prepare/deno.json supabase/functions/instagram-prepare/index.ts supabase/functions/instagram-publish/index.ts
npx --yes --package deno deno test --config supabase/functions/instagram-prepare/deno.json supabase/functions/instagram-prepare/jpeg-check.ts
```

Las pruebas de PostgreSQL usan PGlite en memoria. Las pruebas de funciones sustituyen todas las llamadas HTTP. La prueba de navegador intercepta toda la red externa y verifica selección, orden, plantilla, guardado, conversión real de WebP a JPEG, preparación, bloqueo de publicación y diseño móvil. La prueba Deno decodifica/re-encodea JPEG reales sintéticos y rechaza contenido falso, tamaños incorrectos y resolución excesiva. Ninguna de estas pruebas demuestra que el token real tenga permiso de publicación; eso se comprobará al preparar desde tu sesión después del despliegue.
