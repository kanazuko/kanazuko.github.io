# Etapa 4 — frontend bajo mantenimiento, preparada sin publicar

Preparación local del **11 de noviembre de 2026**. Proyecto **blsezjyhiholzwmqewef**, repositorio **kanazuko/kanazuko.github.io**, sitio **https://kanazuko.github.io/**. **No se hicieron commits, pushes, dispatches ni cambios remotos.** La autorización solicitada al final comprende publicar únicamente el frontend revisado, manteniendo **maintenance=true, frontend_ready=false y drain_verified=false**. No se habilitan operaciones Instagram.

## Verificaciones reales

Cloud, solo lectura a las **22:37:35 UTC (16:37, Ciudad de México)**: esquema 2, flags true/false y epoch **3cd91507-439a-4a97-85bc-1dac9d218856**. Readiness contiene exactamente publish, prepare y status del mismo epoch. Versiones **6/5/3**, ACTIVE y verify_jwt=true. Cuerpos/configuración de backend siguen coincidiendo con el manifiesto aprobado de etapa 3. Las 18 publicaciones mantienen la huella **44eec1f11b52979b908bbe88478b50cd**; el intento histórico conserva publishing/waiting y todos sus campos. Diez migraciones, cero eventos y cero filas de seguridad.

GitHub, mediante GET autenticados con la credencial existente solo en memoria: Pages usa **build_type=workflow**, HTTPS obligatorio, entorno github-pages habilitado para main y gh-pages, sin regla de revisores obligatorios. Existe un solo workflow. No había ejecuciones in_progress o queued. Main local/remoto y última ejecución exitosa corresponden a **89bdb1f53dc430483038b9b6111bbc4a2b0fefcb**, run **42345997184**. **El workflow remoto todavía permite publicación por push**; la protección descrita abajo solo existe localmente hasta que se autorice subirla.

Las variables existentes VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY están presentes y apuntan al proyecto correcto; no se imprimieron valores. VITE_WHATSAPP_NUMBER no está configurada: es opcional y el comportamiento actual muestra contacto no disponible. No se propone añadirla ni cambiar secretos. El nuevo preflight de publicación en mantenimiento pasó contra el RPC público con las variables existentes. Una muestra de dos productos publicados respondió 200 y tres fotografías públicas respondieron HEAD 200; esto no es una auditoría de todas las fotografías.

## Revisión del árbol Git y credenciales

Se revisaron los diffs y los archivos nuevos de: workflow; frontend Instagram; fuentes de backend ya desplegadas; ambas migraciones ya aplicadas; herramientas, pruebas y documentación de las etapas anteriores. Las modificaciones de catálogo, carrito, rutas públicas y CSS general son **ninguna**. Los cambios de frontend de esta etapa se concentran en instagramService, AdminInstagramPage e InstagramComposer.

El inventario final de archivos pendientes y sus hashes está en **instagram-stage4-manifest.json**, y la lista explícita para un futuro git add está en **instagram-stage4-files.txt**. No usar git add . ni git add -f. Los archivos ya desplegados/aplicados se incorporan únicamente como código e historial del repositorio: el workflow no ejecuta migraciones ni despliega Edge Functions.

Se encontraron dos archivos de metadatos del CLI bajo scripts/instagram-maintenance/supabase/.temp que antes eran candidatos no rastreados. **Ahora quedan ignorados**, sin borrarlos ni modificar su contenido. .gitignore también excluye archivos de entorno privados, claves, dumps, archivos de navegador y archivos comprimidos de respaldo. Los respaldos reales, screenshots, respuestas sanitizadas y perfiles de prueba permanecen fuera del repositorio, en Temp.

El nuevo **check-release-files.mjs** revisa todo el árbol candidato, el contenido real del índice con --staged y el build con --dist. Devuelve solo archivo/línea/tipo de hallazgo; no muestra valores. Los tres modos pasaron sin patrones de credenciales privadas. Las únicas credenciales de los tests son datos ficticios/generados. El build podrá contener la clave pública Supabase, necesaria para el navegador; nunca tokens administrativos, de gestión, service role o Meta. El escaneo por patrones y la revisión manual no son una prueba matemática contra cualquier secreto arbitrario.

## Comportamiento del frontend preparado

- El panel lee instagram_runtime_status al abrirse y permanece bloqueado mientras carga, ante un error, mantenimiento o falta de activación.
- Muestra mantenimiento explícito, conserva el historial visible y deshabilita el editor y sus botones: conexión, preparación, publicación, continuación, conciliación, cancelación y borrado.
- La capa de servicio vuelve a comprobar el estado antes de cualquier operación de las Edge Functions o reactivación de consultas. Una pestaña que conservara estado visual antiguo tampoco puede saltarse esta comprobación. Los guards del backend siguen siendo la protección definitiva.
- No se continúa automáticamente ningún intento, no se contacta Meta al entrar al panel y no se cambia el estado de publicaciones. El guardado directo de borradores no se elimina del servicio; el editor se mantiene suspendido durante esta ventana.
- El catálogo público no consulta el runtime de Instagram y mantiene su carga, productos, fotografías, buscador/filtros, carrito y navegación.

## Workflow preparado: publicar conservando frontend_ready=false

El preflight anterior frontend exigía frontend_ready=true. **Esta etapa no utiliza ese modo ni invoca set_instagram_maintenance.** Se añadió frontend-maintenance: exige proyecto exacto, schema_version=2, maintenance=true, frontend_ready=false y epoch exacto.

Los pushes a main ejecutarán auditoría, lint, pruebas y build, pero **no configurarán Pages, subirán su artefacto ni desplegarán**. Solo workflow_dispatch con release_instagram=true puede publicar; además exige expected_sha y deployment_epoch. Ambos jobs fijan checkout a github.sha y validan SHA/main/epoch; el preflight de estado se repite antes del build y antes de activar el artefacto. Los checks por push y las publicaciones manuales tienen grupos de concurrencia separados y no se cancelan automáticamente entre sí.

El artefacto manual incluye **release.json** con SHA, epoch y maintenance_expected=true, sin credenciales. Permite comprobar qué versión se sirve realmente después del despliegue. Los permisos del workflow se conservan; no se añadieron secretos ni cambios de configuración del repositorio o entorno.

CI usa únicamente variables públicas y verifica contrato/flags/epoch. **No dispone de credenciales administrativas para inspeccionar readiness ni versiones nativas.** El agente lo hará inmediatamente antes del dispatch con el runner local revisado y las credenciales existentes en memoria; se congelarán cambios del backend durante la publicación. No se afirma que el preflight público por sí solo certifique las tres funciones.

## Pruebas completadas

- npm run lint, suite completa node --test, npm run build y git diff --check.
- Auditoría del árbol candidato, índice actual y 30 archivos del build: sin hallazgos.
- Pruebas del runner: deniega SHA/árbol sucio, bloquea cambios remotos, no despacha por defecto, exige todos los guards antes del único POST y no reintenta resultados desconocidos. Todos los dispatches de tests son simulados.
- YAML analizado localmente y comprobación de gates manuales/SHA; no se ejecutaron Actions.
- Navegador Instagram: mantenimiento y fallo de runtime bloquean UI y llamadas directas del servicio; waiting simulado permanece intacto; resto de edición/preparación/revisión probado con Meta simulado.
- Navegador catálogo: inicio, búsqueda, filtros, orden, detalle, fotografías/visor, regreso, categoría y recarga de ruta, sin overflow móvil. No realiza RPCs de Instagram ni escrituras.
- Navegador carrito/pedidos: persistencia, checkout/reintento, recibo y detalle administrativo con toda la red externa simulada. No se enviaron pedidos ni correos reales.
- Build de producción local construido con las variables públicas reales existentes, retirando credenciales privadas y variables VITE no seleccionadas del proceso hijo. El navegador también verificó ese build compilado, con toda la red externa interceptada: catálogo, fotos, navegación y panel en mantenimiento sin invocar Edge Functions.
- Capturas de mantenimiento y catálogo revisadas visualmente. Directorios privados: prart-instagram-stage4-KzdaSt, prart-public-stage4-Jf17O7 y prart-cart-CFi7nX en Temp. Los productos y usuarios mostrados son fixtures.

La comprobación del build compilado dejó capturas en prart-public-stage4-m8eHGF. `scripts/build-pages-local.mjs` reproduce ese build mediante GET de las variables públicas existentes; no instala/configura secretos y no ejecuta Actions.

## Respaldo disponible y recuperación

La última ejecución exitosa de Pages **no conserva artefactos descargables**. Se descargaron por GET los **30 archivos públicos actuales**, 662884 bytes, con SHA-256 y sin ejecutar JavaScript, a **C:\Users\larul\AppData\Local\Temp\prart-pages-before-stage4-2zBpVE**. Incluye index, assets alcanzables y favicon; no exporta base de datos, sesiones o fotografías completas de Storage. Su manifest.json registra los hashes y sirve como evidencia/comparación y material de recuperación revisada. No se añadió al repositorio.

Si fallan build, auditoría o preflight, detenerse antes del paso deploy; comprobar el sitio servido, conservar mantenimiento y no cambiar flags para sortear el fallo. Si falla/expira el dispatch o deploy, no asumir que nada ocurrió: consultar los runs por SHA/evento/fecha y release.json antes de cualquier repetición. Un dispatch aceptado no significa despliegue verificado.

Si el nuevo frontend presenta una regresión, mantener maintenance=true y frontend_ready=false. Preparar una corrección o un commit de recuperación limitado al frontend afectado, conservando los guards del panel y el workflow manual; repetir pruebas y solicitar aprobación del nuevo SHA antes de publicar. El respaldo permite comparar/restaurar contenido público revisado, pero **no se reejecutará el workflow antiguo ni se revertirá todo el commit**, porque eso podría restaurar el despliegue automático por push. No se restauran Edge Functions antiguas, no se ejecutan migraciones y no se modifica el intento histórico. Toda recuperación remota requiere autorización específica.

## Comandos propuestos, solo después de autorizar

La autorización deberá incluir explícitamente **un commit del conjunto revisado, su push no forzado y la publicación manual posterior**. Nada de eso se ejecutó en esta preparación.

### 1. Verificar el conjunto antes del commit

```powershell
$ErrorActionPreference = 'Stop'
$epoch = '3cd91507-439a-4a97-85bc-1dac9d218856'
$baseline = '89bdb1f53dc430483038b9b6111bbc4a2b0fefcb'
if ((git branch --show-current).Trim() -ne 'main') { throw 'Rama distinta' }
if ((git rev-parse HEAD).Trim() -ne $baseline) { throw 'HEAD cambio; revisar antes de seguir' }
$review = Get-Content '.\docs\instagram-stage4-manifest.json' -Raw | ConvertFrom-Json
foreach ($file in $review.files.PSObject.Properties) {
  if ((Get-FileHash -LiteralPath $file.Name).Hash.ToLowerInvariant() -ne $file.Value) { throw "Archivo distinto: $($file.Name)" }
}
node .\scripts\check-release-files.mjs
if ($LASTEXITCODE -ne 0) { throw 'Auditoria fallida' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint fallido' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Pruebas fallidas' }
node .\scripts\build-pages-local.mjs
if ($LASTEXITCODE -ne 0) { throw 'Build fallido' }
node .\scripts\check-release-files.mjs --dist
if ($LASTEXITCODE -ne 0) { throw 'Artefacto no publicable' }
```

El comando de build requiere GITHUB_PAGES_ACCESS_TOKEN temporal del proceso, suministrado desde la credencial GitHub existente por el agente, sin valores en argumentos/archivos. Repetir también el snapshot de etapa 3 por solo lectura y los metadatos 6/5/3 con el adaptador de gestión existente en memoria. No ejecutar health de nuevo: actualizaría readiness innecesariamente. Confirmar los mismos tres registros, flags y huella histórica. Comprobar que el remoto aún apunta al baseline y que no hay runs activos; cualquier diferencia requiere revisión.

### 2. Commit/push del conjunto explícito con las guardas incluidas

```powershell
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Indice previo no vacio; revisar sin sobrescribir' }
git add --pathspec-from-file=docs/instagram-stage4-files.txt
if ($LASTEXITCODE -ne 0) { throw 'Staging fallido' }
$expected = @(Get-Content '.\docs\instagram-stage4-files.txt' | Sort-Object)
$actual = @(git diff --cached --name-only | Sort-Object)
if (Compare-Object $expected $actual) { throw 'Conjunto staged distinto; no hacer commit' }
node .\scripts\check-release-files.mjs --staged
if ($LASTEXITCODE -ne 0) { throw 'Indice no publicable' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Diff no valido' }
git commit -m "Keep Instagram paused during controlled frontend release"
if ($LASTEXITCODE -ne 0) { throw 'Commit fallido' }
$releaseSha = (git rev-parse HEAD).Trim()
git push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Push no confirmado; no forzar ni repetir a ciegas' }
```

Este push incorpora primero el workflow protegido. GitHub evalúa el workflow del commit asociado al evento: su run por push solo comprobará el proyecto. Verificar ese run y que el job deploy esté skipped, no ejecutar el workflow viejo ni confiar en un marcador skip-ci. No subir dist ni los respaldos. Esperar a que todos los runs por push hayan terminado antes del dispatch.

### 3. Preflight local y único dispatch autorizado

El agente suministrará **GITHUB_PAGES_ACCESS_TOKEN y SUPABASE_ACCESS_TOKEN solo en memoria del proceso**, desde las credenciales existentes, sin valores en argumentos/chat/archivos y sin crear secretos de Actions. El runner no solicita JWT de administrador y nunca lo envía a GitHub. Los tokens se eliminan del entorno temporal al terminar el proceso.

```powershell
node .\scripts\publish-pages-release.mjs --sha=$releaseSha --epoch=$epoch
if ($LASTEXITCODE -ne 0) { throw 'Preflight de publicacion fallido; no dispatch' }
$dispatchSince = [DateTime]::UtcNow.ToString('o')
node .\scripts\publish-pages-release.mjs --sha=$releaseSha --epoch=$epoch --dispatch
if ($LASTEXITCODE -ne 0) { throw 'Dispatch no confirmado; inspeccionar runs sin reintentar' }
```

El runner exige árbol limpio, HEAD/SHA remoto exactos, contenido del workflow igual al commit, cero runs activos/queued, snapshot/readiness/huella intactos, tres versiones nativas exactas con JWT y preflight público en mantenimiento. Sin --dispatch no ejecuta Actions. Con --dispatch hace un único POST a `/repos/kanazuko/kanazuko.github.io/actions/workflows/deploy-pages.yml/dispatches`, ref main, release_instagram=true, expected_sha y deployment_epoch exactos. No modifica Pages, flags o permisos por API.

Si falta capacidad para push de workflow o dispatch, detenerse y comunicar el error; no ampliar permisos ni cambiar credenciales automáticamente.

### 4. Verificación posterior y cierre, sin activar Instagram

Consultar por GET el workflow run con event=workflow_dispatch, head_sha=$releaseSha y created_at posterior a $dispatchSince; seguir su ID hasta build/deploy success. Si se duplica o no puede identificarse, no volver a despachar automáticamente.

Comprobar `https://kanazuko.github.io/release.json?verify=<SHA>`: SHA y epoch aprobados, maintenance_expected=true. Revisar assets y rutas públicas, producto/fotografías/visor, carrito y navegación móvil; en sesión administrativa recién obtenida por el flujo normal, comprobar el aviso de mantenimiento y controles deshabilitados sin accionar el intento. No introducir JWTs en consola, chat o archivos.

Repetir por solo lectura snapshot, readiness y versiones: flags siguen true/false, drain_verified=false, 18 filas y fingerprint originales, intento intacto, mismas diez migraciones, cero eventos/filas de seguridad. Registrar SHA, run ID, identidad del artefacto y observaciones reales. **Cerrar únicamente etapa 4.** La activación de Instagram y el tratamiento de incertidumbres pendientes quedan fuera de esta autorización.

Referencias oficiales revisadas: [selección del workflow por commit/evento](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows), [publicación personalizada de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [ejecución manual](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
