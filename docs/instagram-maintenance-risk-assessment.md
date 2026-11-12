# Evaluación para avanzar con mantenimiento — 11 de noviembre de 2026

Proyecto exclusivo: **blsezjyhiholzwmqewef**. La evaluación original fue de solo lectura; no ejecutó migraciones, despliegues, llamadas a Meta ni modificaciones de publicaciones. **`drain_verified` permanece `false`.** Posteriormente el usuario aceptó expresamente el riesgo residual y autorizó únicamente la etapa 2 de esquema, condicionada a nuevas comprobaciones previas. También confirmó que no existen automatizaciones externas activas. Esa autorización no incluye funciones completas, frontend, retirada del puente ni operaciones sobre el intento pendiente. La [etapa 2 quedó cerrada con mantenimiento activo](instagram-stage2-result.md) tras aplicar las dos migraciones y completar las comprobaciones autorizadas. La etapa 3 no está autorizada.

## Conclusión

Es razonable considerar **únicamente la instalación posterior del esquema aditivo bajo mantenimiento**, con autorización y aceptación explícita de los supuestos y riesgos descritos abajo. No equivale a certificar históricamente el drenaje ni a habilitar el publicador. Si se exige garantía de corte global y ausencia de cualquier ejecución antigua sin aceptar esos supuestos, hace falta evidencia adicional de Supabase.

El fundamento combina un límite de vida del worker, versiones actuales comprobadas, respuestas identificadas del puente, nueva telemetría del runtime, revisión de mecanismos de ejecución independiente e inventarios estables. No se basa solo en que haya pasado tiempo.

## Límites oficiales y razonamiento condicionado

La [documentación de límites](https://supabase.com/docs/guides/functions/limits), consultada para esta evaluación, publica 150 segundos de vida del worker para Free y 400 para planes de pago. Incluye espera e I/O; un worker puede atender varias solicitudes durante esa vida. El timeout HTTP de 150 segundos no es una prueba de terminación del worker. Las [tareas en segundo plano](https://supabase.com/docs/guides/functions/background-tasks), incluido `EdgeRuntime.waitUntil`, siguen sujetas a los límites del runtime. La [nota oficial sobre wall clock](https://supabase.com/kb/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW) indica que actualmente ampliar ese límite requiere self-hosting.

Se usa **400 segundos como techo conservador de los dos planes públicos**, sin afirmar que se haya identificado el plan contratado ni obtenido una certificación específica del proyecto. No se encontró evidencia de un runtime alternativo; las funciones verificadas se ejecutan en Supabase Cloud. No se consultaron secretos o configuraciones confidenciales para esta evaluación.

La relación útil es:

`fin máximo condicionado = último instante en que puede nacer un worker antiguo + límite efectivo del worker`

El segundo término tiene documentación pública. El primero requiere justificar el corte de enrutamiento y cualquier posibilidad de volver a iniciar código antiguo. El límite de vida no impide que una ruta mal propagada arranque un worker nuevo con código viejo; por eso no basta sumar 400 segundos a un deploy y declarar drenaje.

Los materiales oficiales revisados no ofrecen un máximo contractual de convergencia global aplicable a este despliegue. Existe una [discusión en la organización de Supabase](https://github.com/orgs/supabase/discussions/51899) sobre el corte; no se toma como garantía oficial ni se usa su estimación de segundos como cota certificada.

## Evidencias reales

| Hecho | Resultado y alcance |
| --- | --- |
| Corte documentado | Inicio 18:42:53.877 UTC; publish completó 18:42:56.622, prepare 18:42:58.256 y status 18:43:00.131. Verificación conjunta de metadatos a las 18:43:01.428 del 11 de noviembre. Son tiempos del procedimiento local, no certificaciones de convergencia mundial. |
| Metadatos Cloud, 19:28:12 UTC | Solo se listan las tres funciones: publish v5, prepare v4 y status v2; ACTIVE y `verify_jwt=true`. Coinciden con el corte conservado. |
| Prueba HTTP real | Los logs sitúan las tres respuestas 423 a las 19:23:29–19:23:30 UTC. El verificador validó código, identificador y no-store, con salida 0 recogida a las 19:24 UTC. Confirma los recorridos probados, no todos los puntos de presencia. |
| Runtime de la prueba nueva | Boot y Shutdown correlacionados por execution_id para status v2, prepare v4 y publish v5. Shutdown `EarlyDrop` a las 19:24:44.528, 19:24:44.829 y 19:24:45.102 UTC. Prueba terminación de esas tres ejecuciones del puente; no de las versiones antiguas. |
| Consulta de logs reciente | Ventana 18:30:00–19:28:12 UTC, fuentes function_edge_logs y function_logs, sin filtro previo por versión. Diez filas: un 401 de status sin versión y nueve filas correspondientes a Boot, 423 y Shutdown de cada función nueva. No hay filas identificadas de versiones antiguas ni señal de truncamiento por el límite de 200 filas. La ausencia no acredita cobertura histórica completa. |
| Inventario PostgreSQL | API dedicada de solo lectura, `transaction_read_only=on`, observación 19:28:13 UTC: un intento pendiente, mismos IDs, revisión, fase y updated_at que antes del puente. |

**Cálculo ilustrativo, no certificado:** si 18:43:01.428 UTC fuese el último instante posible de arranque de código antiguo, con 400 segundos el límite sería **18:49:41.428 UTC**. La observación a las 19:28:12 UTC ocurre unos 45 minutos después del corte. Esto favorece la inferencia de que un worker preexistente ya terminó bajo el comportamiento estándar. No prueba el supuesto de corte global ni el resultado de sus llamadas externas.

## Las cuatro cuestiones por separado

1. **Drenaje técnico:** no se dispone de un inventario histórico completo de workers antiguos con sus terminaciones. El límite documentado y las evidencias convergen hacia una finalización esperable bajo los supuestos estándar. Se conserva `drain_verified=false`; no se inventa una lista vacía de workers activos.
2. **Nuevas invocaciones antiguas:** no se observan versiones antiguas en los registros disponibles. El plano de control muestra el puente y las tres pruebas alcanzaron sus versiones nuevas. Eso es evidencia favorable de enrutamiento actual, pero no una demostración de ausencia universal de tráfico antiguo, retrasado o dirigido por otra infraestructura.
3. **Intento en waiting:** intento `9723a05a-982c-43f5-9aac-00491fdcc032`, publicación `f7120683-6f03-43a6-bcf9-18a7ef5d69fe`, revisión 1, `publishing` / `waiting`, updated_at `2026-11-07T06:28:09.495369Z`. Mantiene contenedor principal `17931282783182638`, hijos `17931282594182638` y `17931282639182638`, sin instagram_id. No se modifica, continúa, cancela ni reintenta. Un checkpoint persistido no es un proceso vivo; tampoco prueba por sí mismo que no haya una operación remota pendiente.
4. **Resultado en Meta:** terminar un worker o bloquear nuevas rutas no revoca una solicitud ya aceptada por Meta. Los límites Supabase no acotan el procesamiento de Meta. El resultado sigue incierto; esta evaluación no consulta Meta ni habilita nuevos POST como consecuencia del tiempo transcurrido.

## Segundo plano, configuraciones y mecanismos externos

Inspección estática del código de las versiones respaldadas (publish v4, prepare v3 y status v1, incluidos sus módulos locales): no aparecen `waitUntil`, setTimeout/setInterval, lifecycle handlers, creación de workers, procesos, referencias de cola/scheduler ni invocaciones recursivas a `/functions/v1` o `functions.invoke`. Es una revisión del código disponible, no una prueba formal de todas las dependencias de terceros ni de todo el entorno externo. Las llamadas HTTP de trabajo no crean un límite de tiempo para el servidor receptor.

Inspección Cloud de solo lectura:

- No están instaladas las extensiones buscadas `pg_cron`, `pg_net`, `pgmq`, `http` ni `pg_task`.
- No existen los esquemas cron/net/pgmq/pgflow ni las tablas cron.job o net.http_request_queue. Tampoco tablas de colas en pgmq/pgflow.
- La búsqueda de patrones de despacho HTTP/Meta/colas en funciones SQL encontró únicamente `extensions.grant_pg_net_access`. Su nombre o presencia no constituye un job; pg_net no está instalado.
- El único trigger de instagram_posts es instagram_posts_updated → set_updated_at; su cuerpo no presenta los patrones de despacho buscados.
- En el repositorio no se encontró programación cron de Instagram en workflows, ni ejecución autónoma en el puente.

No se ha auditado la cuenta remota de GitHub, otras máquinas, n8n/Zapier, otros proyectos, proxies privados, automatizaciones de Meta ni aplicaciones con acceso independiente a sus credenciales. Debe confirmarse administrativamente que no existen publicadores externos, rollbacks automáticos o rutas alternativas al código antiguo. Los clientes que llamen al nombre normal de las funciones quedan cubiertos por el puente en los recorridos probados; un servicio que contacte Meta directamente queda fuera de esta protección. Una cadena de invocaciones puede crear workers sucesivos: el límite individual no acota toda la cadena si persiste un mecanismo que la reinicia.

## Condiciones para considerar solo la siguiente etapa

Antes de ejecutar nada, el responsable debe aceptar por escrito el alcance y riesgo residual. La aceptación no sustituye estos controles:

1. Mantener las tres funciones del puente sin cambios, JWT activo y ninguna operación de publicación. Conservar backups y evidencia del corte; no restaurar código antiguo ni permitir despliegues automáticos durante la ventana.
2. Confirmar ausencia de automatizaciones externas que publiquen directamente o reinstalen versiones antiguas. Si se descubre alguna o no puede delimitarse razonablemente el alcance, detener el avance y obtener evidencia adicional.
3. Revalidar inmediatamente antes del cambio los metadatos, inventario y preflight estructural de solo lectura, sin recuperar el JWT anterior. Cualquier cambio inesperado del intento o nueva ejecución antigua bloquea el procedimiento.
4. Limitar la autorización a instalar las dos migraciones aditivas previamente revisadas, con historial y transacción correctos. No modificar migraciones existentes, publicaciones, intentos ni contenedores. Mantener el puente mientras se valida el esquema resultante. El control nuevo se crea con maintenance=true y frontend_ready=false.
5. No desplegar funciones completas, actualizar frontend ni desactivar mantenimiento bajo esa misma autorización. Cualquiera de esas acciones requiere una evaluación y autorización posterior; ninguna puede basarse en convertir este informe en drain_verified=true.
6. Tratar el intento histórico y la incertidumbre de Meta como bloqueo independiente para reactivar escrituras de la cuenta. La fase waiting por sí sola **no es una cuarentena por cuenta**: no debe suponerse que la instalación del esquema convierta automáticamente ese caso en un latch de escritura desconocida. Revisar esa garantía antes de habilitar futuros POST, sin alterar ahora el registro histórico.

Riesgo residual aceptado en esa etapa limitada: no se ha demostrado históricamente la terminación de cada worker antiguo ni certificado el corte global; se asume el funcionamiento estándar del servicio hospedado, coherente con las observaciones actuales. Si ese supuesto falla, el código antiguo podría ignorar las protecciones nuevas. Por ello la recomendación no se extiende a reabrir operaciones Instagram ni a atribuir un resultado a Meta. No se asigna una probabilidad numérica sin datos que la sustenten.

Texto propuesto durante la evaluación original; el usuario emitió posteriormente la aceptación y autorización condicionada de etapa 2 descritas al inicio:

> Acepto el riesgo residual documentado de falta de certificación histórica y global del drenaje, bajo los supuestos y comprobaciones indicados. Autorizo únicamente preparar y ejecutar la etapa de esquema aditivo manteniendo el puente, maintenance=true y frontend_ready=false, sin desplegar funciones completas, habilitar publicaciones ni modificar o reintentar el intento pendiente. Reconozco que drain_verified continúa false y que el resultado en Meta sigue sin resolverse.

## Cuándo acudir a soporte

Es necesario si se exige una garantía de ausencia de workers antiguos sin aceptar el riesgo anterior; si aparece tráfico antiguo posterior al corte; si existe configuración especial, ruta alternativa o scheduler no explicado; o si se pretende reactivar escrituras sin resolver las garantías independientes de la cuenta.

Pedir específicamente para este proyecto y el corte 18:42:53–18:43:01 UTC: límite wall-clock efectivo y excepciones, confirmación de retirada de los deployment IDs antiguos en todas las regiones, posibilidad de nuevos arranques o direccionamiento de versiones retiradas, y evidencia de terminación/inactividad de workers antiguos. IDs antiguos: publish `4793ddd5-8860-434f-b7f3-0f413720e509` v4; prepare `9424063a-13d4-4f77-87c3-9c327c55ae29` v3; status `a52026d6-6615-41d3-b6d6-00088752c1cf` v1. No enviar tokens. No se ha contactado a soporte durante esta evaluación.
