# Cierre histórico mínimo — SQL y procedimiento para revisión

**Preparación local, sin autorización de ejecución remota.** Proyecto único **blsezjyhiholzwmqewef**. Publicación **f7120683-6f03-43a6-bcf9-18a7ef5d69fe**, intento **9723a05a-982c-43f5-9aac-00491fdcc032**. Esta preparación no consultó ni modificó Cloud, no llamó a Meta y no cambió flags. No hizo commits, pushes, migraciones ni despliegues.

## Artefactos revisables

- `scripts/archive-instagram-historical-attempt.sql`: transacción puntual, no migración ni RPC. Incluye comprobaciones y recibo; la plantilla con placeholders no se ejecuta directamente.
- `scripts/instagram-closure-backup.sql`: captura completa de las 18 filas, auditoría, seguridad, control, readiness e historial de migraciones mediante una sola consulta de solo lectura.
- `scripts/historical-closure.mjs`: validación, respaldo local privado, comprobación Auth y preparación del SQL. **No contiene un cliente de escritura SQL remota.** Modos `--backup`, `--prepare` y `--verify`.
- `tests/instagram-historical-closure.test.js`: PostgreSQL local desechable con las migraciones reales, rutas actuales y HTTP simulado.
- `docs/instagram-historical-closure.diff`: diff del conjunto nuevo de esta preparación, sin staging ni commits.

La clasificación sigue siendo «abandonado antes de media_publish según el motor y checkpoint conservados». No se representa como una respuesta de Meta ni certificación de ausencia universal de publicación. Los supuestos/limitaciones del informe de evaluación siguen vigentes.

## Cambio exacto

El único UPDATE de negocio afecta al post/intent fijados y asigna:

```sql
status = 'publish_failed',
error_code = 'ADMIN_ARCHIVED_BEFORE_PUBLISH'
```

`updated_at` debe cambiar por el trigger existente. Se exige que absolutamente todas las demás columnas sean iguales antes/después, incluidos intento, fechas previas, contenedores, caption, productos, imágenes y publish_progress. Se comprueba otra vez la fila después de insertar auditoría para detectar también efectos de triggers de eventos.

El evento único es `admin_archive_before_publish`: administrador verificado, post, revisión, cuenta, intento, digest y estados/fases antes/después. No lleva method, endpoint, HTTP, remote_id ni códigos Meta. El campo existente trace_id contiene **`backup-sha256:<hash del snapshot privado>`**, claramente identificado como referencia local al respaldo, no como trace de Meta. No se inventa un evento histórico de escritura.

La transacción exige que sigan existiendo exactamente las 18 filas y su huella original **44eec1f11b52979b908bbe88478b50cd**, y huella individual **eb5ae500290608fddf9b7675b3aae534**. También exige cuenta, revisión 1, timestamps, principal/hijos y el JSON de progreso **exacto**, sin claves adicionales. Compara el historial de diez versiones, maintenance=true, frontend_ready=false, epoch actual y tres readiness válidas. Cualquier evento o fila de seguridad nuevos bloquean la operación; no se borran para hacerla pasar.

Las otras 17 filas, control, seguridad, readiness e historial deben conservarse íntegros. Solo se admite un evento nuevo. No hay manejo de excepciones que permita continuar: error de comprobación, auditoría, trigger, timeout, deadlock o permisos aborta la transacción.

Se emplea READ COMMITTED, bloqueo de membresía del actor, bloqueo inicial del control y bloqueos cortos de tablas de cuenta/posts/eventos/readiness/historial, en ese orden. Las lecturas posteriores a adquirir los locks deben ver cambios que hubieran confirmado mientras se esperaba; no se usa una snapshot anterior a esa espera para aceptar el baseline. No hay HTTP dentro de la transacción. Los bloqueos de tabla son deliberadamente conservadores para esta operación única; podrían esperar o fallar ante otras escrituras. lock_timeout=5s, statement_timeout=15s, idle_in_transaction_session_timeout=30s. Nunca desactivar triggers/RLS o aumentar timeouts para forzar el cierre. Los tests desactivan el trigger solo al construir la fixture con su timestamp histórico; el SQL de producción no lo hace.

## Permisos e identidad

La sesión administrativa del catálogo **no tiene UPDATE directo sobre instagram_posts ni INSERT sobre instagram_events**. Las pruebas lo confirman. Ser administrador en la aplicación no convierte al JWT en una conexión SQL privilegiada.

El futuro transporte SQL necesita el acceso de gestión ya existente con un rol propietario/privilegiado capaz de ejecutar DO, leer/actualizar posts, insertar eventos, leer admin_users y bloquear control/readiness/seguridad/historial. No usar el rol de la API SQL read-only para el cierre ni concederle permisos nuevos. service_role no dispone de acceso directo a control/readiness; no ampliar sus grants para ejecutar este procedimiento.

El actor de auditoría se obtiene separadamente con una **sesión administrativa nueva**, por entrada privada:

1. Validación local de formato/proyecto/vigencia; esto no verifica la firma.
2. GET fijo a `/auth/v1/user`, donde Supabase verifica la sesión.
3. GET fijo a `admin_users` usando ese mismo JWT y RLS; el ID devuelto debe ser miembro.
4. Solo entonces se incorpora ese ID al SQL. Nunca aceptar un actor proporcionado en argumentos, un UUID elegido por el operador, una clave pública, service role o un token de gestión como identidad del administrador.

Ambos GET tienen como único destino `blsezjyhiholzwmqewef.supabase.co`, sin redirecciones ni reintentos. No invocan Edge Functions. El SQL vuelve a comprobar membresía admin, y su ventana de autorización termina como máximo 120 segundos después de la comprobación Auth o cuando expire el JWT, lo que ocurra antes. La base no verifica por sí sola una firma JWT: **el preparador y el transporte SQL privilegiado son parte de la frontera de confianza**. No exponer esta plantilla como RPC accesible al navegador. No modificar manualmente placeholders para saltar la verificación.

## Respaldo privado: preparado, todavía no tomado de Cloud

No se afirma haber creado un respaldo real nuevo: hacerlo requiere una lectura de Cloud que no estaba autorizada en este turno. Los inventarios sanitizados anteriores no sustituyen la copia completa. La herramienta se probó con un respaldo completo de **datos ficticios locales**, con verificación de lectura y detección de corrupción.

Después de una autorización que incluya esta captura:

1. Revalidar proyecto vinculado, funciones 6/5/3/JWT, flags/epoch/readiness, cuerpos y permisos esperados. No ejecutar health. Congelar despliegues y acciones durante el corte.
2. Enviar únicamente el contenido de `instagram-closure-backup.sql` al endpoint **`/v1/projects/blsezjyhiholzwmqewef/database/query/read-only`**, usando la credencial de gestión existente solo en memoria. Extraer `closure_backup` en memoria; no imprimir cuerpos, captions, fotografías o credenciales.
3. Pasar ese objeto JSON al stdin de `node scripts/historical-closure.mjs --backup`, con transporte UTF-8. La herramienta crea un directorio exclusivo `prart-closure-private-*` bajo Temp, fuera del repositorio. En Windows retira herencia y concede acceso al usuario local actual mediante ACL antes de escribir; en otros sistemas usa permisos 0700/0600. Un fallo de permisos aborta la preparación.
4. Se guardan `snapshot.json` y `manifest.json`: hashes SHA-256 de bytes completos y MD5 de las filas canónicas PostgreSQL. Se relee el archivo, se verifica el SHA y se recalculan las huellas de las filas. No basta contar filas. Es un snapshot de aplicación, no una copia física/PITR de todo el proyecto ni un respaldo de los bytes de Storage.
5. Conservar además los respaldos de código ya disponibles. No eliminar originales o derivados de Storage, ni contenedores. El snapshot conserva sus referencias y manifiestos; el cierre no modifica esos objetos.

El respaldo contiene captions y datos completos; nunca añadirlo a Git, adjuntarlo al chat o ponerlo en una carpeta pública. Sus archivos tienen acceso restringido, pero no se promete cifrado independiente del disco ni borrado forense. Conservarlo y probar lectura antes de ejecutar cualquier UPDATE.

## Preparación privada del SQL, después de autorizar los GET Auth

El helper recibe por stdin un objeto de esta forma, **nunca con valores reales en comandos/historial**:

```json
{"backupDirectory":"<directorio privado>","credentials":{"key":"<clave pública>","token":"<access_token nuevo>"}}
```

Invocación: `node scripts/historical-closure.mjs --prepare`. La futura entrada debe suministrarse mediante un proceso local con campos ocultos o Read-Host -AsSecureString y un pipe UTF-8 controlado, sin archivo de credenciales, argumentos con valores, logs ni variables persistentes. **No reutilizar las ventanas anteriores de health**, porque ejecutan otra operación. No recuperar tokens previos. La ventana/entrada que se vaya a usar deberá revisarse antes de abrirse.

El helper exige el snapshot íntegro y baseline exactos, antigüedad máxima de cinco minutos y verificación Auth/admin. Solo produce `approved-for-review.sql` y `preparation.json` dentro del respaldo privado; guarda actor, expiración y hashes, nunca el JWT. Termina limpiando referencias/buffer principal; no promete borrar todas las copias de cadenas de .NET/V8. Las credenciales no se envían al endpoint de gestión.

La salida sanitizada indica ruta, actor y SHA del SQL, no los datos completos. La existencia del archivo **no ejecuta ni autoriza el cierre**. Si caduca la ventana Auth antes de su ejecución, detenerse y preparar una nueva autorización autenticada; no editar la fecha a mano ni sobrescribir evidencia. Los archivos se crean con exclusión (`wx`).

## Ejecución futura: una única solicitud, todavía no autorizada

Solicitar aprobación explícita del SQL puntual, sus hashes, motivo/limitaciones y actor. Antes de enviar: revalidar que la ventana Auth sigue vigente, verificar nuevamente el SHA del archivo contra preparation.json, la copia privada y los metadatos remotos. No hay una opción `--execute` en la herramienta preparada.

El futuro ejecutor enviará **una sola vez** el SQL revisado completo, sin partirlo, al endpoint de gestión de escritura **`/v1/projects/blsezjyhiholzwmqewef/database/query`**, proyecto fijo, con BEGIN/COMMIT en una única sesión. Este endpoint es distinto del read-only; cambiarlo solo está permitido con esa autorización posterior. El token de gestión permanece en memoria del proceso y no forma parte del SQL.

No usar db push, migraciones, repair de historial, funciones operativas, cancel/reconcile ni escrituras independientes para la auditoría. No hacer COMMIT manual tras un error. No ejecutar el cierre en varias llamadas sin una misma transacción. No reintentar automáticamente un timeout/504 ni asumir que HTTP 201 demuestra por sí solo conservación.

Tras respuesta satisfactoria, registrar solo el recibo permitido y hacer una captura independiente con el SQL de respaldo de lectura. Pasar al stdin de `node scripts/historical-closure.mjs --verify`:

```json
{"backupDirectory":"<directorio privado original>","snapshot":"<objeto closure_backup posterior, no una cadena>"}
```

El campo snapshot debe ser el **objeto** recibido por la consulta, no el texto ilustrativo del ejemplo. El verificador vuelve a leer el respaldo, obtiene el actor de preparation.json y compara las 18 filas, todos los campos conservados y el evento exacto. El snapshot posterior y el recibo deben guardarse en el mismo directorio privado para completar la evidencia de después; no sobrescribir snapshot.json original. Se documentará la nueva huella esperada, sin cambiar la antigua en pruebas/evidencia retrospectiva.

## Timeout, resultado incierto o fallo

Ante cualquier fallo, conservar mantenimiento y detener nuevas escrituras. Un recibo anterior a COMMIT, un 504 o un cliente desconectado no prueban si hubo confirmación. La verificación independiente clasifica:

| Resultado | Condición | Acción |
| --- | --- | --- |
| `not_applied` | Todas las filas, eventos, control, readiness, seguridad e historial siguen iguales al backup | No reintentar automáticamente. Registrar el fallo y pedir autorización para otro intento autenticado. |
| `closed_verified` | Únicamente status/error_code/updated_at cambiaron en la fila prevista y existe el único evento exacto con actor/referencia del backup; el resto está intacto | No repetir SQL. Conservar backup/recibo y emitir informe de cierre; flags sin cambios. |
| `inconsistent_stop` | Cambios adicionales, auditoría ausente/incorrecta, otro actor, estado divergente, etc. | Mantener suspensión e investigar por lectura. No completar a mano, borrar eventos, restaurar todo el snapshot ni volver a publishing. |
| Lectura no disponible | No es posible clasificar de manera fiable | Resultado desconocido; mantener suspensión y pedir intervención/autorización adicional. |

**No se prepara una reversión automática a publishing/waiting**: reabriría un trabajo que se decidió abandonar. El backup permite investigación o una reparación específica revisada; no autoriza sobrescribir publicaciones/eventos ni eliminar la evidencia del cierre. Ningún fallo habilita Meta o exige cambiar flags como recuperación.

## Pruebas locales y límites

Se ejecutó PostgreSQL embebido **PGlite**, con las migraciones reales; no es un parser SQL simulado ni una conexión a Cloud. Las filas son sintéticas y los hashes de esas fixtures se sustituyen únicamente dentro del test. El preparador de producción no admite overrides: exige las dos huellas reales fijadas y rechaza la fixture.

Pasaron **26 pruebas/subpruebas específicas** y la **suite completa de 149 pruebas/subpruebas**, además de `npm run lint` sin advertencias. Cobertura:

- Commit exacto, evento atribuible y preservación de las otras 17 filas/progreso/IDs/flags/readiness/historial.
- Rechazo de cambios de huella, intento, revisión, cuenta, estado, fase, hijos, principal, polls, ID remoto o claves de progreso adicionales.
- Rechazo de mantenimiento retirado, frontend_ready activo, nuevas filas de seguridad, readiness faltante o historial distinto.
- Fallo de auditoría y triggers que alteran campos protegidos durante UPDATE o auditoría: rollback completo.
- Reejecución rechazada sin duplicar evento; no admin rechazado; rol authenticated sin permisos directos de escritura.
- Rutas HTTP y motor actuales: start/continue/reconcile/cancel/reset/delete rechazan el terminal aun simulando mantenimiento retirado; cero Meta y cero PATCH del post.
- Respaldo completo ficticio, ACL privada, lectura de vuelta y rechazo de corrupción; verificación Auth/admin exclusivamente GET al proyecto fijo con HTTP simulado; clasificación de resultado intacto/cerrado/inconsistente.

La primera ejecución de las pruebas detectó problemas de fixture (search_path del trigger de prueba, membresía RLS del usuario simulado y JWT ficticio sin sub); se corrigieron las fixtures. Tras añadir el bloqueo de membresía, el rol del navegador fue rechazado por RLS antes de llegar al error de escritura; la prueba admite ambas denegaciones y verifica además los privilegios efectivos. No se cambiaron los guards de las funciones desplegadas ni se concedieron permisos.

Las pruebas no certifican permisos o estado actuales de Cloud, ni el comportamiento del transporte remoto de escritura. PGlite tampoco reproduce conexiones independientes para certificar todos los intercalados de locks entre sesiones; se emplean los bloqueos explícitos de PostgreSQL y timeouts conservadores, que deben revisarse en el preflight de ejecución. Esos controles deben revalidarse cuando se autorice la ejecución. El respaldo real y la sesión Auth real **siguen pendientes**. No se publicaron herramientas ni se modificó el frontend.

## Alcance terminado

Solo preparación local completada. El intento histórico no ha cambiado y no se ejecutó SQL remoto. **maintenance=true, frontend_ready=false y drain_verified=false** se conservan conforme al último baseline documentado; no se hicieron nuevas lecturas de Cloud en este turno.

La siguiente decisión es aprobar, si se desea, la captura privada, los GET de autenticación y la ejecución puntual revisada. Esa aprobación no debe incluir activación de Instagram: incluso tras verificar el archivo, el mantenimiento permanece y cualquier cambio de flags requiere otra autorización.
