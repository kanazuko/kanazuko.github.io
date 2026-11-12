# Reactivación A — revalidación remota de solo lectura

Proyecto exclusivo: **blsezjyhiholzwmqewef**. Autorización: únicamente lecturas remotas, sin health ni Meta y sin modificaciones. Observaciones del **12 de noviembre de 2026, 05:14–05:16 UTC** (11 de noviembre, 23:14–23:16, Ciudad de México).

## Resultado técnico

El estado desplegado coincide con el baseline revisado de las etapas 2–4. **Esto no autoriza retirar mantenimiento ni significa que la reactivación sea segura.** Sigue faltando la cuarentena persistente que cubra el intento legado waiting; no se implementó ni instaló ningún control nuevo.

### Supabase Cloud

Snapshot a las **05:14:08.739765 UTC**, mediante la API de consulta de solo lectura; transaction_read_only=on:

- **schema_version=2, maintenance=true, frontend_ready=false**.
- Epoch **3cd91507-439a-4a97-85bc-1dac9d218856**.
- Exactamente tres readiness, esquema 2 y mismo epoch; checked_at sin cambios:
  - publish: 2026-11-11T20:53:18.592419Z.
  - prepare: 2026-11-11T20:59:42.511105Z.
  - status: 2026-11-11T22:18:53.224011Z.
- Funciones ACTIVE, verify_jwt=true e IDs originales:
  - instagram-publish **v6**, 4793ddd5-8860-434f-b7f3-0f413720e509.
  - instagram-prepare **v5**, 9424063a-13d4-4f77-87c3-9c327c55ae29.
  - instagram-status **v3**, a52026d6-6615-41d3-b6d6-00088752c1cf.
- Diez versiones en el historial; ambas migraciones de seguridad presentes.
- **18 publicaciones**, huella íntegra **44eec1f11b52979b908bbe88478b50cd**, sin cambios.
- Cero eventos y **cero filas de instagram_account_safety**: no hay una reserva/cuarentena persistida para el intento histórico.

El intento **9723a05a-982c-43f5-9aac-00491fdcc032**, publicación **f7120683-6f03-43a6-bcf9-18a7ef5d69fe**, continúa en **publishing/waiting**, revisión 1, updated_at **2026-11-07T06:28:09.495369Z**, sin instagram_id. Conserva principal **17931282783182638** e hijos **17931282594182638** / **17931282639182638**. No fue leído mediante el motor, continuado, conciliado, cancelado ni reintentado.

### Contrato, esquema y permisos

Las consultas de catálogos devolvieron **HTTP 201**, siempre dentro de BEGIN READ ONLY/ROLLBACK:

- Las cuatro tablas nuevas, columnas/defaults, restricciones e índices coinciden con las migraciones locales mediante comparación semántica PostgreSQL 17/18.
- RLS, cuatro políticas y privilegios efectivos SELECT/INSERT/UPDATE/DELETE de anon/authenticated/service_role coinciden con la base local de referencia.
- Los cuerpos, firmas, owner, SECURITY DEFINER y search_path de las diez RPCs coinciden con las migraciones. No se ejecutaron esas RPCs administrativas para probarlas.
- Ninguna de estas funciones tiene EXECUTE para PUBLIC. Anon/authenticated coinciden con la referencia y los permisos de backend corresponden al contrato revisado.

**Advertencia de comparación resuelta:** el comparador inicial devolvió mismatch porque Cloud permite EXECUTE a service_role en recover_instagram_read, resolve_instagram_read_hold, resume_instagram_account y set_instagram_maintenance, mientras la base local mínima no concede esos permisos. No se modificó el comparador para ocultar la diferencia ni se tocaron ACLs. Se compararon los cuatro permisos con stage2-preflight-after.json, conservado antes de esta revisión: **los cuatro ya eran true en la etapa 2**. Por tanto, no es deriva reciente. Sus cuerpos siguen exigiendo app_private.is_admin(), que depende del usuario autenticado. No se probó ejecución con service_role ni se asumió que EXECUTE baste para superar ese control.

Se conservaron tanto la comparación inicial no satisfactoria como la revisión explícita contra el baseline Cloud. No se declara que los defaults de permisos de Cloud y los de la fixture local sean idénticos.

### Frontend y GitHub

GET de **05:16:26 UTC**:

- Main remoto sigue en **bba1960307e7aab1db481421c189562a496733dc**; el workflow remoto coincide exactamente con el de ese commit. Las guardas manuales permanecen.
- Un workflow activo; cero runs in_progress y cero queued.
- Run manual **43157443047**, mismo SHA, workflow_dispatch y success.
- release.json: **HTTP 200**, SHA y epoch exactos, maintenance_expected=true.
- RPC público instagram_runtime_status por **GET**, con la clave pública existente solo en memoria: **HTTP 200**, esquema 2 y flags/epoch concordantes con SQL.

No se inició ninguna ejecución de Actions, no se desplegó Pages ni se repitió health/probe. La comprobación visual del administrador real es la confirmación previamente registrada en la etapa 4; no se presenta como una nueva sesión observada en este turno.

### Automatizaciones visibles y límites

- No están instaladas las extensiones pg_cron, pg_net, pgmq, http o pg_task; no existen los esquemas cron/net/pgmq/pgflow buscados.
- El único trigger de usuario de instagram_posts es instagram_posts_updated → set_updated_at, sin patrones de despacho HTTP/Meta/colas en su cuerpo.
- La búsqueda por patrones en funciones SQL públicas/privadas/extensions identificó grant_pg_cron_access y grant_pg_net_access en extensions. Son coincidencias de funciones auxiliares, no evidencia de un job activo; las extensiones correspondientes no están instaladas. Esta búsqueda no es una prueba exhaustiva de ausencia de automatización.
- El workflow remoto coincide con el código revisado; no se observan runs activos en la consulta puntual. Esto no demuestra ausencia universal de procesos que puedan iniciarse más tarde.
- El responsable reconfirmó: **«Sí, sigue sin haber automatizaciones externas activas»**, en respuesta a la pregunta que incluía n8n/Zapier, otros servidores/proyectos, publicación directa en Meta y restauración de funciones antiguas. Esto completa la comprobación administrativa solicitada; no equivale a una auditoría técnica independiente de esos servicios externos.
- No se hicieron nuevas consultas de logs de runtime ni se obtuvieron evidencias adicionales de finalización de workers antiguos. **drain_verified=false**. La ausencia de jobs, cambios o runs no se usa para certificar drenaje.

## Alcance ejecutado y evidencia

Credenciales existentes de gestión/GitHub leídas desde el almacén local solo en memoria; eliminadas del entorno de cada proceso al terminar. No se pidió ni recuperó JWT administrativo, no se imprimieron tokens/keys/cuerpos sensibles y no se cambiaron secretos.

Las solicitudes SQL usaron exclusivamente /database/query/read-only con BEGIN READ ONLY y ROLLBACK. Su método HTTP POST transporta SELECT de catálogos; **no es una escritura SQL**. Las demás solicitudes fueron lecturas de metadatos de funciones, GitHub, release.json y el RPC público de estado por GET.

No hubo cambios de flags, permisos, publicaciones, historial, readiness o auditoría; tampoco migraciones, despliegues de funciones, commits, pushes, dispatches, consultas ni publicaciones en Meta. El manifiesto local de fuentes de etapa 3 también pasó su comprobación; no se descargaron ni cambiaron los bundles remotos.

Evidencia sanitizada en el directorio privado original de Temp, prartjewelry-stage3-20261111T205009Z:

- reactivation-a-state.json y reactivation-a-functions.json.
- reactivation-a-schema.json y reactivation-a-schema-reviewed.json.
- reactivation-a-pages.json y reactivation-a-dispatch.json.

Este informe es local y no se subió al repositorio.

## Decisión siguiente

**No reactivar Instagram.** La etapa A de revalidación queda completada, incluida la reconfirmación administrativa externa. Preparar B del plan solo tras delimitar su alcance: propuesta local de cuarentena persistente por cuenta y diagnóstico GET bajo mantenimiento, pruebas y diff concreto. No modificar migraciones ya aplicadas ni inventar un evento de escritura histórico. Cualquier instalación futura, consulta a Meta, conciliación o cambio de flags requiere autorización separada. No se avanzó a B ni se aplicó su propuesta durante esta revalidación. El registro de esta confirmación solo actualizó este informe local, sin operaciones remotas.
