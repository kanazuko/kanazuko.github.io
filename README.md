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

Antes de publicar el frontend, aplica `supabase/migrations/20261030120000_add_catalog_orders.sql` al proyecto de Supabase. Con la CLI autenticada y vinculada al proyecto correcto:

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
