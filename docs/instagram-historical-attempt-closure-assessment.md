# Intento histórico — evaluación de cierre administrativo mínimo

Proyecto exclusivo: **blsezjyhiholzwmqewef**. Revisión de código, respaldos locales y consultas SQL de solo lectura. **No se archivó, canceló, eliminó ni modificó ningún registro. No hubo llamadas a Meta ni cambios de flags.**

## Conclusión concreta

**Para este intento hay evidencia de checkpoint considerablemente más específica que la etiqueta publishing/waiting. Es razonable proponer un cierre administrativo terminal sin desarrollar primero una cuarentena y un diagnóstico nuevos.** Debe clasificarse como **«abandonado antes de media_publish según el motor y el checkpoint conservados»**, no como una certificación de que Meta confirmó ausencia de publicación.

La opción mínima propuesta es una futura transacción de cierre sobre esa única fila, usando el estado terminal existente publish_failed y un error_code administrativo explícito, manteniendo intento, contenedores y progreso. Añadir un evento de auditoría en la misma transacción. Esto requiere autorización posterior específica y comprobaciones inmediatamente antes del cambio. No usar cancel del motor, no resetear a prepared/draft y no borrar el intento.

Si se exige demostrar ausencia absoluta de publicación por cualquier origen, o no se acepta el supuesto de integridad del checkpoint y del flujo revisado, **estas fuentes no bastan**: mantener mantenimiento y solicitar evidencia adicional. Un archivo administrativo por sí solo nunca demuestra qué hizo Meta.

## Datos reales de solo lectura

Consulta mediante /database/query/read-only, **HTTP 201**, BEGIN READ ONLY/ROLLBACK y transaction_read_only=on. Observación final: **2026-11-12T05:25:17.881043Z**, 11 de noviembre a las 23:25 en Ciudad de México.

| Campo | Resultado |
| --- | --- |
| Publicación | f7120683-6f03-43a6-bcf9-18a7ef5d69fe |
| Intento | 9723a05a-982c-43f5-9aac-00491fdcc032 |
| Cuenta / revisión | 17841465479111585 / 1 |
| Estado y fase | publishing / waiting |
| Inicio | 2026-11-07T06:26:32.284Z |
| Última modificación | 2026-11-07T06:28:09.495369Z |
| Formato / imágenes preparadas | carousel / 2 |
| Contenedor principal | 17931282783182638 |
| Hijos | 17931282594182638, 17931282639182638 |
| waiting_child | false |
| polls / last_poll | 0 / null |
| operation / error_code | null / null |
| instagram_id / instagram_url / published_at | null / null / null |
| Eventos del post / seguridad de la cuenta | [] / [] |

Las únicas claves del progreso son children, digest, phase, polls y waiting_child. Digest de confirmación: **76a89e0aef8a69018c916d29d50e0f951cf8d421cd3d19e46f8c80587cdc3b79**. Huella de la fila completa: **eb5ae500290608fddf9b7675b3aae534**.

Siguen existiendo 18 publicaciones; con la fórmula histórica exacta —JSON completo ordenado por id y separado por chr(10)— su huella permanece **44eec1f11b52979b908bbe88478b50cd**. Una primera consulta calculó una huella distinta al omitir ese separador; se repitió únicamente la lectura con la fórmula original y se confirmó la conservación. No fue una modificación de datos.

En los otros registros de esta cuenta hay cero referencias al mismo contenedor principal, cero captions exactamente iguales y cero publicaciones marcadas published con productos solapados con este intento. Son comprobaciones de la base local de la integración, **no búsquedas en Instagram** ni pruebas de ausencia de publicación externa.

Estado global: schema_version=2, maintenance=true, frontend_ready=false y epoch **3cd91507-439a-4a97-85bc-1dac9d218856**, sin cambios. **drain_verified=false**.

## Qué muestra el código anterior al mantenimiento

Se inspeccionó el respaldo de instagram-publish **v4**, no solo el motor nuevo. Sus metadatos conservados indican updated_at **2026-11-05T15:47:29.288Z**, anterior al intento del 7 de noviembre. SHA-256 del engine.ts respaldado: **efc482c5256e347aa87ddabb6f066360ed3319c729be0a9cfd32f1f052540350**.

Ubicación privada: Temp/prartjewelry-instagram-20261111T181522Z/supabase/functions/instagram-publish/engine.ts; el inventario functions-before.json identifica la v4. Ese respaldo demuestra el contenido conservado y su versión observada antes del corte; no constituye un inventario completo de todos los workers/versiones que pudieron existir históricamente.

Flujo de v4 relevante:

1. Crear el contenedor principal mediante POST media y guardar el ID devuelve precisamente **waiting, waiting_child=false, polls=0 y last_poll ausente**. Es el checkpoint observado.
2. Una continuación desde waiting debe persistir primero working; solo después consulta el contenedor. Si termina satisfactoriamente, incrementa polls y, si FINISHED, guarda ready. No publica en esa misma rama.
3. Otra invocación desde ready persiste working, verifica acceso/estado y **guarda publish_unknown/sending antes de llamar a media_publish**. Si ese PATCH falla, el POST de publicación no se ejecuta.
4. El éxito guarda el ID de publicación; el fallo deja publish_unknown/sending o un bloqueo conservador. No existe en esa rama un camino normal que vuelva a publishing/waiting con polls=0.
5. Los PATCH usan id, revision, status y updated_at; el trigger actualiza updated_at. Una petición con una copia antigua de waiting no puede sobrescribir un checkpoint nuevo mediante ese flujo.

El motor v6 actual mantiene esa separación y no tiene un proceso autónomo que continúe al cargar el módulo. La evidencia almacenada y el código indican que **la última operación completada y registrada fue crear el contenedor principal, antes de consultar su preparación y antes de publicar**. No hay evidencia positiva de media_publish para este intento. Los contenedores hijos y principal tienen IDs guardados; eso no son IDs de una publicación final.

## Grado de certeza

**Sí hay fundamento suficiente para clasificar administrativamente el flujo revisado como no enviado por el motor.** Si media_publish hubiera atravesado ese camino y el registro no hubiese sido restaurado o alterado fuera de él, el checkpoint actual no podría seguir igual.

**No se ha probado de forma independiente que ninguna publicación exista en Meta.** No hay logs HTTP completos del 7 de noviembre ni auditoría de requests previa al protocolo: las tablas de eventos se instalaron después. La ausencia de eventos no es evidencia negativa de POST. Tampoco instagram_id=null, el paso del tiempo o la posible caducidad de contenedores demuestran ausencia de publicación.

La recomendación depende de no haber restaurado manualmente esa fila, utilizado código/rutas alternativos sin el checkpoint previo o publicado directamente por otro origen. El usuario ha confirmado ausencia de automatizaciones externas activas; esa declaración no es una auditoría retrospectiva de cualquier operación humana. El drenaje histórico sigue sin certificarse. Si aparece evidencia de otra versión/restore/POST, invalidar esta clasificación y no archivar bajo la etiqueta «antes del envío».

## ¿Archivar o cancelar sin Meta?

El cancel existente **debe seguir rechazando este caso**: solo permite checkpoints vacíos sin principal/hijos. No debilitar esa regla para que el botón funcione. El esquema tampoco admite archived/cancelled como valores de status.

La alternativa mínima no requiere un nuevo valor de esquema ni una ruta de diagnóstico:

- Cierre administrativo con **status=publish_failed**, **error_code=ADMIN_ARCHIVED_BEFORE_PUBLISH**. Se trata de un cierre del trabajo, no de atribuir un rechazo o fallo a Meta.
- Conservar publish_attempt_id, publish_started_at, container_id, hijos, digest, publish_progress íntegro, productos, fotografías, caption y cualquier ID/fecha remota. El trigger cambiará updated_at al realizarse el cierre: debe quedar previsto y auditado.
- Registrar un evento nuevo **admin_archive_before_publish**, vinculado al actor administrador verificado, cuenta, post, revisión, intento, digest y estados antes/después. method/endpoint deben quedar null: el archivo no es una solicitud a Meta y no debe inventar una.
- Mantener el registro en el historial. No eliminar fotos, derivados, contenedores, auditoría ni backups, no reutilizar el mismo intento ni convertir el borrador a prepared para reintentarlo.

Un texto opcional del frontend puede mostrar «Archivado administrativamente antes del envío» para ese error_code; hoy se verá el estado terminal genérico «Publicación fallida». Ese ajuste de presentación no es imprescindible para impedir la continuación y requeriría su publicación propia si se decide hacerlo.

## Transacción futura mínima y condiciones

**No se preparó ni ejecutó un script de escritura en Cloud.** Antes de solicitar aprobación para ejecutarlo debe existir un SQL concreto revisable y pruebas locales, limitado a este caso:

1. Conservar un backup privado completo de la fila y de su contexto de auditoría/seguridad; verificar hashes y lectura del backup. La evidencia sanitizada actual no sustituye un backup completo recuperable. No guardar captions, imágenes o tokens en el repositorio.
2. Verificar el proyecto y maintenance=true, frontend_ready=false; congelar despliegues y acciones administrativas durante la transacción. No interpretar el archivo como cancelación de HTTP recibido antes por Meta.
3. Comprobar el actor mediante una sesión Supabase Auth vigente y pertenencia admin; no atribuir el evento a un UUID elegido arbitrariamente. La credencial de gestión por sí sola no acredita ese actor de aplicación.
4. Transacción con timeouts y bloqueos en orden compatible con el protocolo: control de mantenimiento, seguridad de cuenta si existe y post. Exigir una sola fila con ID, revisión, intento, cuenta, updated_at, fingerprint y checkpoint exactos. Exigir que no hayan aparecido eventos o reservas/latches incompatibles. Cualquier diferencia aborta sin limpiar nada.
5. Actualizar únicamente status/error_code; insertar el evento en la misma transacción. Si falla auditoría, no confirmar el cambio. Verificar todos los otros campos de la fila y todas las otras publicaciones, no solo conteos.
6. Confirmar mantenimiento, fila terminal y auditoría; documentar la nueva huella global esperada. Dejar la activación y sus riesgos para otra autorización. No adaptar a ciegas los verificadores que hoy esperan cero eventos y la huella anterior: deben reconocer el único cambio expresamente aprobado.

Este procedimiento no marca published, no inventa instagram_id ni published_at y no indica que Meta confirmó una no publicación. Un fallo o timeout al archivar exige lectura del resultado antes de cualquier repetición.

## Validación local de la alternativa

Prueba en PostgreSQL local desechable con las migraciones reales y el motor actual; cero solicitudes externas:

- Simular un fallo al insertar el evento revierte el cierre: fila íntegra original.
- El cierre a publish_failed conserva todos los campos salvo status, error_code y updated_at.
- start devuelve CONFIRMATION_REQUIRED; continue devuelve DRAFT_CONFLICT; reconcile y cancel devuelven MANUAL_REVIEW_REQUIRED. Ninguno llega a Meta.
- Un borrador distinto puede obtener una reserva SQL después de quitar mantenimiento **solo en la fixture**. Eso demuestra viabilidad técnica de nuevas operaciones sin reenviar el intento cerrado; no se hizo ninguna publicación real.

El código actual ya deniega reset/delete de este post por conservar su publish_attempt_id/contenedores. No hace falta una migración ni desplegar funciones para que el estado terminal impida continuar el intento mediante las rutas revisadas.

## Efecto sobre la reactivación y duplicación

**Archivar no reactiva nada automáticamente.** Bajo los supuestos descritos, el intento deja de ser trabajo reanudable y no necesita una cuarentena global nueva para impedir su propio reenvío. El protocolo desplegado mantiene sus reservas y latches para los nuevos intentos.

La opción evita duplicar por continue/retry del mismo registro. No puede impedir que un administrador cree deliberadamente otro borrador con las mismas imágenes/caption; antes de una publicación nueva debe revisar contenido y no recrear este trabajo como supuesto reintento. No hay evidencia de ese duplicado en los registros consultados, pero la base no representa necesariamente todo el perfil de Instagram.

Antes de activar flags aún se deben comprobar versión publicada, esquema/readiness, ausencia de otros bloqueos, integridad posterior al cierre y revisión explícita del riesgo residual de drenaje para el alcance de activación. No usar frontend_ready=false como barrera independiente de backend ni aceptar el archivo como prueba de drenaje.

**Recomendación:** preparar el cierre administrativo puntual con evidencia y transacción, someterlo a autorización y mantener mantenimiento después. No desarrollar por defecto un sistema nuevo de diagnóstico/cuarentena solo para este caso si se acepta su clasificación fundada en checkpoints. Si no se acepta esa evidencia condicionada o surge evidencia contradictoria, conservar suspensión y volver al plan de diagnóstico; no desbloquear escrituras etiquetando un resultado desconocido como fallido.

## Evidencia que conservar

- IDs originales, digest, contenedores/hijos, productos/imágenes, manifiesto de preparados, timestamps y progreso completos; copia privada de la fila anterior y posterior con hashes.
- Snapshot de las 18 filas o respaldo recuperable y sus huellas; evento de archivo y verificación de preservación de los otros 17 registros.
- Respaldo v4, hash del engine e inventario que identifica la versión/fecha; fuentes v6 y pruebas de no continuación terminal.
- Declaraciones del responsable, motivo y alcance de la decisión, supuestos/limitaciones, actor verificado, autorización y hora de cierre; nunca credenciales ni tokens.
- Evidencia de solo lectura de este turno: **historical-attempt-closure-review.json**, en Temp/prartjewelry-stage3-20261111T205009Z. Es un inventario sanitizado, no un backup completo.

Este informe es local. No se hicieron commits, pushes, despliegues, migraciones ni cambios remotos. **El intento sigue intacto y maintenance=true/frontend_ready=false/drain_verified=false.**
