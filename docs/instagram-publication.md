# Publicación manual en producción

El propietario autorizó el 5 de noviembre de 2026 publicar cualquier borrador preparado en **@prartjewelry**, cuenta `17841465479111585`. Ya no hay restricción por ID de borrador ni revisión de prueba. Se mantiene la confirmación explícita de cada contenido y el acceso exclusivo de administradores.

## Cómo publicar

1. Abre `/#/admin/instagram` con tu sesión administrativa.
2. Guarda y prepara el contenido. La preparación convierte y verifica los JPEG y comprueba acceso/cuota; no crea contenedores en Meta.
3. Pulsa **Revisar antes de publicar**. Comprueba todas las fotografías, su orden y la descripción. Marca **He revisado las fotografías, su orden y la descripción**.
4. Pulsa **Publicar en Instagram** y acepta la confirmación. Esto reserva un intento para la versión revisada y comprueba nuevamente archivos, cuenta y permisos.
5. Pulsa **Continuar intento confirmado** para avanzar los pasos: crear contenedores, consultar su estado, enviar y recuperar el enlace. Cada clic ejecuta un paso; no hay reintentos automáticos de escrituras. Si Meta sigue procesando una imagen, espera un minuto entre consultas.
6. El historial mostrará el resultado. Al completarse, abre **Ver publicación en Instagram**.

La casilla por sí sola no publica. Si ya la habías marcado antes del despliegue, vuelve a pulsar **Revisar antes de publicar** para obtener el estado actual del servidor y márcala nuevamente. El contenido debe estar preparado y sin modificaciones pendientes.

Las descripciones se envían literalmente como texto, sin interpretar Markdown. Revisa asteriscos y barras antes de confirmar si no quieres que formen parte del texto.

## Despliegue y comprobación

La función de entrada configura `createPublishHandler({ account_id: '17841465479111585' })`. La política vive exclusivamente en el servidor. Ningún parámetro del navegador puede habilitar otra cuenta.

```bash
npx supabase functions deploy instagram-publish --use-api
```

Conserva `verify_jwt = true`. No cambies ni copies el secreto Meta. La comprobación de Cloud confirmó que `publish_progress` existe, RLS está activo y `authenticated` no puede actualizar directamente el historial. Esta activación no necesita una migración adicional.

Para usar los textos actualizados localmente:

```bash
npm run dev
```

El frontend público requiere el despliegue habitual de GitHub Pages. No se hicieron commits ni pushes automáticos. El frontend anterior que ya tenía revisión y confirmación puede obtener `publishing_enabled: true` al repetir la revisión, aunque sus textos antiguos hablen de pruebas.

## Controles conservados

- Supabase Auth y `admin_users` se comprueban antes del acceso privilegiado. La política de producción verifica el ID de la cuenta; Meta verifica además el username y acceso efectivo.
- Confirmación ligada al digest de ID, revisión, cuenta, formato, descripción y manifiesto ordenado. El digest no sustituye la sesión ni los permisos.
- Reserva atómica del intento y bloqueos por revisión, estado y fecha. No se puede iniciar otro envío del mismo registro después de reservarlo.
- JPEG públicos HTTPS verificados por tamaño y SHA-256, conservando originales. Cuenta, cuota y acceso se verifican nuevamente antes del envío.
- Los hijos del carrusel se guardan y se comprueba `FINISHED` antes de crear el padre. El contenedor final debe estar listo antes de publicar.
- Unified Login, `graph.facebook.com/v26.0`, permisos `instagram_basic` e `instagram_content_publish`. Tokens exclusivamente en encabezados del backend; sin logs ni credenciales en React.
- Antes de `media_publish` se persiste `publish_unknown`. Un timeout, respuesta perdida o error no desencadena otro envío automático.
- El ID multimedia y la fecha se guardan antes de consultar el permalink. Un fallo de metadatos permite repetir solo su lectura, sin volver a publicar.

## Errores y recuperación

### Eliminar borradores

**Eliminar borrador** está disponible en el editor y en el historial para registros sin intentos de publicación. Pide confirmación, limpia primero los JPEG preparados y luego elimina el registro de PostgreSQL. Conserva las fotografías originales del catálogo. Si la limpieza falla, mantiene el registro y sus rutas para poder reintentar; una operación activa no puede eliminarse hasta que su bloqueo venza (10 minutos). Los registros publicados, en publicación o con resultados inciertos se conservan y no admiten esta eliminación.

Esta operación requiere desplegar `instagram-prepare` actualizado:

```bash
npx supabase functions deploy instagram-prepare --use-api
```

No requiere migraciones ni cambios en RLS. El editor y el historial usan todo el ancho de sus secciones, con acciones apiladas en pantallas pequeñas.

Si aparece **Resultado por conciliar**, usa **Consultar resultado sin reenviar**. Si Meta informa `PUBLISHED` pero se perdió el ID multimedia, el intento queda para revisión manual; no se inventa el enlace ni se vuelve a enviar. `FINISHED` después de un timeout tampoco es permiso para repetir la publicación.

No copies un borrador con resultado incierto para volver a intentarlo: sería un registro distinto y podría duplicar contenido. La prevención de duplicados cubre el mismo intento, no publicaciones nuevas creadas deliberadamente con las mismas fotos.

Las respuestas perdidas al crear contenedores, procesos interrumpidos con bloqueo activo y errores no conciliables requieren revisión administrativa. PostgreSQL y Meta no comparten una transacción; no se promete entrega exactamente una vez. Los contenedores conocidos quedan registrados. El polling admite hasta cinco consultas por ciclo, separadas al menos un minuto. No se hacen reintentos ciegos al agotar el ciclo.

Para suspender nuevos envíos, configurar `createPublishHandler(null)` y desplegar la función. Esto no elimina contenido ya publicado ni revierte operaciones en curso.

## Verificación de esta activación

- `npm run lint`, `npm run build`: correctos.
- `npm test`: 51 pruebas correctas. Incluyen el entrypoint de producción con dos borradores distintos, rechazo de otra cuenta, usuarios no autorizados, confirmación requerida, concurrencia, carrusel y fallos parciales.
- `npm run test:instagram-browser`: correcto; revisión habilita el botón solo después de marcar la casilla, y cancelar la confirmación no envía ninguna petición.
- Comprobación Deno del entrypoint: correcta.
- `scripts/check-instagram-production.sql`: consulta de solo lectura para verificar esquema y permisos en Cloud.

Las pruebas sustituyen todas las escrituras a Meta. No se leyó el secreto ni se crearon contenedores o publicaciones durante el desarrollo. La primera publicación real debe comprobarse desde el panel y en Instagram; estas pruebas no demuestran que Meta haya publicado contenido.

Referencias oficiales: [publicación y requisitos Unified Login](https://developers.facebook.com/documentation/instagram-platform/content-publishing), [media_publish](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media_publish).
