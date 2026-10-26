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
