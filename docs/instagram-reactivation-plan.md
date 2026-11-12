# Reactivación de Instagram — plan condicionado, sin ejecutar

Proyecto exclusivo: **blsezjyhiholzwmqewef**. Cuenta configurada: **17841465479111585** (@prartjewelry). Esta revisión solo leyó archivos y ejecutó pruebas con PostgreSQL local desechable y Meta simulado. No consultó Supabase, GitHub, Pages ni Meta. No cambió flags, publicaciones, migraciones, código de funciones, permisos o secretos; no hizo commits ni pushes. Toda operación remota propuesta requiere autorización expresa posterior.

## Conclusión

**No retirar mantenimiento todavía.** El frontend es compatible con el contrato desplegado y la etapa 4 quedó cerrada, pero el intento histórico en waiting no está protegido por una cuarentena persistente de cuenta que sobreviva a la retirada del mantenimiento. Tampoco existe actualmente una vía de diagnóstico Meta bajo mantenimiento que conserve intacto ese intento.

La siguiente autorización recomendable es únicamente revalidar evidencia remota por lecturas acotadas, sin health ni consultas a Meta. Después deben prepararse localmente los controles faltantes; su instalación futura requerirá otra aprobación concreta. La aceptación previa de riesgo para instalar esquema, funciones y frontend no autoriza activar escrituras ni demuestra drenaje.

## Evidencia disponible y sus límites

La última comprobación Cloud registrada por la etapa 4 corresponde a **2026-11-12T04:52:17.963999Z**; no se presenta como una lectura nueva:

- schema_version=2, maintenance=true, frontend_ready=false.
- Epoch **3cd91507-439a-4a97-85bc-1dac9d218856**, tres filas readiness y versiones publish v6 / prepare v5 / status v3, ACTIVE y verify_jwt=true.
- 18 publicaciones, huella completa **44eec1f11b52979b908bbe88478b50cd**, diez migraciones, cero eventos y cero filas de seguridad.
- Publicación **f7120683-6f03-43a6-bcf9-18a7ef5d69fe**, intento **9723a05a-982c-43f5-9aac-00491fdcc032**, revisión 1: publishing/waiting, updated_at **2026-11-07T06:28:09.495369Z**, sin instagram_id. Principal **17931282783182638**; hijos **17931282594182638**, **17931282639182638**.
- Frontend publicado: commit **bba1960307e7aab1db481421c189562a496733dc**; run manual **43157443047**, build/deploy success. release.json verificó SHA y epoch. La prueba de catálogo real no llamó a Edge Functions.
- El usuario confirmó con su sesión administrativa real: **«Sí, aviso visible y controles deshabilitados»**. La prueba automatizada del panel usó autenticación y backend simulados y se documenta por separado.

No se recuperó ninguna sesión administrativa anterior. **drain_verified=false** permanece como incertidumbre independiente del resultado remoto en Meta.

## Hallazgos del código actual

### Contrato y mantenimiento

instagramService exige esquema 2, flags booleanos y epoch válido; rechaza mantenimiento o frontend_ready=false antes de invocar las funciones. AdminInstagramPage bloquea mientras carga, si falla el RPC, durante mantenimiento o sin activación; InstagramComposer deshabilita el editor y sus acciones. Actualizar disponibilidad e inspeccionar historial no equivale a continuar un intento.

Las tres funciones autentican mediante Supabase Auth y comprueban administrador; verify_jwt=true está en el config. Los handlers aplican mantenimiento antes de las operaciones normales y metaRequest vuelve a comprobarlo antes de la reserva SQL. Health y maintenance-probe son excepciones previstas: **health escribe readiness**, por lo que no forma parte de una revalidación estrictamente de solo lectura.

**Limitación:** requireInstagramRuntime y begin_instagram_request no exigen frontend_ready=true. La UI y el servicio sí lo exigen, y el setter existente ordena la activación, pero frontend_ready=false no debe describirse como un interruptor independiente que bloquee un cliente que llame directamente al backend. maintenance=true es el corte actual. El setter tampoco consulta cuarentenas, intentos inciertos ni resultados de conciliación antes de permitir desactivar mantenimiento.

### Exclusión existente y hueco histórico

begin_instagram_request serializa reservas por cuenta con bloqueo de fila y conserva active_request_id, pending_write_id y audit_hold. Una escritura con auditoría fallida o resultado incierto conserva el latch; la edad no libera POST. ack_instagram_write exige evento exitoso, ID remoto guardado y correspondencia de intento/revisión. Las pausas y errores de Meta no autorizan reenvíos automáticos.

Sin embargo, la migración no inicializa cuarentena para los intentos históricos waiting. El filtro de publicaciones históricas cubre publish_unknown, operation.kind=write y fases working/sending ambiguas, **pero no waiting sin operation de escritura**. Además excluye del filtro la misma publicación p_post. No hay eventos previos que se puedan importar para este caso: el último inventario tenía cero eventos y cero filas de seguridad.

Se reprodujo con las migraciones reales en PGlite local, sin HTTP externo:

| Escenario local | Resultado |
| --- | --- |
| Mantenimiento activo y solicitud de POST | INSTAGRAM_MAINTENANCE |
| Registro histórico waiting antes de reservas | Cero filas de seguridad; no se crea cuarentena |
| Mantenimiento retirado solo en fixture, POST de otro borrador | Reserva concedida; no se envió a Meta |
| Mismo intento, POST directo a la reserva SQL | Reserva concedida; no se envió a Meta |
| Runtime maintenance=false/frontend_ready=false con fetch simulado | El guard compartido lo admite |
| Tras revertir las transacciones locales | Publicaciones locales intactas |

No se concluye que un clic actual pueda publicar: **mantenimiento sigue protegiendo producción** y existen otros guards de estado/digest. La reproducción demuestra que no hay una garantía suficiente de exclusión por cuenta para reactivar con el intento pendiente.

### Conciliación actual

advancePublication(action=reconcile) no crea contenedores ni llama a media_publish. Para un contenedor sin instagram_id consulta status_code, pero después **modifica el post a publish_unknown**, incluso cuando la respuesta es FINISHED. También ejecuta auditoría y el reconocimiento inicial de un posible latch. No es un diagnóstico sin modificaciones locales. Con maintenance=true ni siquiera puede alcanzarse por el handler actual.

continue desde waiting no es conciliación: puede avanzar a ready y, con nuevas invocaciones, ejecutar media_publish. start, continue y cancel quedan excluidos del procedimiento de diagnóstico.

Si ya existe un instagram_id verificado, reconcile puede obtener permalink y actualizar metadatos sin reenviar; **este intento carece de ese ID**, por lo que ese camino no resuelve el caso actual. El script repair-instagram-published-status.sql corresponde a otro registro con un ID ya guardado; no usarlo ni adaptarlo como atajo para este intento.

## Plan por etapas y autorizaciones separadas

### A. Revalidación remota de solo lectura

Solicitar autorización únicamente para GET de metadatos/versiones y publicación servida, y consultas fijas mediante /database/query/read-only con BEGIN READ ONLY y ROLLBACK. No ejecutar health, RPCs administrativas, conciliación ni llamadas a Meta.

Verificar proyecto, SHA/release.json, versiones/IDs/JWT, cuerpos de RPCs y permisos/RLS, flags/epoch, readiness exacta, historial, conteos/huellas e inventario íntegro del intento. Buscar automatizaciones o despliegues inesperados en las fuentes disponibles; volver a confirmar administrativamente el alcance de servicios externos. No confundir ausencia de logs con ausencia demostrada de workers.

**Salida exigida:** baseline actualizado y consistente; lista explícita de observaciones y límites. Ante cualquier diferencia inesperada, detenerse y mantener mantenimiento, sin reparar automáticamente.

### B. Preparación local de cuarentena y diagnóstico

Preparar una propuesta concreta, pruebas y diff; **este documento no implementa esa propuesta**. No modificar las migraciones aplicadas. La solución recomendada requiere una futura migración aditiva y cambios de backend con su propio contrato de compatibilidad; deberán revisarse y autorizarse antes de instalarlos.

Requisitos verificables del nuevo control:

1. Cuarentena persistente por cuenta, con motivo, IDs originales de post/intento/revisión, evidencia y actor. Clasificar el caso como legado incierto, sin fabricar un evento POST ni asignarle un resultado remoto.
2. Inicialización atómica bajo mantenimiento a partir del baseline exacto. Bloquear **todo POST a Meta de la cuenta**, para el mismo intento y para otros borradores/funciones, antes de fetch y bajo el mismo orden de locks del protocolo. Mantener intactas todas las columnas del post original.
3. Ni edad, resume_instagram_account, recover_instagram_read, resolve_instagram_read_hold, un GET satisfactorio ni ack de otro evento pueden levantar la cuarentena. No reutilizar blocked_reason como única garantía: la acción existente de reactivar consultas lo elimina. No limpiar pending_write_id para permitir diagnóstico.
4. Liberación separada, explícita y auditada, con evidencia vinculada al caso exacto y control de concurrencia. Fallo de auditoría o PostgreSQL deja el bloqueo. No ofrecer un botón genérico de desbloqueo.
5. Ruta de diagnóstico autenticada y limitada a esta cuenta/IDs, disponible bajo mantenimiento solo si se autoriza específicamente. Allowlist de operaciones **GET a Meta**, sin engine.advancePublication, start, continue, cancel, creación de contenedores o media_publish. Escrituras locales limitadas a auditoría y evidencia aparte, conservando el intento.
6. Fallo cerrado ante esquema/capacidad incompatible; el backend debe comprobar permisos de operación, no delegar el bloqueo a frontend_ready ni a botones. Distinguir modos de diagnóstico y escritura sin permitir acceso normal durante mantenimiento.
7. Si cambian capacidades/protocolo, preparar un nuevo epoch y health/readiness de las versiones nuevas bajo mantenimiento; no reutilizar las tres filas actuales como prueba de código modificado. Actualizar verificadores y manifiesto con el nuevo baseline, sin alterar historial para hacer pasar pruebas.

**Salida exigida:** pruebas de seguridad contra SQL real y Meta simulado; revisión del diff; autorización concreta antes de aplicar cualquier nueva migración o desplegar funciones. Si no se autoriza ese trabajo remoto, conservar el bloqueo global actual. El código desplegado no permite prometer hoy una fase selectiva de diagnóstico segura con las garantías anteriores.

### C. Instalación futura de los controles, manteniendo suspensión

Solo tras aprobar el resultado concreto de B: respaldo/evidencia, revalidación A, migración aditiva primero, backend después y verificación por pasos. No habilitar flags durante una instalación parcial. Verificar cuarentena efectiva para cuenta/mismo intento y preservación de las 18 filas; health registrará readiness y deberá estar expresamente incluido en esa autorización.

Los nuevos eventos de instalación/diagnóstico esperados harán que el conteo de auditoría deje de ser cero; comparar prefijos históricos y cambios autorizados, sin borrar registros para recuperar el conteo anterior. Mantener maintenance=true y frontend_ready=false.

### D. Investigación y eventual conciliación sin republicar

Requiere autorización independiente que enumere **GET a Meta** y las escrituras de auditoría/evidencia permitidas. Primero revisar la documentación oficial vigente de la API/configuración efectiva y definir endpoints, campos, permisos y límites; este turno no consultó documentación remota ni afirma que un endpoint nuevo pueda devolver el ID perdido.

Procedimiento propuesto una vez instalada B/C:

1. Congelar despliegues y conservar cuarentena/mantenimiento. Validar IDs/revisión/contenedores y registrar evidencia previa. No continuar el motor.
2. Consultar de forma acotada los contenedores conocidos y, solo si está documentado y autorizado, medios de la cuenta o un media ID identificado por evidencia independiente. Sin reintentos automáticos, sin seguir URLs externas de paginación y respetando Retry-After. No registrar tokens, cuerpos completos ni captions de terceros.
3. Clasificar los resultados, sin cambiar el post original:
   - PUBLISHED del contenedor: evidencia de publicación, pero puede faltar el ID del medio; mantener cuarentena hasta asociarlo de forma concluyente.
   - FINISHED o IN_PROGRESS: no prueban que nunca se envió media_publish ni autorizan reenviarlo.
   - ERROR, EXPIRED, 404, permiso inválido o búsqueda sin coincidencias: no prueban ausencia de una publicación anterior. Mantener la incertidumbre y el bloqueo.
   - Medio publicado inequívocamente asociado: verificar cuenta/ID/permalink y trazabilidad. Una coincidencia de caption, imagen u hora por sí sola no basta.
4. Guardar evidencia separada y producir una propuesta de conciliación, con exactamente los campos que se tocarían. Asociar un ID o cambiar el estado de la publicación requiere **otra autorización explícita**, actualización condicional por post/intento/revisión/updated_at, transacción, auditoría y preservación de IDs/contenedores. No fabricar una hora de publicación.
5. Si falta asociación concluyente, pedir evidencia a Meta/soporte o revisión humana sin publicar. Mantener el caso sin resolver y no habilitar escrituras de esta cuenta. No existe actualmente un RPC que transforme de forma segura el resultado histórico desconocido en una publicación confirmada.

La conciliación significa registrar evidencia de lo ya ocurrido, nunca enviar media_publish para averiguar si había ocurrido. El fin de un worker de Supabase no resuelve procesamiento aceptado por Meta.

### E. Preparar activación de interfaz, todavía sin escrituras

Exigir de nuevo: versión publicada/contrato compatible; backend esperado y JWT; readiness del epoch vigente; pruebas; cuarentena/diagnóstico verificados; ninguna escritura/evento sin finalizar inexplicado; pausas/bloqueos respetados; caso histórico resuelto o cuarentena intacta; revisión específica del riesgo residual de drenaje para este nuevo alcance.

Solo con autorización explícita puede marcarse frontend_ready=true **con mantenimiento aún activo**. En el contrato actual, el paso separado es set_instagram_maintenance(true,true); conserva epoch y exige tres readiness. No se ejecutó aquí. Confirmar estado por lectura y aviso UI: el panel debe seguir suspendido.

Readiness no contiene hash/versión nativa y no acredita conciliación: combinarla con metadatos, código aprobado y congelación de cambios. Marcar frontend_ready=true por sí solo no autoriza publicación ni valida la cuenta.

### F. Apertura supervisada y primera publicación

**Mientras el intento de esta cuenta siga incierto no permitir ningún POST a Meta en ella.** Es posible preparar un modo de consulta limitado bajo mantenimiento mediante B; no es posible ofrecer publicación normal solo cambiando los flags actuales.

Antes de quitar mantenimiento para permitir escrituras: resolver el caso con evidencia y autorización, liberar su cuarentena con auditoría, verificar ausencia de otros latches/pausas/operaciones activas y disponer de autorización nueva para el riesgo de activación. Si se exige certificación global del corte, obtener evidencia de Supabase antes de abrir. drain_verified no cambia por aceptación de riesgo.

El setter actual requiere primero frontend_ready almacenado y tres readiness; solo después set_instagram_maintenance(false,false) podría retirar mantenimiento. Estos ejemplos describen el contrato, **no son instrucciones autorizadas de ejecución**. Los nuevos controles de B deberán impedir que un cambio de flag evite las condiciones por cuenta.

La primera publicación real requiere aprobación aparte de contenido, cuenta, post, revisión y digest. Limitar temporalmente el permiso de escritura en backend al único borrador/revisión aprobado, con mecanismo ya probado. La política desplegada hoy es de toda la cuenta, no una allowlist de un borrador. No basta acordar que solo haya una pestaña abierta. La restricción no debe impedir los GET necesarios para evidenciar escrituras anteriores.

Un operador y una acción manual por paso; comprobar la confirmación y los checkpoints antes de continuar. Si hay timeout, 429, fallo de auditoría o resultado desconocido: detenerse, conservar latch/cuarentena y no reintentar POST. Tras éxito, verificar ID/permalink/auditoría sin republicar. No eliminar contenedores o evidencias durante la prueba.

## Pruebas adicionales que deben bloquear la activación

Además de las suites existentes, verificar antes de C/F:

- Waiting legado con principal/dos hijos y sin eventos: cuarentena inicializada sin tocar post; deniega POST de otro borrador y del mismo intento, desde las tres funciones y pestañas concurrentes.
- Modo diagnóstico bajo mantenimiento: GET explícito permitido con autorización; todo POST a Meta bloqueado incluso invocando directamente backend/RPC. Cero cambios del post original.
- PUBLISHED sin ID, FINISHED, EXPIRED/404 y búsqueda vacía: ningún caso concede automáticamente escritura o levanta cuarentena.
- resume, recuperación de GET, ack, fallos de SQL, reinicios y paso del tiempo: no levantan cuarentena de legado ni latches desconocidos.
- Autenticación inválida/no admin y manipulación de actor/account/post/revisión: cero operaciones externas; actor siempre de sesión verificada.
- 429 con fallo de finish, timeout después de POST, respuesta inválida, ID recibido antes de fallar el PATCH: no reenvíos y evidencia conservada.
- frontend_ready=false con cliente directo; flags leídos durante cambio concurrente; cambios de epoch/capacidad/esquema: bloqueo por backend donde corresponda, sin depender de UI.
- Liberación de cuarentena con evidencia incorrecta o concurrente: denegada; éxito permitido solo con vinculación exacta y auditoría atómica.
- Health y readiness del código nuevo; despliegue parcial; mantenimiento y frontendReady; compatibilidad de navegador y catálogo sin Meta real.
- Permiso temporal para un borrador/revisión: deniega los demás aunque estén preparados; doble clic/concurrencia no duplica envíos.
- Conservación íntegra de las publicaciones y eventos anteriores. Los cambios futuros aprobados se comparan con un diff esperado, no con excepciones generales.

En esta revisión pasaron **57 pruebas/subpruebas** de las suites exclusion, rollout, stage3, publish y pages-maintenance-release, con Meta simulado; también pasó la reproducción local descrita arriba. Eso demuestra el comportamiento actual y sus límites; **no se afirma que los controles propuestos ya existan o que sus pruebas nuevas estén implementadas**.

## Recuperación y criterios de parada

Ante diferencias de baseline, fallo de auth/auditoría/contrato, tráfico antiguo inexplicado, modificación del intento o despliegue parcial: detener el siguiente paso y mantener mantenimiento; no repetir escrituras, borrar eventos, alterar checkpoints ni restaurar versiones inseguras.

Si una activación futura ya retiró mantenimiento, volver a activarlo requerirá estar incluido expresamente en su autorización operativa. En el setter actual:

- set_instagram_maintenance(true,true) mantiene epoch/frontend_ready y bloquea nuevas reservas, si las tres readiness siguen siendo válidas.
- set_instagram_maintenance(true,false) activa mantenimiento, pone frontend_ready=false y **genera otro epoch**. Las readiness anteriores quedan inválidas por epoch; se necesitará health autorizado y una nueva verificación antes de reactivar. No repetir esta llamada como si fuera una comprobación idempotente de estado.

Ninguna opción cancela HTTP ya iniciado ni operaciones recibidas por Meta. La respuesta a un timeout no demuestra que el cambio de flags no ocurriera: consultar estado antes de repetir. Si no se puede acceder a la base, no se puede prometer un cambio de flag; mantener el comportamiento fail-closed del backend y evaluar reinstalar el puente solo con autorización correctiva específica. Ninguna recuperación incluye reapertura automática.

El riesgo de drenaje y el resultado de Meta son cuestiones separadas: conservar **drain_verified=false** hasta obtener evidencia suficiente. La aceptación de riesgo debe ser explícita para cada alcance posterior, nunca convertirse en una certificación.

## Próxima decisión

Autorizar, si se desea, **solo A: comprobaciones remotas de lectura en el proyecto y sitio fijados, sin health ni llamadas a Meta y sin ningún cambio**. La implementación local propuesta en B puede revisarse aparte; su instalación, diagnóstico Meta, conciliación, cambios de flags y publicación supervisada se autorizarán por separado sobre resultados concretos.
