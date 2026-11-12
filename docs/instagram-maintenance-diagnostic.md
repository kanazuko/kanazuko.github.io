# Diagnóstico del puente — 11 de noviembre de 2026

Proyecto exclusivo: `blsezjyhiholzwmqewef`. Esta revisión modifica únicamente el verificador local, sus pruebas y documentación. No ejecuta migraciones, despliegues, cambios del frontend ni operaciones contra Meta.

## Fallo HTTP anterior

La salida anterior solo conservaba el código de salida 1: los manejadores de errores de PowerShell y Node ocultaban también la fase del fallo. Esa salida no permite determinar retrospectivamente si falló la entrada, transporte local, conexión, TLS, HTTP o respuesta.

La API de logs de Supabase devolvió una fila `function_edge_logs` a las **18:56:03.610 UTC**, con ruta `instagram-status` y **HTTP 401**. No contenía versión, ID de ejecución ni evento de runtime. Es compatible con un rechazo de la pasarela antes del handler y con que el verificador se detuviese en su primera ruta; no existe una correlación que permita atribuirlo concluyentemente a la prueba anterior ni distinguir JWT inválido/expirado de otros problemas de autenticación. No se consultaron encabezados, credenciales ni cuerpos de error. La consulta anterior de invocaciones terminaba a las 18:53:19 UTC y no cubría ese 401.

En la prueba anterior no se habían confirmado las tres respuestas 423, `INSTAGRAM_MAINTENANCE` y `prartjewelry-v1`. Las versiones ACTIVE no sustituyen esa comprobación. La repetición autorizada posterior sí las confirmó, como se registra a continuación.

## Repetición con credenciales nuevas: satisfactoria

Resultado recogido el **11 de noviembre de 2026 a las 19:24 UTC** mediante la ventana privada revisada. El proceso terminó con código **0** y `bridge_verified: true` para el proyecto indicado:

| Función | HTTP | Código | Identificador |
| --- | --- | --- | --- |
| `instagram-status` | 423 | `INSTAGRAM_MAINTENANCE` | `prartjewelry-v1` |
| `instagram-prepare` | 423 | `INSTAGRAM_MAINTENANCE` | `prartjewelry-v1` |
| `instagram-publish` | 423 | `INSTAGRAM_MAINTENANCE` | `prartjewelry-v1` |

También se validó `Cache-Control: no-store`. No se mostraron ni guardaron credenciales. Los procesos dedicados finalizaron. Esta prueba confirma el recorrido HTTP actual del puente; no determina retrospectivamente la causa del 401 anterior y no acredita drenaje. La salida conserva `drain_verified: false`.

## Cambios del verificador

- `scripts/check-instagram-maintenance.mjs`: errores tipados y salida con fase, código permitido, función y estado HTTP cuando existe. Distingue validación, DNS/conexión, TLS, timeout, HTTP y validaciones de JSON/código/marker/caché. Nunca imprime mensajes externos ni cuerpos de error.
- `scripts/verify-instagram-maintenance-input.mjs`: identifica errores del JSON/entrada privada y conserva solo el diagnóstico permitido.
- `scripts/verify-instagram-maintenance-local.ps1`: identifica entrada/cancelación, serialización, inicio del worker, tubería, timeout y salida inválida; filtra nuevamente los campos del diagnóstico.

Los destinos son constantes: únicamente `https://blsezjyhiholzwmqewef.supabase.co/functions/v1/{instagram-status,instagram-prepare,instagram-publish}?action=maintenance-probe`. No hay redirecciones ni reintentos. Se envía la clave pública en `apikey` y la sesión en `Authorization: Bearer <access_token>`, en campos distintos. La validación local rechaza claves intercambiadas, tokens expirados y referencias/issuers de otro proyecto. Estas comprobaciones de formato no verifican la firma ni acreditan membresía administrativa.

La entrada sigue siendo mediante ventana privada y stdin; no se recuperan sesiones anteriores ni se almacenan credenciales en archivos, argumentos o variables persistentes. Se limpian campos/buffers y terminan los procesos; no se promete borrado forense de todas las copias de cadenas en memoria.

Pruebas: los 13 casos específicos del verificador pasan; cubren diagnósticos, protección de salida, campos de credenciales y la transferencia real PowerShell → Node con un JWT ficticio expirado que se rechaza antes de hacer HTTP. También pasan `npm run lint` y la suite local completa con `node --test --test-reporter=dot`. Ninguna prueba utiliza credenciales reales ni llama a Meta.

## Drenaje: no verificado

Resultados reales de las fuentes de solo lectura:

- Logs, ventana 10 de noviembre 20:11:37 UTC a 11 de noviembre 19:11:37 UTC: existen datos de otras fuentes del proyecto, una fila de `function_edge_logs` y ninguna fila disponible de `function_logs`. La búsqueda ampliada no depende exclusivamente de IDs de funciones: también contempla las rutas. No hay eventos de inicio/fin o `ShutdownEvent` con los que correlacionar workers antiguos.
- Estadísticas combinadas, `interval=1day`, para cada una de las tres funciones: HTTP satisfactorio con `result: []`. No demuestra cero ejecuciones activas.
- Endpoint de métricas: HTTP 200; 318 nombres de métricas, ninguno identificado como función/worker/isolate/edge. No aporta evidencia de drenaje del runtime. No se imprimieron etiquetas de métricas.
- Inventario SQL de las **19:11:39 UTC**, ejecutado mediante la API de consulta de solo lectura con `transaction_read_only=on`: permanece un intento pendiente, sin cambios respecto al inventario anterior.

Intento `9723a05a-982c-43f5-9aac-00491fdcc032`, publicación `f7120683-6f03-43a6-bcf9-18a7ef5d69fe`, revisión 1, estado `publishing`, fase `waiting`, última actualización `2026-11-07T06:28:09.495369Z`. Conserva el contenedor principal y los dos hijos, sin ID de publicación. No se ha modificado, conciliado ni reintentado. Su estado persistido no demuestra si existe un worker activo ni cuál fue el resultado remoto.

La ausencia de registros de runtime es **evidencia insuficiente**, no ausencia demostrada de ejecuciones. Ni el tiempo transcurrido, ni ACTIVE, ni respuestas 423 posteriores prueban por sí solos la finalización de versiones antiguas.

## Siguiente acción segura

La comprobación HTTP ya fue satisfactoria; no se necesita repetirla para resolver este diagnóstico.

Actualización posterior: la [evaluación de riesgo del avance bajo mantenimiento](instagram-maintenance-risk-assessment.md) recoge nuevos logs de las ejecuciones del puente y una alternativa de avance limitado con aceptación explícita. No certifica drenaje histórico ni autoriza cambios. El estado sigue siendo `drain_verified=false`.

Para acreditar el drenaje se necesitan registros de invocación/runtime que relacionen las versiones antiguas y sus ejecuciones con finalizaciones o terminaciones. Si Dashboard/Logs Explorer no aporta esa evidencia, solicitar a soporte de Supabase evidencia del runtime para los IDs y versiones antiguas conservados en el respaldo, sin enviar tokens. Las estadísticas agregadas no sustituyen esa evidencia. Mantener el puente y la etapa 1 incompleta hasta resolver el drenaje; no avanzar a migraciones ni funciones completas.

Referencias: [API de logs](https://supabase.com/docs/reference/api/v1-get-project-logs), [campos de logs](https://supabase.com/docs/guides/observability/log-field-reference), [eventos de terminación](https://supabase.com/kb/troubleshooting/edge-function-shutdown-reasons-explained), [estadísticas de funciones](https://supabase.com/docs/reference/api/v1-get-project-function-combined-stats).
