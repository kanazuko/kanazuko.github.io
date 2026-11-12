# Etapa 4 — cerrada con mantenimiento activo

Proyecto: **blsezjyhiholzwmqewef**. Sitio: https://kanazuko.github.io/. Publicación realizada el **12 de noviembre de 2026 UTC**, todavía **11 de noviembre en Ciudad de México**. No se inició ninguna etapa posterior ni se habilitaron publicaciones Instagram.

## Identidad y ejecución real

- Commit revisado: **bba1960307e7aab1db481421c189562a496733dc**. No se crearon commits ni pushes adicionales durante esta reanudación.
- El run por push **43155661327** pasó las verificaciones y dejó deploy omitido. El workflow remoto ya requiere ejecución manual para publicar.
- El nuevo preflight pasó para ese SHA, las versiones 6/5/3 y el epoch aprobado. El informe local anterior se conservó fuera del árbol Git antes del control de limpieza.
- Se envió **un único dispatch**, iniciado a las **2026-11-12T04:50:51.2767707Z**, tras repetir todos los controles del runner. GitHub lo aceptó; no hubo reintentos.
- Run manual **43157443047**, event=workflow_dispatch, SHA exacto; build y deploy terminaron **success**: https://github.com/kanazuko/kanazuko.github.io/actions/runs/43157443047.
- Pasaron auditoría de archivos, lint/pruebas, comprobación del SHA, preflight de mantenimiento, build, recibo, auditoría de artefacto y la nueva comprobación de SHA/epoch/flags anterior a deploy.
- Artefacto **github-pages**, ID **13916018875**, 189384 bytes, creado a las 04:51:24 UTC. Digest publicado por GitHub: **sha256:cd0882e951c96cf1a0e6efc9084b06301fc84e5e59bcd2fe7d40aa1557cdbaf7**.

El bloqueo anterior PAGES_OTHER_RUN_ACTIVE no se convirtió en una excepción ni se omitió. Esta reanudación fue autorizada y el control pasó sin modificar su implementación.

## Verificación del sitio servido

GET de release.json con parámetro de verificación: HTTP 200, SHA exacto, deployment_epoch **3cd91507-439a-4a97-85bc-1dac9d218856** y maintenance_expected=true.

La comprobación con navegador aislado y datos públicos reales verificó inicio, catálogo, detalle de producto, fotografía cargada, recarga de ruta y distribución móvil sin desbordamiento. El catálogo renderizó 830 tarjetas; esto no constituye una auditoría individual de las 830 piezas ni de todas sus fotografías. No hubo errores JavaScript, solicitudes bloqueadas ni llamadas a Edge Functions. Las solicitudes permitidas eran GET del sitio, catálogos públicos, fotografías públicas y fuentes; las escrituras y rutas Edge estaban bloqueadas.

Otra comprobación descargó el JavaScript realmente servido por Pages, pero interceptó **todo el backend** con datos y autenticación ficticios: búsqueda, filtros, orden, producto, visor, navegación, recarga y panel Instagram en mantenimiento pasaron. Aviso visible, botones de conexión/publicación deshabilitados y cero llamadas a Edge Functions. No se envió el token ficticio a Supabase. Esta prueba no equivale a una sesión administrativa real.

Una primera invocación de ese script auxiliar tuvo un error local de comillas antes de iniciar el navegador; se corrigió únicamente su transporte por stdin y la comprobación pasó. No implicó cambios de fuente, configuración o producción.

**Comprobación humana con sesión administrativa real: confirmada por el usuario.** En respuesta a la solicitud de abrir el panel mediante el flujo habitual, sin accionar publicaciones, confirmó: «Sí, aviso visible y controles deshabilitados». Esta evidencia procede de su observación, no de una sesión administrativa ejecutada por el agente. No se solicitaron tokens por chat ni se recuperaron sesiones anteriores.

## Conservación y seguridad después de Pages

Snapshot por API de solo lectura, transaction_read_only=on, a las **2026-11-12T04:52:17.963999Z**:

- schema_version=2; **maintenance=true; frontend_ready=false**.
- Epoch sin cambios y exactamente tres filas readiness de publish/prepare/status, esquema 2 y el mismo epoch. Sus checked_at originales se conservaron.
- Funciones publish **v6**, prepare **v5**, status **v3**, mismos IDs, ACTIVE y verify_jwt=true. No se invocó health para actualizar readiness.
- **18 publicaciones**, huella **44eec1f11b52979b908bbe88478b50cd**, sin cambios.
- Intento **9723a05a-982c-43f5-9aac-00491fdcc032**, publicación f7120683-6f03-43a6-bcf9-18a7ef5d69fe, revisión 1: **publishing/waiting**, updated_at 2026-11-07T06:28:09.495369Z y sin instagram_id. Conserva principal 17931282783182638 e hijos 17931282594182638 / 17931282639182638.
- Diez migraciones, cero eventos y cero filas de seguridad.
- **drain_verified=false**. No se certifica el drenaje histórico ni se resuelve lo que Meta pudiera haber recibido previamente.

No se ejecutaron migraciones, despliegues Edge, cambios de permisos/secretos/flags, operaciones contra Meta ni continuaciones, conciliaciones, cancelaciones o reintentos del intento pendiente.

## Evidencia y límites

Evidencia privada de esta etapa:

- Directorio original prartjewelry-stage3-20261111T205009Z en Temp: informe previo conservado, stage4-published-state.json y stage4-published-functions.json.
- Navegador con datos reales: prart-stage4-live-CWfr0t, incluye result.json y capturas.
- Bundle servido con backend simulado: prart-public-stage4-t9r9Pq, capturas del catálogo y panel.

Este informe es local y **no se subió al repositorio**. El sitio ya sirve el frontend autorizado bajo mantenimiento. Con la confirmación humana registrada, **se declara cerrada únicamente la etapa 4**. No se realizaron nuevas operaciones remotas para registrar esta confirmación. La activación de Instagram y cualquier etapa posterior requieren una autorización separada y resolver sus controles independientes, incluido el intento incierto. Se conservan maintenance=true, frontend_ready=false y drain_verified=false conforme a la última comprobación Cloud documentada.
