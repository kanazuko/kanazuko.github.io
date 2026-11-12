# Etapa 2 — cerrada con mantenimiento activo

Proyecto exclusivo: **blsezjyhiholzwmqewef**. Fecha: **11 de noviembre de 2026**. Las dos migraciones están aplicadas y la comprobación complementaria autorizada terminó correctamente. **Solo se declara cerrada la etapa 2.** No se autoriza ni se ejecuta la etapa 3. Se mantiene **drain_verified=false** y la incertidumbre del intento en Meta.

## Aplicación de las migraciones

Se aplicaron, en orden, **20261107010000_instagram_safety_and_audit.sql** y **20261107020000_instagram_exclusive_requests.sql**, entre **20:10:28.247 y 20:10:28.733 UTC** (14:10, Ciudad de México), con HTTP 201. Una consulta posterior independiente confirmó ambas versiones y el esquema resultante.

Las migraciones y sus entradas de historial se ejecutaron en una única transacción BEGIN/COMMIT mediante la API SQL de gestión. El endpoint de creación de migraciones no permite proporcionar estas versiones predefinidas; se conservaron mediante INSERT de version/name/statements dentro de la misma transacción que el DDL, sin reparación posterior ni marcas ficticias. Cada entrada nueva contiene el archivo SQL original completo en statements.

La transacción utilizó lock_timeout de 5 segundos, statement_timeout de 30 segundos y bloqueos de tabla sobre historial y publicaciones. Validó previamente y antes del COMMIT los conteos y huellas del contenido existente. No incluyó UPDATE/DELETE de publicaciones ni ejecutó RPCs operativas de Instagram. **Durante la comprobación complementaria posterior no se ejecutaron ni repitieron migraciones.**

## Controles previos a la aplicación

- El usuario aceptó el riesgo residual del drenaje y confirmó ausencia de automatizaciones externas activas.
- GitHub público: workflow sin cambios y cero ejecuciones in_progress/queued en la revisión de las 20:09 UTC. No se modificó GitHub ni se ejecutó push.
- Logs hasta 20:09:19 UTC: sin versiones antiguas nuevas identificadas en los datos disponibles. Esto no constituye certificación de drenaje.
- Preflight e inventario de solo lectura a las 20:08 UTC: ocho migraciones anteriores; únicamente las dos autorizadas pendientes; sin tablas/tipos nuevos en conflicto.
- Puente intacto: publish v5, prepare v4 y status v2; ACTIVE, verify_jwt=true e IDs/updated_at originales. La ventana privada terminó con salida 0 y las tres respuestas **423 + INSTAGRAM_MAINTENANCE + prartjewelry-v1**, con no-store y credenciales nuevas.
- SHA-256 de los archivos aplicados: 2315a0ff9880f00365c4e4be36ac22a89ecfd48e9a37be05e61c0cff68fc20c5 y 4fec9425f0609e2e9fdc486da7b87122807255afa31ed0759a16b281e95c30e2.
- Pasaron 25 casos locales de exclusión, seguridad y despliegue coordinado con Meta simulado. Una ejecución previa de la ventana había sido detenida por SESSION_EXPIRED antes de hacer HTTP, sin aplicar cambios; el usuario autorizó repetirla.

## Verificación principal posterior

La observación independiente de solo lectura de las **20:10:39 UTC** superó las 15 comprobaciones principales:

- Cuatro tablas nuevas, RLS activo y políticas SELECT para authenticated sujetas a app_private.is_admin().
- anon sin acceso directo a las tablas; authenticated solo SELECT sujeto a RLS. service_role tiene SELECT/INSERT/UPDATE en eventos y seguridad, sin DELETE; sin acceso directo a control/readiness.
- Diez funciones nuevas o reemplazadas con cuerpos coincidentes con los archivos, SECURITY DEFINER, owner postgres y search_path vacío. RPCs de backend restringidas a service_role entre los roles inspeccionados; administrativas con acceso authenticated y sin anon. Ninguna conserva EXECUTE para PUBLIC. El RPC de estado permite anon/authenticated/service_role.
- Historial de diez versiones: solo se añadieron las dos autorizadas, con nombres y fuentes exactos; las ocho entradas anteriores se conservaron completas.
- Estado almacenado: **schema_version=2, maintenance=true, frontend_ready=false**. Una fila de control; cero eventos, cero filas de seguridad y cero registros de readiness.
- Metadatos de las tres funciones del puente idénticos a los previos.

## Diagnóstico del fallo complementario

El error `Read-only schema detail failed` procedía de un comando Node ad hoc, no de un archivo persistente del repositorio. Su consulta agrupaba catálogos y la ejecución SQL de instagram_runtime_status(); descartaba tanto el estado HTTP como la causa. Tras el fallo se detuvo el procedimiento original sin alterar permisos ni retirar mantenimiento.

La repetición controlada separó ambas operaciones y reprodujo el problema:

| Comprobación | Resultado real |
| --- | --- |
| Catálogos por /database/query/read-only | HTTP **201**, transaction_read_only=on |
| Permiso de ejecución del rol de esa consulta | has_function_privilege(current_user, ..., EXECUTE) = **false** |
| SELECT public.instagram_runtime_status() por esa API | HTTP **400**, fase **sql**, SQLSTATE **42501**, diagnóstico **RUNTIME_EXECUTE_DENIED** |
| RPC pública de lectura por GET | HTTP **200**, resultado correcto |

La causa reproducible es la falta de permiso de ejecución de esa función para el rol de la API de consultas de solo lectura. No es un fallo de autenticación de gestión, sintaxis SQL o timeout. El HTTP histórico original no se conservó; el 400/42501 corresponde a esta nueva reproducción, no a una reconstrucción ficticia del registro anterior.

**No se cambiaron permisos ni funciones para resolverlo.** Los catálogos se consultaron con BEGIN READ ONLY y ROLLBACK. La función se ejecutó por su ruta pública prevista: **GET https://blsezjyhiholzwmqewef.supabase.co/rest/v1/rpc/instagram_runtime_status**. Se utilizó únicamente la clave pública ya publicada en el módulo Supabase del catálogo, en memoria; no se necesitó un JWT administrativo, no se ejecutó el JavaScript descargado ni se mostraron/guardaron claves o tokens. No hubo llamadas a Edge Functions ni a Meta durante esta revisión complementaria.

## Restricciones, defaults y resultado de la función

Comprobación completada a las **20:20:03 UTC** (14:20, Ciudad de México):

- Las **13 restricciones** de Cloud —claves primarias, foráneas y CHECK— coinciden con las producidas por ambas migraciones y están validadas.
- Las **40 columnas**, sus tipos, nulabilidad y valores por defecto coinciden.
- Los **siete índices** de las cuatro tablas nuevas coinciden, incluido instagram_events_unfinished y su predicado.
- El cuerpo de instagram_runtime_status(), lenguaje SQL, volatilidad STABLE, SECURITY DEFINER y search_path coinciden con la migración.
- El resultado HTTP coincide con la fila de control, incluido el mismo deployment_epoch; confirma **schema_version=2, maintenance=true, frontend_ready=false**.

La comparación se hizo contra una base PostgreSQL local desechable construida con las migraciones reales. PGlite usa PostgreSQL 18.6 y Cloud usa PostgreSQL 17.11: la base local también expone 16 restricciones NOT NULL en pg_constraint como tipo n. No se interpretaron como una diferencia de esquema; se contrastaron semánticamente mediante la nulabilidad de las 40 columnas. Las otras 13 restricciones coinciden exactamente. Las pruebas comprueban que una nulabilidad o definición alterada sí produce discrepancia.

## Conservación de datos

Las **18 filas completas de instagram_posts** conservaron antes y después de aplicar las migraciones la huella **44eec1f11b52979b908bbe88478b50cd**, calculada en PostgreSQL sin exponer captions ni imágenes. Incluye publicaciones, borradores, contenedores y checkpoints. Las ocho entradas antiguas de historial conservaron conteo y huella **d90a4ec5518a2e10bfbbd307994a54ea**. Las tablas nuevas de auditoría no existían antes de la aplicación.

El inventario posterior coincidió íntegramente: intento **9723a05a-982c-43f5-9aac-00491fdcc032**, publicación f7120683-6f03-43a6-bcf9-18a7ef5d69fe, revisión 1, publishing/waiting, updated_at 2026-11-07T06:28:09.495369Z, contenedor principal y dos hijos originales, sin instagram_id. No se continuó, concilió, canceló ni reintentó. Esta revisión complementaria solo consultó catálogos, la fila de control y su RPC de lectura; no efectuó escrituras sobre esos registros.

## Archivos locales y pruebas de la corrección

- `scripts/check-instagram-schema-detail.mjs`: sustituto persistente del comando ad hoc, consultas SELECT fijas por la API read-only, RPC GET limitada al proyecto, diagnóstico sanitizado por fase/HTTP/SQLSTATE y comparación semántica de catálogos.
- `tests/instagram-schema-detail.test.js`: cinco pruebas de SQL real en PostgreSQL local, diferencias 17/18, discrepancias de esquema, diagnósticos sin filtración, destinos fijos, ausencia de reintentos/redirecciones y RPC de lectura.
- `docs/instagram-stage2-result.md`: resultado actualizado y texto reparado en UTF-8.

Pasaron **las cinco pruebas específicas y npm run lint**. Las credenciales ficticias de las pruebas no hacen solicitudes reales. Los errores de red, TLS, timeout, HTTP, sintaxis y permisos se distinguen sin imprimir excepciones, encabezados ni respuestas sensibles.

Evidencia sanitizada privada: stage2-preflight-before.json, stage2-http-before.json, stage2-apply-start.json, stage2-apply-result.json, stage2-preflight-after.json, stage2-detail-diagnosis.json y stage2-detail-complete.json, en el directorio temporal original del respaldo. Los últimos archivos contienen solo metadatos y resultados de control, sin credenciales ni contenido de publicaciones.

## Cierre y límites

**Etapa 2 cerrada. Mantenimiento activo; etapa 3 no iniciada.** No se desplegaron funciones, modificó frontend/Pages, ejecutó push ni realizaron llamadas a Meta. El puente permanece instalado. La revisión complementaria no modificó funciones, permisos, publicaciones ni intentos.

El drenaje histórico sigue sin certificarse: **drain_verified=false**. El resultado en Meta continúa sin resolverse. La fase waiting no es por sí misma una cuarentena persistente de la cuenta; esa garantía debe evaluarse antes de cualquier futura habilitación de escrituras. Nada de este cierre autoriza a reactivar publicaciones ni avanzar de etapa.
