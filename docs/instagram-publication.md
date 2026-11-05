# Motor de publicación: implementación sin activación

Actualizado el 5 de noviembre de 2026. El administrador confirmó mediante la interfaz que Meta devolvió acceso y cuota para @prartjewelry, ID `17841465479111585`. Ese resultado corresponde al momento de la consulta; se vuelve a verificar antes del futuro envío.

## Qué puedes hacer ahora

No necesitas agregar permisos ni crear una página de Facebook para continuar esta etapa. Puedes desplegar los cambios siguientes y revisar un borrador preparado. **El despliegue no habilita publicaciones.** No se aplicaron migraciones remotas, despliegues, commits ni pushes durante este desarrollo.

Desde la raíz del proyecto vinculado:

```bash
npx supabase db push --dry-run
```

Revisa que las migraciones pendientes sean las esperadas. La nueva de esta entrega es `20261105010000_instagram_publish_progress.sql`; añade un objeto JSON de progreso, sin cambiar RLS, grants ni migraciones aplicadas. Después:

```bash
npx supabase db push
npx supabase functions deploy instagram-publish --use-api
npm run dev
```

No uses `--no-verify-jwt`. No hace falta reemplazar el secreto Meta ni desplegar nuevamente `instagram-status` o `instagram-prepare` por estos cambios. Para el sitio público, publica el frontend por el procedimiento habitual de GitHub Pages.

En `/#/admin/instagram`, abre un registro preparado y pulsa **Revisar antes de publicar**. Verás cuenta, ID, revisión, número de imágenes y texto obtenidos desde PostgreSQL a través de la función autenticada. Revisa las fotografías y su orden en la vista previa. La casilla es una revisión local; no guarda consentimiento ni activa el envío. El botón de publicación permanece deshabilitado.

## Implementación y seguridad

- `instagram-publish/index.ts` configura `createPublishHandler(null)`: ninguna prueba autorizada. El handler valida sesión y membresía administrativa antes de consultar PostgreSQL. En esta configuración solo admite revisión de una versión preparada sin intento anterior; el resto devuelve 423. Ningún campo enviado por React puede habilitar el motor. Las acciones `start`, `continue` y `reconcile` están implementadas y probadas con una autorización simulada.
- `engine.ts` implementa pasos acotados: reserva atómica, verificación pública de JPEG/hash y cuenta/cuota, creación individual o de hijos de carrusel, comprobación `FINISHED` de cada hijo, creación del padre, estado final, envío y recuperación del enlace. Usa `graph.facebook.com/v26.0`, con token exclusivamente en Authorization. Se mantienen los permisos Unified Login `instagram_basic` e `instagram_content_publish`.
- La confirmación futura debe incluir el digest de ID, revisión, cuenta, formato, descripción y manifiesto ordenado. Es un control de versión, no una credencial ni sustituto de Auth.
- Un intento único queda reservado antes de contactar Meta. Cada operación adquiere un bloqueo mediante comparación de revisión, estado y `updated_at`. Los IDs de hijos quedan persistidos antes de crear el padre. No se vuelve a usar un borrador con intento previo.
- Antes de `media_publish`, se persiste `publish_unknown`. Una caída, timeout o respuesta inválida no permite volver a enviar. Un error de creación también bloquea el intento: puede existir un contenedor cuyo ID se perdió. No se crean reemplazos automáticamente.
- Una respuesta exitosa persiste ID y fecha antes de buscar el permalink. Si falla esa lectura, puede repetirse solo el GET de metadatos. Se admite únicamente un enlace HTTPS de Instagram sin credenciales ni parámetros. Una advertencia de publicación parcial se conserva; no se interpreta como motivo para publicar de nuevo.
- El polling de cada contenedor exige al menos un minuto entre consultas y permite hasta cinco consultas en ese ciclo. Una revisión final de `FINISHED` precede al envío. `ERROR`, `EXPIRED`, respuestas inesperadas o agotamiento requieren revisión.
- Los JPEG se conservan vinculados al historial. El motor no altera originales ni elimina imágenes. RLS y los permisos existentes impiden que React modifique el registro de progreso.

## Límites de recuperación

No se promete entrega exactamente una vez entre PostgreSQL y Meta: no comparten una transacción. Se prioriza evitar reenvíos ambiguos. Si se pierde una respuesta de escritura o el proceso termina con un bloqueo activo, se requiere revisión del intento; no hay recuperación automática que cree contenedores o publique de nuevo.

La conciliación implementada solo consulta el estado del contenedor conocido. `PUBLISHED` confirma que Meta lo publicó, pero no proporciona aquí un ID multimedia verificable: se guarda `PUBLISHED_ID_UNRESOLVED` y no se inventa un permalink ni se busca por descripción. `FINISHED` tras un timeout tampoco autoriza un reenvío. La recuperación de ID perdido y el desbloqueo de intentos fallidos requieren un procedimiento administrativo adicional, con evidencia de Meta. No copiar el borrador para reintentar un resultado incierto.

## Qué falta antes de una prueba real

1. Seleccionar y autorizar expresamente un borrador concreto, con sus imágenes, texto y cuenta destino.
2. Con esa autorización, reemplazar exclusivamente el `null` de `createPublishHandler(null)` por un objeto con `id`, `revision` y `account_id` del borrador autorizado. No cambiar la verificación JWT ni aceptar estos datos como autorización desde el cliente. El motor y los controles del frontend ya están implementados; el servidor solo devolverá `publishing_enabled: true` para esa versión exacta.
3. Mantener el resto bloqueado y volver a ejecutar las pruebas de autorización y concurrencia del endpoint integrado. Definir cómo se revisarán manualmente los estados inciertos antes de esa prueba.
4. Desplegar esa activación revisada. Abrir y revisar el borrador, marcar la casilla y pulsar **Publicar en Instagram**; aparece una segunda confirmación explícita. Esto reserva el intento y comprueba imágenes/acceso/cuota. **Continuar intento confirmado** ejecuta un paso acotado cada vez: contenedores, consultas, envío y enlace. Si el contenedor sigue procesándose, esperar un minuto antes de continuar. No hay bucles de reintento de escrituras.
5. Verificar el resultado en historial y en Instagram. Ante un resultado incierto, usar **Consultar resultado sin reenviar** y detener la prueba para revisión; no crear un duplicado. Al terminar, retirar la autorización de prueba restaurando `null` y desplegar nuevamente la función.

## Verificación ejecutada

- `npm run lint` y `npm run build` correctos.
- `npm test`: 50 pruebas correctas, incluyendo endpoint integrado con autorización simulada, concurrencia de reserva, individual/carrusel ordenado, respuestas perdidas, recuperación de metadatos, cuenta cambiada, integridad, bloqueo de publicación, revisión autenticada y migración/RLS en PGlite.
- `npm run test:instagram-browser`: correcto, con revisión de la versión guardada, casilla sin envío, publicación bloqueada, fotos reales renderizadas y conversión JPEG. Toda la red externa interceptada.
- `npx --yes --package deno deno check --config supabase/functions/instagram-prepare/deno.json supabase/functions/instagram-publish/index.ts`: correcto.

Estas pruebas no crean contenedores ni validan una publicación real. No se leyó el secreto Meta. La revisión manual del código comprobó que la configuración desplegable bloquea el motor, que la autorización precede al acceso privilegiado y que no se introducen credenciales en React ni logs.

Referencias oficiales consultadas: [publicación y requisitos Unified Login](https://developers.facebook.com/documentation/instagram-platform/content-publishing), [media_publish y respuestas parciales](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media_publish). La referencia de media_publish contiene requisitos del login anterior; se usa la tabla específica de Unified Login de la guía para permisos y tipo de token, sin agregar requisitos de páginas.
