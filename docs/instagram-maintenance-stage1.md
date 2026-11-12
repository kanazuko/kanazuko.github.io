# Etapa 1: puente de mantenimiento de Instagram

**Actualización de ejecución, 11 de noviembre:** el destino, respaldo e inventario previo se comprobaron; el puente ya está desplegado como publish v5, prepare v4 y status v2, con JWT activo. El verificador aislado confirmó 423, código e identificador en las tres rutas. El drenaje histórico sigue sin certificar. Consultar la [evaluación de riesgo](instagram-maintenance-risk-assessment.md) para considerar un avance limitado bajo mantenimiento: requiere una decisión explícita posterior y no autoriza cambios. Los comandos siguientes conservan el procedimiento original; no deben repetirse como consecuencia de esta actualización. La ventana inicial conjunta se sustituyó por un [verificador aislado y revisado](instagram-maintenance-credential-review.md); no reanudar el flujo conjunto anterior.

Preparación local del 11 de noviembre de 2026. Proyecto único: **blsezjyhiholzwmqewef**. El preflight estructural de Cloud ya fue satisfactorio. Esta etapa no instala las dos migraciones pendientes, las funciones completas del protocolo 2 ni el frontend. **Ningún comando remoto de este documento se ejecutó durante esta preparación. Requieren aprobación posterior.**

## Cambios remotos e impacto

Se crearán versiones nuevas de las tres funciones existentes, manteniendo sus nombres, rutas y `verify_jwt=true`. Todas usarán el handler de `scripts/instagram-maintenance/supabase/functions/maintenance/index.ts`, sin imports, acceso a secretos, lecturas/escrituras SQL, Storage ni HTTP saliente. `OPTIONS` devuelve 204; las demás solicitudes que alcancen el handler devuelven 423 con `INSTAGRAM_MAINTENANCE` y el header identificador `X-Instagram-Maintenance-Bridge: prartjewelry-v1`. La pasarela puede devolver 401 antes del handler para JWT inválidos; eso no verifica el puente.

El administrador no podrá verificar conexión, preparar/subir/limpiar imágenes, eliminar borradores mediante esas funciones, continuar, conciliar ni publicar. El frontend actualmente alojado podría mostrar el mensaje específico o un error genérico. El catálogo público, sus imágenes y el guardado directo de borradores mediante el RPC existente no cambian. No se eliminan ni actualizan borradores, publicaciones, contenedores o intentos. Los secretos existentes permanecen en Supabase, pero el puente no los consulta.

El despliegue es secuencial: **publish → prepare → status**. No existe un cierre atómico de las tres rutas. Hasta verificar las versiones nuevas y el drenaje, no afirmar que todo el sistema está detenido. Una petición antigua puede continuar ejecutándose; Meta también puede completar una escritura que ya recibió, aunque su Edge Function haya terminado.

## Archivos revisados y pruebas locales

Los tres bloques del config apuntan explícitamente al mismo entrypoint; no se despliega el contenido de `supabase/functions` del proyecto principal. El `project_id` local del puente no cambia el proyecto remoto: cada comando lleva su referencia explícita.

Las pruebas `tests/instagram-maintenance.test.js` recorren las tres rutas y acciones, con HTTP saliente y lectura de secretos configurados para fallar. Comprueban 423, body, marker, cache-control, preflight y ausencia de lectura del body. El verificador rechaza 401 y errores genéricos, así como proyectos distintos. El inventario SQL no declara probado el drenaje del runtime.

SHA-256 de los archivos preparados:

- `config.toml`: `0ea86f9bbadca5c5a4bdac24019f6ffe3e2ef8cea8fb6064843e0c477bdbbf9f`.
- `functions/maintenance/index.ts`: `27f85bb5fca474dc6350957fd9d375044e894956a3150609c96d73bb7cb3a995`.

## Comandos exactos después de la aprobación

Ejecutar desde `C:\Users\larul\repos\kanazuko.github.io`, en PowerShell, con el CLI local ya instalado. No usar `--prune`, `--no-verify-jwt`, un deploy sin nombre de función ni el wrapper de funciones completas del protocolo 2. No ejecutar comandos de migración.

### 1. Identificar destino y conservar evidencia antes de reemplazar código

```powershell
$ErrorActionPreference = 'Stop'
$projectRef = 'blsezjyhiholzwmqewef'
$cli = (Resolve-Path '.\node_modules\.bin\supabase.cmd').Path
$bridge = (Resolve-Path '.\scripts\instagram-maintenance').Path
if ((Get-Content '.\supabase\.temp\project-ref' -Raw).Trim() -ne $projectRef) { throw 'Proyecto vinculado distinto; detener' }
$names = @('instagram-publish', 'instagram-prepare', 'instagram-status')
$backupDir = Join-Path ([System.IO.Path]::GetTempPath()) ('prartjewelry-instagram-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
New-Item -ItemType Directory -Path (Join-Path $backupDir 'supabase') | Out-Null
Copy-Item -LiteralPath '.\supabase\config.toml' -Destination (Join-Path $backupDir 'supabase\config.toml')
$inventory = & $cli functions list --project-ref $projectRef --output json
if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener el inventario; detener' }
$inventory | Set-Content -LiteralPath (Join-Path $backupDir 'functions-before.json') -Encoding utf8
foreach ($name in $names) {
  & $cli functions download $name --project-ref $projectRef --workdir $backupDir --use-api
  if ($LASTEXITCODE -ne 0) { throw "No se pudo conservar $name; detener antes de instalar el puente" }
}
Write-Output "Evidencia local privada: $backupDir"
```

Revisar y registrar IDs/versiones antiguas de las tres funciones. La copia es para evidencia y comparación; **no es una instrucción para restaurar automáticamente el publicador antiguo**. No publicar las copias en Git ni imprimir código que pudiera contener información sensible.

Con la credencial de gestión existente disponible solo en memoria del proceso como `SUPABASE_ACCESS_TOKEN`, obtener el inventario de intentos previo al corte:

```powershell
node .\scripts\check-instagram-drain.mjs
if ($LASTEXITCODE -ne 0) { throw 'No se pudo identificar el estado previo; detener' }
```

Este script usa exclusivamente `/database/query/read-only`, con `BEGIN READ ONLY` y `ROLLBACK`. Evita `supabase db query --linked`, cuya inicialización auxiliar de un rol temporal se detectó en la revisión anterior. No selecciona captions, fotografías, tokens ni datos de clientes; sí IDs y checkpoints necesarios para identificar los intentos. Una respuesta con `edge_drain_verified:false` es normal: el SQL no conoce el estado de los workers.

### 2. Instalar solamente el puente

```powershell
$cutoverStartedAt = [DateTime]::UtcNow
foreach ($name in $names) {
  & $cli functions deploy $name --project-ref $projectRef --workdir $bridge --use-api
  if ($LASTEXITCODE -ne 0) { throw "Puente incompleto en $name; conservar lo instalado y aplicar recuperación" }
}
$cutoverDeployedAt = [DateTime]::UtcNow
& $cli functions list --project-ref $projectRef --output json
if ($LASTEXITCODE -ne 0) { throw 'Versiones posteriores no verificadas; detener' }
```

Registrar las tres versiones nuevas y `verify_jwt=true`. Si la CLI pide confirmación, revisar el destino y las funciones; no añadir flags que eviten la verificación JWT. Estos comandos no deben tocar `order-confirmation` ni otras funciones.

### 3. Verificar las tres rutas

Usar `VITE_SUPABASE_PUBLISHABLE_KEY` existente y una sesión Supabase válida del administrador en `SUPABASE_ADMIN_ACCESS_TOKEN`, suministradas temporalmente al proceso. No confundir el JWT de sesión con el token de Meta, la service role ni el token de gestión. No escribir valores en argumentos, archivos o logs.

```powershell
node .\scripts\check-instagram-maintenance.mjs
if ($LASTEXITCODE -ne 0) { throw 'Puente no verificado en las tres rutas; detener' }
```

El verificador hace una sola solicitud por ruta: POST vacío con `action=maintenance-probe`, sin ID/revisión/intento y sin `start`, `continue` u otra acción de publicación. No sigue redirecciones ni reintenta. Exige **423 + código exacto + marker + no-store** en las tres. Si una ruta no fue reemplazada, un error 400/401/503 no se acepta como mantenimiento; el probe tampoco proporciona datos que permitan publicar con el handler anterior. La función antigua de status podría consultar Meta si sigue activa: por eso se comprueban primero el despliegue y sus versiones, y el probe no se usa para descubrir rutas antiguas antes del corte.

La salida distingue `bridge_verified:true` de `drain_verified:false`. Sin una sesión válida para esta comprobación no declarar verificado el recorrido POST; mantener el puente y documentar el bloqueo.

### 4. Drenaje e identificación antes de cerrar la etapa

1. En las herramientas de invocaciones y logs de Supabase, filtrar **las versiones antiguas** de las tres funciones. Correlacionar solicitudes iniciadas antes/durante el corte con su finalización, timeout o terminación del worker. Revisar también tareas en segundo plano si existen. Una respuesta 504 no prueba por sí sola que el worker terminó.
2. Verificar propagación del puente y que no aparezcan nuevas ejecuciones de versiones antiguas. No sustituir esto por una única respuesta 423 ni por la ausencia de errores.
3. Esperar el límite efectivo de ejecución del proyecto desde la última invocación antigua identificada y volver a revisar los logs. La documentación pública indica límites estándar de 150/400 segundos según plan; confirmar el límite aplicable, incluidas excepciones. El transcurso de ese tiempo no cancela procesamiento ya aceptado por Meta.
4. Obtener otro inventario, sin modificar los registros:

   ```powershell
   node .\scripts\check-instagram-drain.mjs
   if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el inventario posterior; mantener mantenimiento' }
   ```

5. Comparar con el inventario previo y asociar por ID/intento los estados `publishing`, `publish_unknown`, `publish_failed`, fases `working`/`sending`, contenedores hijos/principal y publicaciones sin enlace. Un intento sin evidencia concluyente se conserva como **resultado pendiente identificado**, no como fallido ni como permiso de reintento. No consultar/reintentar Meta para resolverlo durante esta etapa.

Para cerrar la etapa se requieren: las tres rutas verificadas, versiones antiguas sin ejecución activa comprobada y cada intento restante completado o identificado con su incertidumbre explícita. Si logs/inventario no permiten justificarlo, el puente queda instalado pero el drenaje sigue **no verificado**. No pasar a migraciones o funciones completas por mera espera.

## Recuperación del puente

Si una instalación fue parcial, no revertir las rutas que ya están bloqueadas. Corregir el error de empaquetado/acceso y volver a instalar **el mismo puente**, con los mismos nombres y proyecto:

```powershell
foreach ($name in @('instagram-publish','instagram-prepare','instagram-status')) {
  & $cli functions deploy $name --project-ref blsezjyhiholzwmqewef --workdir $bridge --use-api
  if ($LASTEXITCODE -ne 0) { throw "Mantenimiento sigue incompleto en $name; detener" }
}
node .\scripts\check-instagram-maintenance.mjs
if ($LASTEXITCODE -ne 0) { throw 'Puente no verificado; no continuar' }
node .\scripts\check-instagram-drain.mjs
if ($LASTEXITCODE -ne 0) { throw 'Inventario no verificado; no continuar' }
```

Repetir el análisis de versiones antiguas y registrar el nuevo momento de corte. Si falta autenticación para verificar, mantener lo instalado y obtener una sesión válida mediante el flujo normal; no cambiar secretos ni desactivar JWT. No usar `functions delete`, borrar filas, restaurar automáticamente el código anterior, ejecutar el wrapper de protocolo 2 ni levantar mantenimiento como solución a un fallo de esta etapa.

Referencias oficiales: [CLI de funciones](https://supabase.com/docs/reference/cli/introduction), [límites del runtime](https://supabase.com/docs/guides/functions/limits), [API SQL de solo lectura](https://supabase.com/docs/reference/api/v1-read-only-query). La ejecución del procedimiento remoto y la comprobación del runtime siguen pendientes de aprobación.
