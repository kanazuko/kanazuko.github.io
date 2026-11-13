# PRArtJewelry

Catálogo estático creado con React y Vite, publicado en GitHub Pages.

## Desarrollo

```bash
npm install
npm run dev
```

Crea un archivo `.env.local` (ignorado por Git) con las credenciales públicas del proyecto:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
# Opcional, con código de país y solo dígitos:
VITE_WHATSAPP_NUMBER=...
```

## Publicación

Cada `push` a la rama `main` ejecuta el flujo de GitHub Actions y publica `dist/` en GitHub Pages. En el repositorio:

1. Añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en **Settings → Secrets and variables → Actions → Secrets**.
2. Para habilitar el botón de WhatsApp, añade `VITE_WHATSAPP_NUMBER` en **Settings → Secrets and variables → Actions → Variables**. Si no se configura, la interfaz no inventa un número y muestra un aviso neutral.
3. Selecciona **Settings → Pages → Build and deployment → Source → GitHub Actions**.

El frontend usa `HashRouter` para que las rutas funcionen al abrirse o recargarse directamente en GitHub Pages.

Para comprobar la compilación localmente:

```bash
npm run build
npm run preview
```

## Carrito y pedidos

El carrito guarda únicamente identificadores y cantidades en el navegador. Al finalizar, solicita nombre, dirección aproximada, teléfono y correo; no cobra ni solicita tarjetas. El cliente recibe un folio en pantalla. En **Admin → Pedidos** se consulta el detalle y se cambia el estado: pendiente, en compra/preparación, listo para entregar, entregado o cancelado.

Antes de publicar el frontend, aplica `supabase/migrations/20261030120000_add_catalog_orders.sql` al proyecto de Supabase. El botón «Eliminar pedido» también requiere `supabase/migrations/20261113120000_allow_admin_order_deletion.sql`, que permite borrar pedidos solo a administradores y elimina sus partidas en cascada. Con la CLI autenticada y vinculada al proyecto correcto:

```bash
npx supabase db push --dry-run
npx supabase db push
```

También puedes ejecutar el contenido de esa migración en el SQL Editor de Supabase. El esquema anterior debe estar instalado. La migración agrega `orders`, `order_items`, políticas de acceso para administradores y la función pública `place_catalog_order`; no modifica pedidos ni productos existentes.

Los precios, SKU y características se copian del catálogo en una única transacción. Un cambio de precio exige actualizar el carrito antes de enviar. Los agotados o despublicados no se pueden pedir; las piezas sobre pedido sí. Cada solicitud tiene una clave para evitar duplicados al reintentar. Los clientes no tienen lectura directa de los pedidos y los administradores solo pueden cambiar su estado. Los datos de contacto no se guardan en localStorage.

Pruebas de validación, transacciones, reintentos y permisos con PostgreSQL en memoria (PGlite, sin conectar a producción):

```bash
npm test
npm run lint
npm run build
```

Para comprobar también la interfaz con respuestas simuladas, ejecuta `npm run test:browser`. Usa Chrome/Edge instalado localmente; en otro entorno define `BROWSER_PATH` con la ruta a Chromium. Esta prueba bloquea peticiones externas y no guarda pedidos reales ni envía correos.

## Confirmaciones por correo (opcionales)

GitHub Pages aloja el frontend estático. Supabase puede enviar correos a través de una Edge Function y un proveedor externo. Se incluye `supabase/functions/order-confirmation`, pero **el envío permanece desactivado hasta configurar estos pasos**; guardar pedidos no depende del correo.

1. Configura una cuenta de Resend y un dominio/remitente verificado.
2. En los secretos de Edge Functions de Supabase, configura `RESEND_API_KEY`, `ORDER_EMAIL_FROM` (por ejemplo, `PRArtJewelry <pedidos@tu-dominio.com>`) y `ORDER_EMAIL_WEBHOOK_SECRET` (un secreto aleatorio largo). `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables del entorno de Edge Functions. Nunca uses claves privadas con prefijo `VITE_` ni las agregues al repositorio.
3. Publica la función con `npx supabase functions deploy order-confirmation`. Su configuración desactiva la comprobación JWT porque valida su propio secreto de webhook.
4. En **Database → Webhooks**, crea un webhook **INSERT** para `public.orders`, método **POST**, URL `https://<project-ref>.supabase.co/functions/v1/order-confirmation`, timeout de 30000 ms y encabezados `Content-Type: application/json` y `x-order-webhook-secret: <el mismo secreto>`.
5. Crea un pedido de prueba con un correo tuyo. Revisa la entrega en Resend y `email_sent_at` en el pedido. La función lee el pedido confirmado desde la base de datos, no confía en precios ni destinatarios recibidos en el webhook.

Si el proveedor falla, el pedido permanece guardado y el error aparece en los registros del webhook. No hay reintentos automáticos configurados; se puede repetir la invocación autenticada con el mismo evento. La función omite pedidos con `email_sent_at` y usa una clave de idempotencia de Resend, válida durante 24 horas. Si Resend aceptó el correo pero falló el registro del envío, verifica el panel del proveedor antes de reintentar después de ese plazo.

Referencias: [envío de correos con Supabase](https://supabase.com/docs/guides/functions/examples/send-emails), [Database Webhooks](https://supabase.com/docs/guides/database/webhooks), [idempotencia en Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Instagram: verificar conexión (fase 1)

**Nueva etapa:** la sección también incluye borradores, selección de fotos, descripciones, vista previa y preparación de JPEG. Consulta [la guía de borradores y preparación](docs/instagram-drafts.md) para la nueva migración, despliegue, permisos y pruebas. La publicación real sigue bloqueada en el backend.

En **Admin → Instagram** (`/#/admin/instagram`, por el HashRouter) se puede verificar la cuenta `@prartjewelry`. El estado inicial es **Sin verificar**; únicamente una respuesta válida de Meta con esa cuenta muestra **Conectado**. Un fallo limpia la cuenta anterior y muestra **Desconectado · no se pudo confirmar la conexión**; esto no implica que el token necesariamente haya sido revocado. No se publica contenido ni se implementa OAuth o renovación automática en esta fase.

### Endpoint y configuración de Meta

Documentación oficial consultada el **4 de noviembre de 2026**:

- [Unified Login: inicio y obtención de IDs](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started).
- [Autenticación y tokens](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication).
- [Permisos de Unified Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions).

Se utiliza `GET https://graph.facebook.com/v26.0/me/assigned_instagram_accounts?fields=id,username&limit=100`, con el token exclusivamente en `Authorization: Bearer …`. La versión **v26.0** es la que documenta la guía oficial de Unified Login consultada. Se busca `prartjewelry` entre los activos compartidos; la paginación tiene un límite de diez páginas y un plazo total de 15 segundos para Meta. No se siguen las URLs `paging.next` del proveedor ni se devuelven al navegador.

Unified Login utiliza un **Business Integration System User Access Token (SUAT)** y `graph.facebook.com`. `/me` representa al usuario de sistema, no a Instagram. No se usa `graph.instagram.com/me`, no se consulta `/me/accounts` y no se necesita una página de Facebook.

Para esta consulta el permiso documentado es **`instagram_basic`**, no `instagram_business_basic`. Confirma en Meta que el token generado corresponde a Unified Login, que la cuenta autorizada es `@prartjewelry`, que está compartida con la aplicación y que el permiso está concedido. La aplicación debe estar asociada a un portafolio empresarial. Para pruebas con la cuenta propia, verifica el rol de Instagram Tester y la invitación aceptada; Standard Access permite probar con personas con rol en la app. Advanced Access/App Review y modo Live corresponden al acceso de clientes externos.

La guía de Meta indica que su configuración predeterminada incluye otros permisos y marca `instagram_manage_messages` como obligatorio en ese flujo de configuración. Esta implementación solo consulta el endpoint que requiere `instagram_basic`: no agrega permisos, no usa mensajería y no pide permisos de publicación, anuncios o gestión de negocios. No recrees la configuración ya autorizada; si Meta impide una configuración mínima, revisa sus requisitos en el panel antes de ampliarla. Para esta comprobación con un token existente no hace falta añadir callbacks OAuth ni webhooks al sitio.

### Secretos y despliegue

1. En el proyecto Supabase correcto, abre **Edge Functions → Secrets** y guarda manualmente `INSTAGRAM_ACCESS_TOKEN`. No lo pegues en React, `.env.local`, archivos versionados, comandos con historial, capturas ni logs.
2. La función usa las variables de plataforma `SUPABASE_URL` y `SUPABASE_ANON_KEY`. La clave pública del servidor identifica el proyecto; la autorización real es el JWT del usuario. No necesita `SUPABASE_SERVICE_ROLE_KEY`, App Secret ni guardar tokens en PostgreSQL.
3. Desde la raíz del repositorio, con la CLI autenticada y el proyecto ya vinculado, despliega exclusivamente esta función:

   ```bash
   npx supabase functions deploy instagram-status --use-api
   ```

   `--use-api` permite empaquetar en el servidor sin Docker. Si necesitas verificar la vinculación, comprueba el proyecto en `supabase/.temp/project-ref` y compáralo con el Dashboard; para corregirla usa `npx supabase link --project-ref <project-ref>`.

4. Mantén **Verify JWT** habilitado: `supabase/config.toml` declara `verify_jwt = true`. No uses `--no-verify-jwt`. Si el gateway devuelve `Invalid JWT`, revisa la sesión, el proyecto y su configuración de firma siguiendo la [documentación de autenticación de Supabase](https://supabase.com/docs/guides/functions/auth); no desactives la verificación.
5. Ejecuta `npm run dev` para probar el nuevo frontend localmente. Para verlo en GitHub Pages será necesario publicar posteriormente el frontend mediante el flujo habitual del repositorio.

La verificación de conexión de la fase 1 no necesita migraciones ni `supabase db push`; la nueva etapa de borradores sí requiere la migración descrita en su guía. `instagram-status` no tiene dependencias externas: utiliza las APIs estándar de Deno y HTTP. Las pruebas simuladas no demuestran una conexión real.

### Probar con tu administrador

1. Inicia sesión en `/admin/login` con el usuario que ya existe en `public.admin_users`.
2. Entra a **Instagram** y pulsa **Verificar conexión**. El cliente existente de Supabase envía la sesión a `instagram-status`.
3. La función valida el JWT contra Supabase Auth y consulta `public.admin_users` con ese mismo JWT, respetando la política RLS existente. Solo después lee el secreto y consulta Meta.
4. Una respuesta real satisfactoria muestra **Conectado**, `@prartjewelry` y su identificador. La respuesta contiene únicamente `connected`, `account_id`, `username` y `error`. Los errores contienen códigos propios sanitizados; nunca mensajes, cuerpos ni URLs de Meta.
5. Si falta el secreto, el token fue rechazado, faltan permisos o Meta no devuelve la cuenta esperada, se muestra un mensaje específico. Al vencer o revocarse el token, reemplázalo manualmente en Secrets y vuelve a verificar.

Para comprobar rechazos contra la función desplegada, invoca `instagram-status` desde un cliente Supabase sin sesión (debe devolver 401), y luego con una sesión válida de un usuario que no figure en `admin_users` (403). No agregues ese usuario a la tabla para realizar la prueba. El menú protegido no sustituye estas validaciones del backend. El preflight OPTIONS permite CORS, no consulta datos ni llama a Meta.

Verificación local:

```bash
node --test tests/instagram-status.test.js
npm run lint
npm run build
```

Las pruebas de la función simulan Auth, la consulta de membresía y Meta: verifican rechazos antes de llamar a Meta, la cuenta esperada, la sanitización, los errores del proveedor y la paginación segura. No usan el token real ni publican contenido.
