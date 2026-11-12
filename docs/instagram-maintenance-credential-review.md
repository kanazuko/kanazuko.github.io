# Revisión de la entrada local de sesión — 11 de noviembre de 2026

La ventana inicial fue detenida antes de introducir credenciales y antes de desplegar. El respaldo de funciones y el inventario previo ya se completaron con la autenticación de gestión existente. No se ejecutaron migraciones ni se reemplazó ninguna función.

## Qué hacía el script anterior

No cumplía literalmente el alcance «usar la sesión solo para verificar tres endpoints»: utilizaba el JWT también para `GET /auth/v1/user` y para leer la membresía en `admin_users`, ambos dentro de `blsezjyhiholzwmqewef.supabase.co`. Después iniciaba automáticamente los tres despliegues autorizados y ejecutaba los verificadores.

No imprimía ni escribía el JWT en archivos o historial, pero lo colocaba en una variable de entorno del proceso. Eso también permitía que los procesos CLI/Node hijos lo heredasen durante su ejecución. No usaba variables de entorno de usuario/máquina ni setters persistentes. El bloque `finally` quitaba la variable del entorno; eso no garantizaba borrar todas las copias de cadenas del heap. Ese flujo conjunto no se reanudará.

## Verificación aislada revisada

Archivos: `scripts/verify-instagram-maintenance-local.ps1`, `scripts/verify-instagram-maintenance-input.mjs` y el verificador ya existente `scripts/check-instagram-maintenance.mjs`.

- La ventana solo verifica; no contiene comandos de despliegue ni lógica posterior de instalación.
- El JWT se introduce en un campo enmascarado. No se pega en comandos, argumentos de CLI ni en la conversación.
- Los datos se transfieren al worker Node mediante una tubería stdin privada. No se asignan a `process.env`, variables PowerShell persistentes ni archivos. El worker solo recibe un objeto de credenciales en memoria y no hereda los tokens de gestión/service role/Meta listados por la ventana.
- Solo se hacen tres POST vacíos a `https://blsezjyhiholzwmqewef.supabase.co/functions/v1/{instagram-status,instagram-prepare,instagram-publish}?action=maintenance-probe`, sin IDs, revisión ni acciones de publicación. Las redirecciones están deshabilitadas y no hay reintentos.
- No se llama a Auth, `admin_users`, SQL, la API de administración ni Meta. En consecuencia, este verificador no vuelve a acreditar membresía administrativa; comprueba el recorrido de la sesión por la pasarela y la respuesta identificada del puente. La sesión debe proceder del acceso administrativo normal.
- La salida solo contiene proyecto, nombres de funciones, HTTP, identificador del puente y resultado. Los errores se reemplazan por mensajes genéricos; no se devuelven credenciales, headers, cuerpos de error o excepciones al chat/contexto.
- Se vacían los buffers mutables del worker, se limpian los campos/referencias y terminan los procesos dedicados al acabar. No puede garantizarse borrado forense de cada copia de cadenas .NET/V8, memoria paginada, dumps o instrumentación externa del equipo. No se afirma esa garantía.

El comando revisado, **solo después de que el puente esté instalado y se hayan comprobado sus versiones**, es:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-instagram-maintenance-local.ps1 -BridgeInstalled
```

Se usa un proceso dedicado, sin perfil ni entrada interactiva de comandos PowerShell. No ejecutar ahora contra las versiones antiguas: status podría consultar Meta si aún no fue reemplazado. El flag no instala ni acredita por sí mismo el puente; es una condición previa operativa.

## Obtener el access_token sin cambiar producción

1. Abrir el catálogo en el navegador y entrar al panel administrativo mediante el inicio de sesión habitual. Mantener esa sesión abierta.
2. Abrir F12 → Application/Aplicación → Local Storage/Almacenamiento local y seleccionar el origen del catálogo.
3. Buscar `sb-blsezjyhiholzwmqewef-auth-token`. La configuración local del cliente usa persistencia de sesión y no define una clave de almacenamiento personalizada.
4. Expandir el JSON y copiar únicamente el valor `access_token` de la sesión actual. No copiar el objeto completo, `refresh_token`, service role ni token de Meta. No imprimirlo en la consola ni introducirlo en una URL.
5. Pegar el valor directamente en el campo oculto de la ventana revisada cuando se abra. No enviarlo por chat ni guardarlo en el repositorio. Después, retirar esa entrada del portapapeles y de su historial/sincronización, si se usan.
6. Si no aparece la sesión o está expirada, iniciar sesión normalmente y obtener el valor vigente; no fabricar tokens ni modificar el código desplegado.

La clave pública es el valor existente de `VITE_SUPABASE_PUBLISHABLE_KEY`; no se genera ni modifica ninguna clave. No sustituirla por una clave secreta.

Estado: despliegue pausado a petición del usuario para esta revisión. Ningún dato introducido en una futura ventana se necesita para autorizar despliegues: despliegue y verificación quedan separados.


Actualizaci?n del diagn?stico local: consultar [instagram-maintenance-diagnostic.md](instagram-maintenance-diagnostic.md). Las tres versiones del puente ya est?n instaladas; la repetici?n mediante ventana privada confirm? HTTP 423, c?digo e identificador en las tres rutas. El drenaje contin?a sin verificar. El estado hist?rico de preparaci?n descrito arriba no acredita la situaci?n actual.
