# Auditoría funcional y de seguridad de Instagram

Fecha: 4 de noviembre de 2026, America/Mexico_City. Descargas verificadas el 5 de noviembre a las 05:30 UTC. Alcance: código local, PostgreSQL Cloud en modo de solo lectura, metadatos de funciones desplegadas y descargas públicas de Storage. No se consultaron secretos ni se crearon contenedores/publicaciones en Meta.

**Resultado: la preparación tiene evidencia real de funcionamiento; la publicación aún no se puede habilitar.** Falta implementar el motor de envío, la confirmación vinculada al contenido y la conciliación de resultados inciertos. El endpoint de publicación continúa devolviendo `423 PUBLISHING_DISABLED` después de autenticar y autorizar.

## Evidencia en Supabase Cloud

Consultas realizadas con el CLI del proyecto vinculado, mediante `BEGIN READ ONLY`:

| Comprobación | Resultado observado |
| --- | --- |
| Tabla `instagram_posts` y RPC `save_instagram_draft` | Existen |
| Registros persistidos | **2**, ambos en estado `prepared` |
| Manifiestos de preparación | **3 rutas**, completas para los registros preparados |
| Archivos en `instagram-prepared` | **3**, todos vinculados a un manifiesto |
| Archivos sin referencia en ese bucket | **0** en el momento de la auditoría |
| Originales referenciados en `product-images` | **3**, siguen presentes |
| RLS en historial | Habilitado |
| Acceso anónimo a historial/RPC | Sin privilegios SELECT/EXECUTE |
| Rol authenticated | SELECT bajo RLS y ejecución del RPC; sin INSERT/UPDATE/DELETE directos |
| Políticas de escritura en Storage | Limitadas a `product-images` para administradores; no permiten escribir las copias preparadas desde el navegador |
| Funciones de Instagram desplegadas | `instagram-status`, `instagram-prepare`, `instagram-publish`: ACTIVE, versión 1, `verify_jwt = true` |
| Identificadores de publicación en el historial | **0** |

Los borradores no son solo estado de React: el RPC inserta/actualiza PostgreSQL y la preparación modifica esos mismos registros desde el backend. La existencia de dos registros preparados se comprobó directamente en Cloud. No se crearon ni editaron registros Cloud durante esta auditoría; el ciclo guardar/recuperar/editar se ejercitó en PostgreSQL local (PGlite) y en navegador con respuestas simuladas.

## Multimedia real

Se descargaron los tres archivos preparados por su URL HTTPS de `/storage/v1/object/public/instagram-prepared/…`, sin API key, Authorization, cookies ni parámetros de firma. Todas las respuestas fueron HTTP 200, `image/jpeg`, sin redirecciones. Se decodificaron sus píxeles y se comparó SHA-256 con PostgreSQL.

| Archivo de la muestra | Bytes | Dimensiones | SHA-256 |
| --- | ---: | --- | --- |
| 1 | 72,738 | 1080 × 1080 | Coincide |
| 2 | 80,146 | 1080 × 1080 | Coincide |
| 3 | 99,543 | 1080 × 1080 | Coincide |

Son JPEG 1:1, muy por debajo del límite de 8 MiB. Sus URLs no son firmadas ni tienen una caducidad en parámetros. La disponibilidad depende de conservar los objetos, no de renovar una firma.

La implementación escribe exclusivamente copias nuevas en `instagram-prepared`: convierte en canvas sRGB, decodifica en backend con límites de memoria/resolución y vuelve a codificar píxeles JPEG sin metadatos. No hay escrituras sobre `product-images` en este flujo. Los originales siguen presentes, pero no se dispone de un hash anterior a la preparación para certificar históricamente que nunca cambiaron por otras operaciones.

## Hallazgos corregidos

1. **HTTPS no era una condición explícita.** Las URLs se construían desde la configuración de Supabase. Ahora frontend y backend rechazan HTTP, credenciales embebidas, query strings, fragmentos y rutas de Storage que no sean públicas. La preparación requiere un origen Cloud HTTPS; un Storage local HTTP no es apto para esta integración.
2. **La vista previa podía priorizar el catálogo actual sobre el borrador guardado.** Ahora un borrador abierto usa sus fotografías guardadas y su orden; al editar usa la selección actual. La descripción se muestra exactamente como texto, sin interpretar HTML. La prueba de navegador cambia el catálogo entre guardado y reapertura y comprueba que la foto del borrador no cambie silenciosamente.
3. **No había una comprobación de permisos independiente de preparar/limpiar.** Se añadió **Verificar permisos de publicación**, acción `check` autenticada de `instagram-prepare`. Solo hace lecturas; no actualiza el borrador, no toca Storage ni crea contenedores. Comprueba cuenta y cuota, y rechaza un ID distinto del registrado en la preparación. La finalización de preparación también rechaza un cambio de cuenta.

Estas correcciones están en el repositorio y **todavía no se desplegaron**. No se modificaron migraciones aplicadas y no se necesita una nueva para estas correcciones.

## Cuenta y permisos: qué se pudo confirmar

El backend usa `graph.facebook.com/v26.0`, `GET /me/assigned_instagram_accounts?fields=id,username` y `GET /{account-id}/content_publishing_limit?fields=config,quota_usage`. Exige el username exacto `prartjewelry`; `/me` no se trata como la cuenta de Instagram. La consulta de cuota exige `instagram_basic` e `instagram_content_publish` para **Unified Login**, según la [referencia oficial consultada](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit).

Los dos registros Cloud tienen el mismo ID de cuenta y una fecha de comprobación de acceso. La última registrada es **2026-11-05 02:06:18.734 UTC**. Esto es evidencia histórica de preparación, no una consulta actual a Meta realizada por esta auditoría.

**No se verificó directamente ahora el username o la vigencia de permisos del token real.** No se dispuso de una sesión administrativa del frontend para invocar las funciones como ese usuario y no se leyó el token ni se fabricó una sesión. La confirmación actual debe hacerse con **Verificar conexión** y el nuevo botón de permisos después de desplegar. Un token vigente al preparar puede caducar o perder permisos antes de publicar.

## Autorización, duplicados y errores parciales

- Las Edge Functions verifican la sesión con Supabase Auth, rechazan usuarios anónimos y comprueban `public.admin_users` usando el JWT del solicitante. Solo después acceden al secreto o a operaciones privilegiadas. La service role permanece exclusivamente en el runtime.
- RLS y los privilegios observados en Cloud limitan la lectura a administradores y bloquean cambios directos de estados, hashes e IDs de Instagram desde React. El RPC administrativo valida pertenencia de las fotografías y guarda copias de los datos del catálogo.
- Los reintentos de un guardado idéntico conservan el ID del borrador. Revisiones y comparaciones atómicas de estado/fecha evitan sobrescribir trabajos concurrentes. Son controles para **borradores y preparación**, no una garantía de publicación exactamente una vez.
- Cada ruta se registra antes de subir. Un fallo parcial conserva el manifiesto; **Limpiar preparación y editar** elimina solo esas copias. Si falla la limpieza conserva las rutas y `cleanup_failed`. Los bloqueos interrumpidos se recuperan después de diez minutos. No hay limpieza automática de borradores abandonados: los archivos permanecen vinculados hasta que el administrador los limpie.
- Las respuestas no incluyen tokens, URLs firmadas ni mensajes crudos de Meta. Las solicitudes con credenciales rechazan redirecciones. Las URLs de paginación de Meta no se siguen directamente.
- **Pendiente crítico antes de publicar:** los campos únicos `publish_attempt_id` e `instagram_id` por sí solos no evitan repetir una llamada a Meta después de un timeout. Falta la reserva transaccional del intento, persistir los contenedores antes de avanzar y conciliar `publish_unknown` antes de permitir otro intento. Actualmente no hay POST a Meta y la publicación está bloqueada tanto en UI como en backend.

## Pruebas ejecutadas

- `npm run lint`: correcto.
- `npm run build`: correcto.
- `npm test`: **39 pruebas correctas**, con PostgreSQL PGlite, políticas RLS, autorización, concurrencia, manifiestos, fallos parciales y bloqueo de publicación.
- `npm run test:instagram-browser`: correcto. Guardar → recargar → recuperar → editar → guardar → recargar; contenido de descripción; fotos cargadas (`naturalWidth > 0`); orden; foto guardada frente a cambios del catálogo; JPEG final 1080; navegación del carrusel; verificación de acceso sin mutaciones; botón de publicación deshabilitado; diseño móvil. Toda la red externa se simuló en esta prueba.
- `deno check`: correcto para las funciones y el verificador de multimedia pública.
- Prueba Deno de JPEG: correcta con decodificación real y rechazo de formato, dimensiones o resolución inválidos.
- Consultas reales Cloud y tres descargas públicas reales: resultados detallados arriba.

No se probaron creación de contenedores, descarga desde los servidores de Meta, aceptación de publicaciones ni recuperación de un timeout real de `media_publish`, porque están fuera de la autorización actual. Las pruebas de acceso negativo de usuarios se ejecutaron localmente; en Cloud se inspeccionaron sus políticas/privilegios y la configuración JWT.

## Pasos para la primera publicación de prueba

1. Desplegar las correcciones de preparación al proyecto ya vinculado:

   ```bash
   npx supabase functions deploy instagram-prepare --use-api
   npm run dev
   ```

   No hace falta ejecutar `db push` para esta auditoría. El frontend actualizado puede probarse localmente contra Cloud; para GitHub Pages debe publicarse posteriormente mediante el flujo habitual, de forma manual.

2. Con el administrador real, abrir `/#/admin/instagram` y pulsar **Verificar conexión**: debe devolver `@prartjewelry`. Abrir uno de los borradores preparados y pulsar **Verificar permisos de publicación**: debe informar cuenta, ID, fecha y cuota disponibles, sin cambiar el borrador. Si falla, resolver el permiso/token/activo indicado; no quitar JWT/RLS para superarlo.
3. Verificar en ese navegador todas las fotos, orden y descripción. Elegir un único borrador para la primera prueba. Si cambian el contenido o las imágenes, limpiar, editar, guardar y preparar nuevamente.
4. Implementar el motor todavía ausente: confirmación explícita vinculada al ID/revisión/hash del contenido y cuenta; reserva atómica del intento; comprobación fresca de cuenta/permisos/cuota/hashes; creación y persistencia de contenedores individuales/carrusel; consulta de estado hasta `FINISHED`; manejo de expiración/error; envío por `media_publish`; almacenamiento de ID, permalink y fecha.
5. Antes de habilitarlo, probar con Meta simulado doble clic, dos administradores, reintentos, expiración y pérdida de respuesta tanto al crear contenedores como al publicar. Tras un resultado incierto no se debe enviar otra vez; conciliar primero con Meta. Probar que una confirmación de una revisión anterior se rechaza.
6. Una vez completado y revisado ese motor, autorizar expresamente **la publicación real del borrador elegido**. Desplegar el código revisado con `verify_jwt = true` y las nuevas migraciones solo si esa implementación las necesita. Hoy no existe un flag que convierta el endpoint bloqueado en un publicador funcional.
7. Confirmar una sola vez desde la interfaz, revisar el resultado en Instagram y PostgreSQL y, ante un timeout, usar conciliación en lugar de pulsar publicar otra vez.

## Repetir la auditoría de solo lectura

```bash
npx supabase db query --linked --file scripts/audit-instagram.sql
npx supabase functions list
```

`scripts/audit-instagram-public-media.ts` acepta un JSON local con `project_ref` y `images: [{ path, sha256 }]` obtenido del historial. Solo necesita datos públicos, nunca tokens. Ejecutarlo con la configuración Deno de `instagram-prepare` y permisos de lectura/red permite repetir la descarga y verificación de píxeles/hash. No guardar credenciales en ese archivo.
