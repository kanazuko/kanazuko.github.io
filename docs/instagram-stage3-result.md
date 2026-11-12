# Etapa 3 — cerrada con las tres funciones verificadas y mantenimiento activo

**Resultado final real de Supabase Cloud: 11 de noviembre de 2026, 22:19:37.039 UTC (16:19, Ciudad de México).** Proyecto exclusivo: **blsezjyhiholzwmqewef**. Las tres funciones completas están instaladas y verificadas. **Se declara cerrada únicamente la etapa 3. La etapa 4 no se inició ni está autorizada.**

## Versiones y resultados confirmados

| Función | ID | Versión nativa | Estado | verify_jwt | Health | Maintenance-probe | Protocolo backend |
| --- | --- | --- | --- | --- | --- | --- | --- |
| instagram-publish | 4793ddd5-8860-434f-b7f3-0f413720e509 | **6** | ACTIVE | true | **200** | **423**, INSTAGRAM_MAINTENANCE | 2 |
| instagram-prepare | 9424063a-13d4-4f77-87c3-9c327c55ae29 | **5** | ACTIVE | true | **200** | **423**, INSTAGRAM_MAINTENANCE | 2 |
| instagram-status | a52026d6-6615-41d3-b6d6-00088752c1cf | **3** | ACTIVE | true | **200** | **423**, INSTAGRAM_MAINTENANCE | 2 |

Publish y prepare conservan las verificaciones satisfactorias previamente registradas; no se redesplegaron para completar status. El último intento de la ventana privada de status terminó con salida **0**, comprobó también no-store, releyó el estado antes/después y confirmó el mismo epoch. No se recuperaron tokens anteriores ni se guardaron o mostraron credenciales.

El intento anterior había terminado con 401. La repetición autorizada funcionó **sin cambios de funciones, permisos, secretos ni herramientas**; no se atribuye retrospectivamente una causa concreta al 401, ya que aquel diagnóstico no identificaba la subpetición. La condición para realizar un nuevo diagnóstico no se produjo en el último intento satisfactorio.

## Las tres filas readiness observadas

Existen **exactamente estas tres filas**, todas con schema_version=2 y deployment_epoch **3cd91507-439a-4a97-85bc-1dac9d218856**:

| function_name | schema_version | checked_at UTC |
| --- | --- | --- |
| instagram-publish | 2 | 2026-11-11T20:53:18.592419Z |
| instagram-prepare | 2 | 2026-11-11T20:59:42.511105Z |
| instagram-status | 2 | 2026-11-11T22:18:53.224011Z |

Las filas anteriores de publish/prepare mantienen sus timestamps. La verificación de status solo añadió su readiness mediante el health previsto. Estos registros acreditan nombre, protocolo y epoch; la versión nativa se comprobó separadamente mediante el inventario de funciones.

## Seguridad y conservación final

- **schema_version=2, maintenance=true, frontend_ready=false**, deployment_epoch sin cambios.
- **drain_verified=false**: el cierre no certifica el drenaje histórico/global ni resuelve el resultado en Meta. Se conserva el riesgo residual aceptado exclusivamente para el despliegue bajo mantenimiento.
- **18 publicaciones** con huella completa **44eec1f11b52979b908bbe88478b50cd**, idéntica al snapshot anterior al primer despliegue.
- El inventario pendiente completo también coincide: intento **9723a05a-982c-43f5-9aac-00491fdcc032**, publicación f7120683-6f03-43a6-bcf9-18a7ef5d69fe, revisión 1, **publishing/waiting**, contenedor principal 17931282783182638 e hijos 17931282594182638 / 17931282639182638, sin instagram_id y updated_at **2026-11-07T06:28:09.495369Z**.
- Las mismas diez versiones de migraciones, **cero eventos Instagram y cero filas de seguridad**. No se ejecutaron migraciones adicionales ni cambios de permisos, secretos o flags.
- Los hashes del manifiesto aprobado siguen coincidiendo; los respaldos originales del puente permanecen conservados. Las tres rutas ya ejecutan las funciones completas, protegidas por el mantenimiento SQL; no se desactivó esa protección.
- Las verificaciones usaron solo las rutas de gestión, lectura de estado y health/maintenance-probe revisados. No enviaron solicitudes a Meta ni ejecutaron el motor de publicación, conciliación o recuperación. Esto no constituye una observación independiente de todo el tráfico histórico o de terceros.
- No hubo commits, pushes, actualizaciones de Pages ni reanudación/cancelación/reintento del intento pendiente.

La comparación local de los snapshots y pruebas sanitizadas confirmó publicaciones, inventario pendiente, lista de migraciones y fila de control **idénticos antes y después**; únicamente readiness pasó de vacío a estas tres filas, conforme al alcance autorizado.

## Evidencia final y límite de autorización

Directorio privado: `C:\Users\larul\AppData\Local\Temp\prartjewelry-stage3-20261111T205009Z`. Además de respaldos, cortes y fallos históricos, contiene **publish-verification.json, prepare-verification.json, status-verification.json, functions-final.json, state-final.json y stage3-completed.json**. La evidencia no contiene JWT, claves ni contenido completo de publicaciones.

**No se debe volver a ejecutar el despliegue de ninguna de las tres funciones para cerrar esta etapa: ya está cerrada.** Mantener maintenance=true y frontend_ready=false. Antes de cualquier habilitación futura, el intento histórico y la incertidumbre de Meta siguen requiriendo tratamiento independiente: waiting por sí solo no es una cuarentena persistente de toda la cuenta. No comenzar la etapa 4 ni activar publicaciones sin autorización expresa.

---

## Historial de verificaciones e interrupciones anteriores al cierre

Los párrafos siguientes conservan el registro cronológico previo. Sus estados de bloqueo describen aquel momento y **no sustituyen el resultado final anterior**.

**Última ejecución autorizada tras renovar la sesión:** el verificador de status terminó con salida **1**, fase **http**, código **HTTP_UNAUTHORIZED**, estado **401**. Esta vez superó las comprobaciones locales de formato y expiración y alcanzó HTTP. El diagnóstico actual asigna el nombre de función a toda la secuencia, pero no distingue si el 401 corresponde al GET público de estado, al health o al probe. No se atribuye sin evidencia a un JWT incorrecto ni a una clave pública incorrecta. No se imprimieron credenciales, encabezados o cuerpos de error, ni se conservaron tokens para recuperarlos después.

Se detuvo sin nuevos intentos, despliegues o recuperación. La comprobación final de solo lectura de **22:15:08.058 UTC (16:15, Ciudad de México)** confirma versiones **6/5/3**, ACTIVE y verify_jwt=true, esquema 2, maintenance=true, frontend_ready=false, mismo epoch y **solo las dos filas readiness de publish/prepare** con checked_at originales. No se registró readiness de status. Siguen las 18 publicaciones con la huella completa original, el intento publishing/waiting intacto, diez migraciones, cero eventos y cero filas de seguridad. `drain_verified=false`.

**La etapa 3 no está cerrada.** Antes de otra prueba conviene diagnosticar qué subpetición recibe el 401 y mejorar su identificación local sin registrar valores de credenciales ni respuestas sensibles. No desactivar JWT, cambiar permisos/secretos ni redesplegar funciones para sortearlo. La etapa 4 no se inició. Evidencia sanitizada: status-verification-http401.json, state-after-status-http401.json y functions-after-status-http401.json en el directorio privado de esta etapa.

**Última repetición autorizada:** el preflight de solo lectura de **21:54:11.193 UTC (15:54, Ciudad de México)** confirmó versiones 6/5/3 ACTIVE/JWT=true, manifiesto intacto, esquema 2, maintenance=true, frontend_ready=false, el mismo epoch, exactamente readiness de publish/prepare y las 18 publicaciones con la huella original. Se volvió a abrir únicamente la ventana privada de status. Terminó con salida **1**, fase **local_validation**, código **SESSION_EXPIRED**. El JWT pudo analizarse pero su expiración ya estaba vencida; no se ejecutó HTTP ni se verificó su firma en Supabase. No se guardaron credenciales ni se recuperaron tokens anteriores.

Se detuvo nuevamente sin reintentos automáticos, despliegues, cambios de flags ni recuperación. La etapa 3 continúa abierta y la etapa 4 no se inició. El próximo intento necesita renovar la sesión normal del catálogo y obtener un access_token nuevo; no sirve volver a pegar el valor caducado. No redesplegar ninguna función.

**Actualización autorizada del 11 de noviembre:** se revalidaron proyecto, manifiesto, respaldo, versiones 6/5/2, dos filas readiness, flags, epoch y conservación de datos. Se desplegó únicamente status entre **21:10:55.125 y 21:10:58.258 UTC**; la consulta posterior confirmó **v3, ACTIVE, verify_jwt=true**. Publish y prepare permanecen en v6/v5. Su ventana privada terminó con salida **1**, fase **local_validation**, código **SESSION_INVALID**, antes de cualquier HTTP. Se detuvo la comprobación; no se presenta health/probe de status ni una tercera fila readiness como verificados. **La etapa 3 no está cerrada y la etapa 4 no se inició.** No se necesita redesplegar ninguna función; repetir la verificación requiere autorización posterior conforme a la condición de parada.

Snapshot final de solo lectura a las **21:21:58.971 UTC (15:21, Ciudad de México)**: versiones **6/5/3**, todas ACTIVE/JWT=true; esquema 2, maintenance=true, frontend_ready=false, mismo epoch; exactamente readiness de publish y prepare, con los mismos checked_at. Las 18 publicaciones mantienen la huella 44eec1f11b52979b908bbe88478b50cd y el intento publishing/waiting conserva todos sus identificadores y updated_at. Siguen diez migraciones, cero eventos y cero filas de seguridad. `drain_verified=false`.

SESSION_INVALID indica que no se superaron las comprobaciones locales de formato/campos del JWT; no acredita un rechazo de Supabase Auth ni de Meta y no permite inferir el contenido pegado. No se mostraron o guardaron credenciales. El proceso terminó, no se reabrió la ventana ni se ejecutó recuperación. Evidencia adicional: status-verification-failed.json, state-after-status-stopped.json y functions-after-status-stopped.json en el directorio privado de esta etapa.

**Comprobación anterior del 11 de noviembre de 2026, 21:00 UTC (15:00, Ciudad de México).** Proyecto exclusivo: **blsezjyhiholzwmqewef**. El usuario autorizó repetir únicamente la verificación pendiente de prepare y pidió confirmar las dos filas readiness antes de autorizar status. Esa comprobación terminó correctamente, sin redesplegar publish ni prepare. Posteriormente autorizó el despliegue de status descrito arriba.

## Resultado real de la reanudación

| Función | ID | Versión actual | Estado / JWT | Health | Maintenance-probe |
| --- | --- | --- | --- | --- | --- |
| instagram-publish | 4793ddd5-8860-434f-b7f3-0f413720e509 | **6**, completa | ACTIVE / true | **200**, protocolo 2 | **423**, INSTAGRAM_MAINTENANCE |
| instagram-prepare | 9424063a-13d4-4f77-87c3-9c327c55ae29 | **5**, completa | ACTIVE / true | **200**, protocolo 2 | **423**, INSTAGRAM_MAINTENANCE |
| instagram-status | a52026d6-6615-41d3-b6d6-00088752c1cf | **3**, completa | ACTIVE / true | No confirmado: verificador terminó con HTTP 401 | No confirmado |

Antes de desplegar se repitieron proyecto, los 17 hashes del manifiesto, snapshot Cloud e inventario con JSON corregido. Los IDs y versiones iniciales v5/v4/v2 coincidieron exactamente; el estado era esquema 2, maintenance=true, frontend_ready=false, epoch esperado, readiness vacío y datos históricos intactos. Se conservaron nuevos respaldos independientes de las tres funciones; sus tres fuentes TypeScript tienen el SHA-256 del puente revisado: 27f85bb5fca474dc6350957fd9d375044e894956a3150609c96d73bb7cb3a995.

La ventana inicial del puente verificó las tres respuestas 423, código e identificador con credenciales nuevas. Publish se desplegó entre **20:52:38.794 y 20:52:41.851 UTC**; su ventana privada confirmó health 200, probe 423, flags y epoch. Antes de avanzar se verificaron nuevamente metadatos, readiness y huella histórica. Prepare se desplegó entre **20:54:03.348 y 20:54:06.602 UTC**, y se confirmó v5/ACTIVE/JWT=true.

## Fallo anterior de entrada y repetición autorizada

La ventana privada de prepare terminó con salida **1**, fase **local_validation**, código **INPUT_INVALID**. No se conserva ni se infiere el contenido de los campos. La validación ocurrió antes de enviar HTTP: no ejecutó health, no registró readiness de prepare ni realizó el probe. No es un resultado HTTP ni una prueba de fallo del backend.

**Se detuvo el procedimiento sin desplegar status, repetir la ventana o ejecutar recuperación remota.** Solo se recogieron después un snapshot final de solo lectura y el inventario para informar el estado observado.

Posteriormente el usuario autorizó una nueva ejecución de la ventana de prepare, después de revalidar proyecto, manifiesto, versiones v6/v5/v2, JWT y estado de Cloud. El snapshot previo confirmó solo readiness de publish. La ventana revisada recibió credenciales nuevas por stdin y terminó con **salida 0**, health **200**, probe **423**, backend_version=2 y flags/epoch correctos. No se reprodujo INPUT_INVALID, por lo que no fue necesario inspeccionar ni modificar la entrada local. Los procesos dedicados finalizaron sin mostrar o guardar credenciales.

Se confirmó por lectura que se añadió únicamente readiness de prepare. **No se desplegó status:** se respeta el punto de autorización posterior solicitado por el usuario, una vez demostradas las dos filas esperadas.

## Estado de seguridad y conservación confirmado

Snapshot Cloud de **21:00:23.458 UTC**, transaction_read_only=on:

- **schema_version=2, maintenance=true, frontend_ready=false**.
- deployment_epoch **3cd91507-439a-4a97-85bc-1dac9d218856**, sin cambios; **drain_verified=false**.
- Existen **exactamente dos filas readiness**, aún no tres:

| function_name | schema_version | deployment_epoch | checked_at UTC |
| --- | --- | --- | --- |
| instagram-publish | 2 | 3cd91507-439a-4a97-85bc-1dac9d218856 | 2026-11-11T20:53:18.592419Z |
| instagram-prepare | 2 | 3cd91507-439a-4a97-85bc-1dac9d218856 | 2026-11-11T20:59:42.511105Z |

- Las **18 publicaciones** conservan la huella completa **44eec1f11b52979b908bbe88478b50cd**. El intento **9723a05a-982c-43f5-9aac-00491fdcc032**, publicación f7120683-6f03-43a6-bcf9-18a7ef5d69fe, sigue en publishing/waiting, revisión 1, sin instagram_id, con principal 17931282783182638 e hijos 17931282594182638 / 17931282639182638. updated_at sigue siendo **2026-11-07T06:28:09.495369Z**.
- Historial con las mismas diez migraciones; cero eventos Instagram y cero filas de seguridad. No se ejecutaron migraciones ni se modificaron permisos, secretos o flags.
- Las solicitudes del procedimiento se limitaron a gestión, snapshots, verificación del puente y health/probe revisados de publish y prepare. Esos handlers no alcanzan Meta en estas rutas; no se ejecutaron consultas o publicaciones a Meta. Esta observación no certifica el tráfico global de terceros ni resuelve operaciones que Meta pudiera haber recibido anteriormente.
- No hubo commits, pushes, cambios de Pages ni operaciones continue/reconcile/cancel/retry sobre el intento histórico.

## Evidencia y continuación pendiente

Directorio privado: `C:\Users\larul\AppData\Local\Temp\prartjewelry-stage3-20261111T205009Z`. Contiene respaldos aislados, hashes, manifiesto aprobado, estados previos/posteriores, metadatos, resultado del puente, verificación satisfactoria de publish, fallo anterior sanitizado de prepare y su repetición satisfactoria en prepare-verification.json. state-after-prepare-recheck.json y functions-after-prepare-recheck.json conservan el snapshot actual. Los archivos de deployment con health_verified=false describen el momento del despliegue; los archivos separados de verificación registran el resultado posterior.

El usuario autorizó desplegar y verificar **únicamente status**, y el despliegue v3 está confirmado. La primera ventana falló con SESSION_INVALID; la repetición posterior autorizada falló con SESSION_EXPIRED, ambas antes de HTTP. Para una nueva ejecución, renovar primero la sesión y obtener un access_token vigente introducido de nuevo en la ventana privada; no redesplegar ninguna función ni recuperar credenciales anteriores. Exigir health 200/probe 423 y confirmar después por lectura exactamente tres filas readiness del mismo epoch, flags y publicaciones intactas. Ante un fallo, detenerse nuevamente sin recuperación ni nuevos despliegues. No avanzar a la etapa 4 sin autorización expresa.

---

## Registro histórico del primer intento, anterior a esta reanudación

Proyecto exclusivo: **blsezjyhiholzwmqewef**. Fecha: 11 de noviembre de 2026. El usuario autorizó la etapa 3 bajo mantenimiento y aceptó el riesgo residual de drenaje. El procedimiento se detuvo en una comprobación previa, conforme a su instrucción.

## Acciones realizadas

- Referencia local vinculada comprobada: proyecto correcto.
- Todos los hashes del manifiesto aprobado coinciden con las fuentes locales.
- El snapshot Cloud de solo lectura terminó con salida 0: esquema 2, maintenance=true, frontend_ready=false, epoch esperado, readiness vacío, diez migraciones, 18 publicaciones con la huella histórica original y cero eventos/filas de seguridad. No se efectuaron escrituras.
- Se solicitó el inventario de versiones con functions list. Su procesamiento local se detuvo antes de validar los IDs/versiones/JWT y antes de crear el directorio de respaldos.

## Fallo y diagnóstico local

El control produjo «Conjunto de funciones distinto» porque utilizaba `$rows = @($raw | ConvertFrom-Json)`. En PowerShell **5.1.26100.9818**, un array JSON completo puede aparecer como un único elemento del pipeline: Count devuelve 1 aunque dentro existan tres objetos.

Se reprodujo sin red usando el inventario privado conservado de la etapa anterior: la expresión original devuelve 1 y la asignación normalizada devuelve 3. Esto demuestra un defecto de procesamiento local; no se toma ese fallo como evidencia de una cuarta función ni se declara verificado el inventario remoto actual. La consulta deberá repetirse tras autorización para continuar.

Corrección local preparada en el plan:

```powershell
$parsed = $raw | ConvertFrom-Json
$rows = @($parsed)
```

Se añadió una prueba con JSON ficticio de tres funciones que ejecuta la normalización en PowerShell, sin red ni credenciales. El cambio no modifica las fuentes del deployment ni el manifiesto aprobado.

## Estado al detenerse en el primer intento

**Ninguna función fue desplegada; no se ejecutó health ni maintenance-probe.** No se abrió la ventana de credenciales. No se registraron filas readiness ni se crearon nuevos respaldos de etapa 3. El puente no se reemplazó y no se modificaron flags, esquema, permisos, secretos, publicaciones o intentos. No hubo llamadas a Meta, commits, pushes ni cambios de Pages. `drain_verified=false`.

Las versiones publish v5 / prepare v4 / status v2 son las últimas verificadas durante la preparación; no se presentan como una revalidación satisfactoria de este intento. Los resultados de health/probes de las funciones completas y las tres filas readiness siguen pendientes.

## Continuación propuesta entonces, ya autorizada posteriormente

Solicitar autorización para reanudar la etapa 3 con el procesamiento JSON corregido. Antes de cualquier despliegue se repetirán proyecto, manifiesto, snapshot y validación de versiones; después se conservarán los tres respaldos y se ejecutará la ventana privada inicial. No se saltará ningún control ni se cambiarán los números esperados para forzar un resultado satisfactorio. No se ejecutará recuperación remota sin autorización explícita.
