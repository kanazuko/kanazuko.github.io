# Etapa 3: funciones completas bajo mantenimiento

**Actualización de ejecución:** la [etapa 3 quedó cerrada](instagram-stage3-result.md) con publish v6, prepare v5 y status v3, todas ACTIVE/JWT=true, health 200/probe 423 y exactamente tres filas readiness del mismo epoch. Maintenance=true y frontend_ready=false permanecen intactos. Los comandos siguientes son el plan histórico ya ejecutado: **no volver a desplegar las funciones**. La etapa 4 no se inició ni está autorizada.

**Preparación local del 11 de noviembre de 2026. No se ejecutó ningún despliegue ni health remoto.** Proyecto único: `blsezjyhiholzwmqewef`. Esta propuesta requiere autorización posterior. Su alcance termina con las tres funciones completas verificadas y readiness registrado, conservando **maintenance=true y frontend_ready=false**. No incluye frontend, publicaciones, recuperación del intento ni modificaciones de esquema, permisos o secretos.

## Estado real previo

Cloud, inspección de solo lectura de las **20:29 UTC** (14:29, Ciudad de México), repetida mediante el nuevo verificador a las **20:37 UTC**:

- schema_version=2, maintenance=true, frontend_ready=false.
- deployment_epoch=`3cd91507-439a-4a97-85bc-1dac9d218856`; readiness vacío; ambas migraciones aplicadas y diez versiones en el historial.
- Cuerpos de las diez RPCs nuevos/reemplazados coincidentes con los archivos locales aplicados. Contratos y permisos comprobados en la etapa 2.
- Puente: publish v5, prepare v4 y status v2; ACTIVE y verify_jwt=true, con los mismos IDs y updated_at.
- 18 publicaciones con huella `44eec1f11b52979b908bbe88478b50cd`; cero eventos y cero filas de seguridad. Intento `9723a05a-982c-43f5-9aac-00491fdcc032` intacto en publishing/waiting, revisión 1, con sus contenedores originales y updated_at anterior.
- drain_verified=false. La aceptación de riesgo de la etapa 2 no se transforma en una certificación histórica ni resuelve lo recibido por Meta.

Se volverán a comprobar estos datos inmediatamente antes del cambio. Si cambia el epoch, una versión, un registro histórico o aparece readiness inesperado, detenerse y revisar la nueva situación.

## Revisión de las funciones

| Ruta | Operaciones suspendidas | Excepción prevista |
| --- | --- | --- |
| instagram-publish | review, start, continue, reconcile, cancel | health autenticado y probe de mantenimiento |
| instagram-prepare | check, begin, upload, finish, reset, delete | health autenticado y probe de mantenimiento |
| instagram-status | descubrimiento/comprobación de conexión | health autenticado y probe de mantenimiento |

Todas verifican la sesión con Supabase Auth y membresía administrativa. El control de mantenimiento precede a la lectura de publicaciones, auditoría de acciones, Storage y llamadas a Meta. OPTIONS sigue devolviendo preflight vacío y otros métodos son rechazados; la autenticación puede devolver 401/403 antes del 423. El catálogo público y el RPC independiente de guardado de borradores no forman parte de este despliegue.

La biblioteca compartida comprueba schema_version=2 y falla cerrada si no puede leer el contrato. Cada petición a Meta vuelve a comprobar mantenimiento y utiliza begin_instagram_request; el SQL comparte el bloqueo de control con los cambios de mantenimiento, reserva por cuenta y conserva los latches inciertos. Los nombres, argumentos y privilegios de las RPCs coinciden con las dos migraciones aplicadas.

Se añadió localmente una rama explícita `action=maintenance-probe` a las tres funciones completas: devuelve 423/INSTAGRAM_MAINTENANCE bajo mantenimiento y 409/INSTAGRAM_MAINTENANCE_REQUIRED si se desactiva; nunca continúa hacia Meta. Esto evita que el probe de status se convierta en una consulta real si el flag cambia. No se ha desplegado esta modificación.

**Health no es de solo lectura:** comprueba Auth/admin y contrato y llama a register_instagram_backend, que inserta/actualiza únicamente readiness de la función constante para el epoch actual. No ejecuta el motor, no lee/modifica el intento, no escribe eventos y no consulta Meta. backend_version=2 identifica el protocolo; es distinto de la versión de despliegue de Supabase.

El motor no tiene tareas autónomas, timers o recuperación al cargar el módulo. En esta etapa, el mantenimiento bloquea incluso continue/reconcile/cancel sobre waiting. Se comprobará nuevamente la huella completa de publicaciones después de cada health. **Esta garantía depende de conservar mantenimiento:** waiting no es por sí mismo una cuarentena de toda la cuenta para una futura reactivación. Ese bloqueo independiente debe revisarse antes de habilitar POST en otra etapa.

## Herramientas preparadas y pruebas

- `docs/instagram-stage3-manifest.json`: hashes SHA-256 del config, fuentes completas, dependencia fijada/lockfile y verificadores. No es el hash del bundle remoto; el empaquetado real se comprobará durante el despliegue. Congelar estos archivos durante toda la ventana.
- `scripts/check-instagram-stage3.mjs` y `.sql`: snapshot por la API dedicada de solo lectura, sin invocar RPCs privilegiadas desde ese rol. Comprueba epoch, flags, readiness exacto, historial y huella de las 18 publicaciones. Es deliberadamente específico de este corte; un cambio legítimo también detiene el procedimiento para revisión.
- `scripts/verify-instagram-stage3-local.ps1` y `verify-instagram-stage3-input.mjs`: ventana privada para **una función seleccionada**. Recibe clave pública y access_token vigente por stdin; no los guarda en archivos, argumentos, entorno persistente o logs. No recupera tokens anteriores. Las credenciales solo se envían al proyecto fijado: clave pública para dos GET del estado; ambos datos para POST health y maintenance-probe de la función seleccionada. Sin IDs de borrador, reintentos ni redirecciones. Cada ejecución termina limpiando campos/buffers/referencias; no se promete borrado forense de todas las copias .NET/V8.
- El verificador exige health 200, nombre exacto, backend_version=2, flags y epoch correctos, probe 423 con código exacto y no-store, y relectura final de estado. No exige el marker del puente: las funciones completas tienen otro handler.

Pruebas completadas en esta preparación: lint, suite Node completa con Meta simulado, build local, comprobación Deno de los tres entrypoints con lockfile congelado y prueba real de decodificación/re-encode JPEG. Deno temporal utilizado: 2.9.6; jpeg-js fijado en 0.4.4. Tests ampliados: todas las acciones en mantenimiento, waiting intacto, cero llamadas a Meta/Storage, health limitado a readiness, probe seguro con mantenimiento desactivado, esquema incompatible, concurrencia y validación de ventana/credenciales/epoch. El último cambio de tests/herramientas se verificó también con sus pruebas específicas y lint. No se subió el build a Pages.

## Procedimiento exacto propuesto después de aprobar

PowerShell, desde `C:\Users\larul\repos\kanazuko.github.io`. El agente utilizará la sesión CLI existente para despliegue y su credencial de gestión existente solo en memoria del proceso de verificación SQL. Los comandos Node de snapshot requieren SUPABASE_ACCESS_TOKEN **temporal del proceso**, suministrado por el adaptador privado ya utilizado, nunca pegado en comandos/chat ni guardado en el repositorio. La ventana de health pide una sesión administrativa nueva; no hereda los tokens de gestión/service role/Meta enumerados en su código.

### 1. Congelar y conservar evidencia

```powershell
$ErrorActionPreference = 'Stop'
$projectRef = 'blsezjyhiholzwmqewef'
$epoch = '3cd91507-439a-4a97-85bc-1dac9d218856'
$root = (Get-Location).Path
$cli = (Resolve-Path '.\node_modules\.bin\supabase.cmd').Path
$names = @('instagram-publish','instagram-prepare','instagram-status')
if ((Get-Content '.\supabase\.temp\project-ref' -Raw).Trim() -ne $projectRef) { throw 'Destino distinto' }
$manifest = Get-Content '.\docs\instagram-stage3-manifest.json' -Raw | ConvertFrom-Json
function Test-Stage3Sources {
  foreach ($file in $manifest.files.PSObject.Properties) {
    $actual = (Get-FileHash -LiteralPath (Join-Path $root $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $file.Value) { throw "Fuente modificada: $($file.Name)" }
  }
}
Test-Stage3Sources
node .\scripts\check-instagram-stage3.mjs --epoch=$epoch --ready=none
if ($LASTEXITCODE -ne 0) { throw 'Preflight no satisfactorio' }
$evidence = Join-Path ([IO.Path]::GetTempPath()) ('prartjewelry-stage3-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
New-Item -ItemType Directory -Path $evidence | Out-Null
foreach ($name in $names) {
  $isolated = Join-Path $evidence $name
  New-Item -ItemType Directory -Path (Join-Path $isolated 'supabase') | Out-Null
  Copy-Item -LiteralPath '.\supabase\config.toml' -Destination (Join-Path $isolated 'supabase\config.toml')
  & $cli functions download $name --project-ref $projectRef --workdir $isolated --use-api
  if ($LASTEXITCODE -ne 0) { throw "Respaldo fallido: $name" }
}
```

Conservar inventario/metadatos antes y después, sources descargados, hashes y resultados sanitizados en ese directorio privado. Nunca publicar los backups en Git. Esta copia contiene el puente actual; no utilizar las copias previas de las funciones inseguras.

### 2. Verificar versiones entre cada paso

```powershell
$ids = @{
  'instagram-publish'='4793ddd5-8860-434f-b7f3-0f413720e509'
  'instagram-prepare'='9424063a-13d4-4f77-87c3-9c327c55ae29'
  'instagram-status'='a52026d6-6615-41d3-b6d6-00088752c1cf'
}
$versions = @{ 'instagram-publish'=5; 'instagram-prepare'=4; 'instagram-status'=2 }
function Test-Stage3Versions {
  $raw = & $cli functions list --project-ref $projectRef --output json
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar versiones' }
  # PowerShell 5.1 can wrap the entire parsed array as one pipeline result.
  $parsed = $raw | ConvertFrom-Json
  $rows = @($parsed)
  if ($rows.Count -ne 3) { throw 'Conjunto remoto inesperado' }
  foreach ($name in $names) {
    $selected = @($rows | Where-Object { $_.slug -eq $name })
    if ($selected.Count -ne 1 -or $selected[0].id -ne $ids[$name] -or
        $selected[0].version -ne $versions[$name] -or $selected[0].status -ne 'ACTIVE' -or
        $selected[0].verify_jwt -ne $true) { throw "Version/JWT inesperados: $name" }
  }
  $rows | Select-Object slug,id,version,status,verify_jwt | ConvertTo-Json
}
Test-Stage3Versions
```

Las versiones siguientes son **esperadas**, no resultados ya observados. Si la plataforma devuelve otra versión, detenerse e identificarla; no editar el número esperado solo para pasar la comprobación. No confundir backend_version=2 con estas versiones nativas. No ejecutar el wrapper global con --deploy: esta ventana requiere una parada y health entre funciones.

### 3. Publish: única función que se reemplaza en este paso

Antes del primer reemplazo, repetir la verificación privada del puente aún intacto para comprobar que hay una sesión vigente disponible. Esta ventana no retiene el JWT para los health siguientes: cada una vuelve a pedirlo mediante entrada privada. No volver a ejecutar este verificador global después de reemplazar publish.

```powershell
Test-Stage3Sources
node .\scripts\check-instagram-stage3.mjs --epoch=$epoch --ready=none
if ($LASTEXITCODE -ne 0) { throw 'Detener antes de publish' }
& powershell.exe -NoProfile -File .\scripts\verify-instagram-maintenance-local.ps1 -BridgeInstalled
if ($LASTEXITCODE -ne 0) { throw 'Puente/sesion no verificados; detener antes del primer despliegue' }
Test-Stage3Versions
& $cli functions deploy instagram-publish --project-ref $projectRef --workdir $root --use-api
if ($LASTEXITCODE -ne 0) { throw 'Despliegue publish no confirmado; detener' }
$versions['instagram-publish'] = 6
Test-Stage3Versions
& powershell.exe -NoProfile -File .\scripts\verify-instagram-stage3-local.ps1 -FunctionName instagram-publish -ExpectedEpoch $epoch -FunctionInstalled
if ($LASTEXITCODE -ne 0) { throw 'Health/probe publish no verificados; detener' }
node .\scripts\check-instagram-stage3.mjs --epoch=$epoch --ready=instagram-publish
if ($LASTEXITCODE -ne 0) { throw 'Readiness/inventario publish no verificados; detener' }
Test-Stage3Versions
```

### 4. Prepare: avanzar únicamente si publish pasó

```powershell
Test-Stage3Sources
node .\scripts\check-instagram-stage3.mjs --epoch=$epoch --ready=instagram-publish
if ($LASTEXITCODE -ne 0) { throw 'Detener antes de prepare' }
& $cli functions deploy instagram-prepare --project-ref $projectRef --workdir $root --use-api
if ($LASTEXITCODE -ne 0) { throw 'Despliegue prepare no confirmado; detener' }
$versions['instagram-prepare'] = 5
Test-Stage3Versions
& powershell.exe -NoProfile -File .\scripts\verify-instagram-stage3-local.ps1 -FunctionName instagram-prepare -ExpectedEpoch $epoch -FunctionInstalled
if ($LASTEXITCODE -ne 0) { throw 'Health/probe prepare no verificados; detener' }
node .\scripts\check-instagram-stage3.mjs --epoch=$epoch '--ready=instagram-publish,instagram-prepare'
if ($LASTEXITCODE -ne 0) { throw 'Readiness/inventario prepare no verificados; detener' }
Test-Stage3Versions
```

### 5. Status y cierre de esta etapa

```powershell
Test-Stage3Sources
node .\scripts\check-instagram-stage3.mjs --epoch=$epoch '--ready=instagram-publish,instagram-prepare'
if ($LASTEXITCODE -ne 0) { throw 'Detener antes de status' }
& $cli functions deploy instagram-status --project-ref $projectRef --workdir $root --use-api
if ($LASTEXITCODE -ne 0) { throw 'Despliegue status no confirmado; detener' }
$versions['instagram-status'] = 3
Test-Stage3Versions
& powershell.exe -NoProfile -File .\scripts\verify-instagram-stage3-local.ps1 -FunctionName instagram-status -ExpectedEpoch $epoch -FunctionInstalled
if ($LASTEXITCODE -ne 0) { throw 'Health/probe status no verificados; detener' }
node .\scripts\check-instagram-stage3.mjs --epoch=$epoch '--ready=instagram-publish,instagram-prepare,instagram-status'
if ($LASTEXITCODE -ne 0) { throw 'Readiness/inventario final no verificados; detener' }
Test-Stage3Versions
```

No usar --no-verify-jwt, --prune, deploy sin nombre, config push, db push, set_instagram_maintenance, frontend_ready=true ni health en rutas todavía servidas por el puente. No ejecutar el verificador global antiguo del marker después de reemplazar una ruta: las funciones completas no son el puente.

## Criterios de cierre y recuperación

Cerrar etapa 3 solo con: versiones nuevas registradas y JWT activo; tres health 200 y probes 423; tres filas readiness con schema_version=2, nombre y epoch exactos; flags aún true/false; huella histórica, inventario pendiente, eventos y seguridad sin cambios. No se activará frontend_ready aunque existan tres filas readiness. No habrá prueba real de publicación.

Ante cualquier fallo de autenticación, empaquetado, timeout, versión, health, flags, epoch o inventario: **detener el siguiente despliegue**. Un timeout del CLI no demuestra que el despliegue no ocurrió: consultar metadatos, no repetir automáticamente. Si falla/cancela la ventana, conservar las versiones instaladas; health puede haber registrado una fila antes del fallo. Inspeccionar ese estado por solo lectura, sin borrar readiness ni eventos para ajustar expectativas.

Un despliegue parcial deja una mezcla de puente y funciones completas bajo mantenimiento: no restaurar las versiones antiguas que omitían el protocolo. Puede mantenerse esa mezcla mientras se diagnostica. Si se necesita aislamiento independiente de base de datos, la alternativa segura es volver a instalar **el puente revisado**, con nombres explícitos y proyecto fijo; requiere autorización correctiva concreta y no se ejecuta automáticamente en este procedimiento:

```powershell
# SOLO SI SE AUTORIZA EXPRESAMENTE LA RECUPERACION CON EL PUENTE
$bridge = (Resolve-Path '.\scripts\instagram-maintenance').Path
foreach ($name in @('instagram-publish','instagram-prepare','instagram-status')) {
  & $cli functions deploy $name --project-ref blsezjyhiholzwmqewef --workdir $bridge --use-api
  if ($LASTEXITCODE -ne 0) { throw "Recuperacion parcial en $name; detener" }
}
```

Después de esa recuperación, verificar versiones/JWT y las tres respuestas del puente mediante su ventana privada específica; mantener control en mantenimiento y registrar el corte. Readiness previo no certifica el código restaurado: no se podrá usar para activar frontend. Antes de otro intento, preparar un nuevo corte/epoch y verificaciones con autorización específica, sin borrar historial. No se prometen cancelación de workers antiguos ni revocación de solicitudes recibidas por Meta.

Los registros readiness solo acreditan nombre/protocolo/epoch; no contienen hash ni versión nativa del deployment. Por eso se combinan con manifiesto, metadatos antes/después, health real y congelación de despliegues externos. Una garantía de retirada global de versiones anteriores sigue necesitando evidencia de la plataforma; drain_verified permanece false. La aceptación previa cubría únicamente el esquema: no autoriza por sí misma este reemplazo. La autorización de etapa 3 deberá aceptar expresamente ese riesgo residual para el nuevo alcance bajo mantenimiento, sin habilitar publicaciones. Sin una sesión nueva para health o acceso de gestión para snapshots, no se inicia el primer despliegue.

Referencias oficiales revisadas: [CLI functions deploy](https://supabase.com/docs/reference/cli/supabase-functions-deploy), [configuración de funciones y JWT](https://supabase.com/docs/guides/functions/function-configuration).
