# PRArtJewelry — instrucciones de trabajo para Codex

## Alcance y eficiencia
- Trabaja solo en el módulo solicitado. Busca nombres de archivos primero; lee únicamente los fragmentos relevantes. No recorra todo `docs/`, `scripts/`, `tests/`, `dist/` ni `supabase/` por defecto.
- Antes de investigar, consulta `package.json` y los archivos directamente relacionados con la tarea. No releas documentación histórica de Instagram salvo que la solicitud afecte esa integración.
- Evita imprimir archivos completos, volcados JSON, salidas amplias de tests o diffs extensos. Resume solamente errores concretos y rutas relevantes.
- No hagas varias rondas de auditoría, refactorizaciones o infraestructura adicional sin una razón verificable y permiso del usuario.
- No revises información histórica de despliegues para cambios independientes (p. ej. pedidos o catálogo).

## Pruebas progresivas
- Para pedidos: `npm run test:orders`.
- Para cambios de frontend de pedidos, también `npm run lint` y, cuando corresponda, `npm run build`.
- Para Instagram, empieza por el archivo de pruebas específico afectado: `node --test tests/<archivo>.test.js`.
- Ejecuta `npm test` (suite completa) solamente si hay cambios transversales, en contratos comunes o antes de una publicación, o por petición explícita.
- No repitas una prueba ya satisfactoria si el código que cubre no ha cambiado.

## Datos y producción
- Nunca muestres ni almacenes tokens, claves secretas o datos de clientes en el chat o logs.
- Nunca ejecutes migraciones, actualizaciones SQL remotas, llamadas de publicación a Meta, despliegues, commits o pushes sin aprobación explícita.
- Conserva las migraciones históricas aplicadas. Crea migraciones nuevas cuando haga falta; no modifiques las anteriores.
- En operaciones destructivas revisa permisos y consecuencias, e implementa confirmación explícita.
- Un `push` a `main` puede disparar el despliegue automático de GitHub Pages; nunca lo interpretes como un mero envío de código.

## Entrega
- Respuesta breve: archivos cambiados, motivo, pruebas específicas ejecutadas y operaciones pendientes de autorizar.
- Si el usuario pide solo un botón o un ajuste local, evita expandir el trabajo a módulos no implicados.
