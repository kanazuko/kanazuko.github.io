# Kanazuko Joyería

Catálogo estático creado con React y Vite, publicado en GitHub Pages.

## Desarrollo

```bash
npm install
npm run dev
```

## Publicación

Cada `push` a la rama `main` ejecuta el flujo de GitHub Actions y publica `dist/` en GitHub Pages. En el repositorio, habilita una vez **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Para comprobar la compilación localmente:

```bash
npm run build
npm run preview
```
