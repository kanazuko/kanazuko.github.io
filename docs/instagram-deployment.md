# Actualización coordinada de Instagram — protocolo 2

**Actualización del 11 de noviembre:** la [etapa 2 quedó cerrada](instagram-stage2-result.md) y la [etapa 3 también quedó cerrada](instagram-stage3-result.md), con las tres funciones completas verificadas bajo mantenimiento. Se conservan maintenance=true, frontend_ready=false y drain_verified=false. La etapa 4 no se inició ni está autorizada. El [plan de etapa 3](instagram-stage3-plan.md) conserva los comandos históricos, que no deben repetirse. Las secciones siguientes no sustituyen esos informes actuales.

La [preparación de etapa 4](instagram-stage4-plan.md) añade un modo de publicación del frontend que conserva frontend_ready=false. No utilizar el procedimiento histórico que habilitaba readiness de frontend antes de publicar Pages para esta ventana; no se autoriza ninguna activación de Instagram.

Para la primera etapa en `blsezjyhiholzwmqewef`, ver el [procedimiento concreto del puente de mantenimiento](instagram-maintenance-stage1.md), preparado el 11 de noviembre de 2026. El preflight estructural de Cloud ya terminó satisfactoriamente; la sección histórica que aparece abajo como pendiente corresponde al estado anterior a esa comprobación. El puente aún requiere aprobación y verificación de despliegue/drenaje.

Estado local, 7 de noviembre de 2026. No se ejecutaron publicaciones, creación de contenedores, migraciones remotas, despliegues, cambios de secretos, commits ni pushes. El catálogo público no consulta las tablas de control de Instagram y sigue funcionando durante el mantenimiento.

## Garantías y límites

La migración **nueva** `20261107020000_instagram_exclusive_requests.sql` depende de `20261107010000_instagram_safety_and_audit.sql`, que se conserva sin cambios. No modifica `instagram_posts`, no elimina eventos ni cambia IDs históricos. Las columnas añadidas a seguridad/auditoría son independientes de los campos existentes.

Una transacción corta bloquea la fila de cuenta y persiste `active_request_id` antes de contactar a Meta. No se mantiene una transacción abierta durante HTTP. Mientras haya una solicitud activa, otra función, borrador o pestaña recibe `INSTAGRAM_ACCOUNT_BUSY`. La exclusión es por solicitud HTTP a Meta; no reserva toda la cuenta durante los minutos de interacción manual de una publicación.

Cada POST también persiste `pending_write_id` antes de enviarse. Una respuesta exitosa deja `awaiting_commit`; el backend solo retira ese bloqueo cuando el ID remoto exacto aparece guardado en el mismo borrador, revisión e intento. Si falla el guardado del post o el acuse SQL, el bloqueo permanece. Un acuse perdido puede repetirse sin contactar a Meta, comprobando nuevamente esa evidencia. Los errores, timeouts y respuestas inciertas nunca autorizan otro POST.

Si Meta devuelve 429 y falla la finalización SQL, la reserva activa permanece y bloquea las operaciones siguientes. Si la finalización termina, la pausa y los datos de respuesta se guardan en la misma transacción. Se respeta el mayor valor entre 60 segundos y `Retry-After`. Ningún fallo de finalización se trata como permiso para continuar sin auditoría.

Una solicitud iniciada antes de entrar en mantenimiento puede terminar. Por eso el procedimiento exige detener nuevas invocaciones y verificar el drenaje de las ya activas antes de aplicar cambios. Ningún control puede retirar un HTTP que ya fue aceptado por Meta.

### Recuperación de reservas

| Estado | Recuperación permitida |
| --- | --- |
| GET activo de menos de 10 minutos | Esperar; no tomar la reserva. |
| GET sin finalizar de más de 10 minutos | Administrador ejecuta `recover_instagram_read(request_id)`. Conserva el evento original, registra la recuperación y habilita diagnóstico GET. Mantiene `audit_hold`, que impide escrituras porque pudo perderse una restricción o un Retry-After. |
| Restricción perdida en un GET | Revisar externamente el resultado/proveedor. En mantenimiento, un administrador puede ejecutar `resolve_instagram_read_hold(account_id, paused_until)`, con una fecha al menos 60 segundos futura y que respete cualquier pausa comprobada. No elimina bloqueos de escritura ni restricciones conocidas. |
| POST activo abandonado | Después de 10 minutos, un GET puede clasificarlo como `unknown_write` y consultar información. Ningún POST nuevo queda habilitado por esa antigüedad. |
| POST exitoso con ID ya guardado en el intento | `ack_instagram_write` comprueba el ID y puede liberar el bloqueo de esa escritura. Lo invoca el motor; solo service role puede ejecutarlo. |
| POST de resultado desconocido o ID perdido | Mantener bloqueadas nuevas escrituras de la cuenta. Conciliar con evidencia externa. No hay un botón ni RPC genérico que lo desbloquee por tiempo, por `FINISHED` ni por una suposición. |

No puede reconstruirse un Retry-After que nunca se persistió ni demostrarse el resultado de una escritura cuya respuesta se perdió sin evidencia adicional. El sistema conserva el bloqueo en esos casos. Una lectura abandonada requiere revisión administrativa antes de volver a escribir; un POST desconocido requiere una conciliación específica y auditada fuera de esta recuperación automática. `resume_instagram_account` solo retira restricciones de acceso tras corregirlas: no borra reservas, `audit_hold`, pausas temporales ni escrituras pendientes.

Los eventos antiguos sin finalizar también se detectan al reservar. Los posts históricos `publish_unknown` de otros borradores impiden nuevos POST; no se migran a un estado publicable. No se fabrican resultados ni autores para registros anteriores.

## Comprobación del proyecto remoto: pendiente

No se confirmó el esquema remoto. El último intento del CLI en esta sesión devolvió `ProjectRefNotLinkedError`; no se proporcionó una referencia nueva ni se ejecutaron consultas remotas durante esta implementación. Las pruebas PGlite no sustituyen esa revisión.

Antes de aplicar nada:

1. Identificar explícitamente el proyecto y cotejar su referencia con el host Supabase usado por el frontend y las funciones.
2. Ejecutar **solo lectura** `scripts/check-instagram-schema.sql` en ese proyecto. El script abre `BEGIN READ ONLY` y termina en `ROLLBACK`; inspecciona tablas, columnas, RLS, políticas, firmas de funciones, owners, search_path, privilegios, índices e historial de migraciones sin leer publicaciones ni secretos.
3. Comparar el resultado con las migraciones. Confirmar `admin_users`, `app_private.is_admin()`, Auth y la estructura real de `instagram_posts`, incluyendo progreso e identificadores de intento.
4. Si `10000` no está aplicada y sus objetos no existen, programar primero esa migración y luego `20000`. Si `10000` ya está aplicada, no repetirla ni editarla: aplicar únicamente el ajuste posterior pendiente.
5. Si hay objetos parciales, funciones sobrecargadas o historial divergente, detenerse y reconciliar las definiciones antes de ejecutar DDL. No usar DROP ni IF NOT EXISTS para ocultar diferencias. No marcar migraciones como aplicadas sin verificar sus efectos.

## Mantenimiento inicial para funciones antiguas

El flag nuevo no puede detener una versión antigua que llama directamente a Meta sin consultar la base de control. Se preparó un **puente sin dependencias de esquema** en `scripts/instagram-maintenance/supabase/`: las tres rutas devuelven HTTP 423; no leen secretos y no llaman a Auth, Storage, PostgreSQL ni Meta. Se conserva la verificación JWT de la plataforma.

En la futura ventana autorizada, usar la CLI Supabase instalada y autenticada, con la referencia exacta del proyecto. Para cada nombre (`instagram-status`, `instagram-prepare`, `instagram-publish`), el comando de puente es:

```text
supabase functions deploy NOMBRE --workdir scripts/instagram-maintenance --project-ref REFERENCIA --use-api
```

Verificar que las tres rutas devuelvan `INSTAGRAM_MAINTENANCE` y, mediante las herramientas de ejecución de la plataforma, que no queden invocaciones antiguas en curso. El despliegue de las tres rutas no es atómico: una ventana de mantenimiento y el drenaje son indispensables. Si no puede comprobarse ese cierre, no continuar la actualización ni afirmar que el backend antiguo está detenido.

El puente es una excepción deliberada al preflight de protocolo: no depende de tablas/RPCs nuevos. No desplegar las funciones completas antes de las migraciones.

## Orden de actualización

1. Revisar los resultados de solo lectura y disponer de respaldo del esquema/historial. Instalar y comprobar el puente; drenar invocaciones antiguas. No pulsar continuar sobre registros pendientes.
2. Aplicar las migraciones pendientes mediante el mecanismo de migraciones, de forma transaccional y con su historial correcto. Si se usa un editor SQL, ejecutar el archivo completo en una transacción y coordinar después el registro de la versión; no ejecutar fragmentos sueltos. El protocolo 2 se instala con `maintenance=true` y `frontend_ready=false`.
3. Repetir la comprobación de esquema y permisos. Las RPCs de reserva, finalización, acuse y registro de backend deben quedar solo para service role. Las RPCs administrativas comprueban `admin_users` con `auth.uid()`. El estado público de release solo expone versión, mantenimiento y readiness, sin datos de cuenta ni secretos.
4. Configurar en el proceso local la URL y clave pública existentes: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. No cambiar secretos del proyecto. Ejecutar el preflight, que es de solo lectura:

   ```text
   node scripts/deploy-instagram-functions.mjs --project-ref=REFERENCIA
   ```

   Este comando no despliega por defecto. Rechaza host/referencia distintos, esquema incompatible o mantenimiento inactivo. En la futura autorización de despliegue, añadir `--deploy`: comprueba nuevamente el contrato antes de cada función y usa la CLI nativa disponible en PATH. No invoca Meta.

5. Verificar las tres funciones completas **aún en mantenimiento**:

   ```text
   node scripts/check-instagram-backends.mjs
   ```

   Requiere `SUPABASE_ADMIN_ACCESS_TOKEN` de una sesión administrativa Supabase ya verificada, proporcionado temporalmente al proceso. No escribirlo en archivos, argumentos de CLI, logs ni secretos nuevos. Cada `action=health` verifica Auth y admin, comprueba esquema y registra la versión de esa ruta para el `deployment_epoch` actual. No crea contenedores, no publica ni modifica posts. El script no imprime tokens ni cuerpos de error. Retirar la variable temporal después de usarla.

6. Con una sesión administrativa, invocar el RPC `set_instagram_maintenance` con `{p_enabled:true,p_frontend_ready:true}`. Solo se acepta si las tres funciones han registrado contrato 2 para el epoch actual. Se conserva el mantenimiento mientras se habilita el despliegue del frontend. No se reactivan publicaciones.
7. Ejecutar `node scripts/check-instagram-release.mjs frontend`. Después activar manualmente el workflow de Pages en `main`, marcando `release_instagram`. Un push solo compila; no sube ni despliega el artefacto. El workflow comprueba versión, mantenimiento y las tres verificaciones tanto antes del build como antes de publicar. El catálogo ya alojado permanece disponible.
8. Verificar frontend, catálogo público y mantenimiento. Con la sesión administrativa, invocar `set_instagram_maintenance` con `{p_enabled:false,p_frontend_ready:false}` únicamente tras completar la revisión. El RPC rechaza levantar mantenimiento sin readiness. Las reservas inciertas y las pausas siguen bloqueando operaciones pertinentes.

Ninguna comprobación de release necesita `start`, `continue`, `media` ni `media_publish`. Las pruebas de publicación se ejecutan localmente con respuestas simuladas. Una publicación real posterior requerirá su autorización individual habitual.

## Recuperación si falla una etapa

- Antes de migrar, cualquier discrepancia de esquema detiene el procedimiento; no aplicar archivos a ciegas.
- Si falla una migración, verificar su rollback y el historial antes de volver a intentar. Mantener el puente. No borrar objetos o registros para conseguir que el siguiente intento pase.
- Si falla una función o su health, mantener el flag activo y corregir/desplegar esa función. El frontend permanece sin readiness.
- Si falla Pages, mantener mantenimiento y readiness para revisar el artefacto. Un nuevo push no publica una versión accidentalmente.
- Para reiniciar una actualización, `set_instagram_maintenance(true,false)` crea un epoch nuevo e invalida las comprobaciones anteriores. Repetir health de las tres rutas y la aprobación de frontend.
- No volver a una función antigua que omita estos controles. En un fallo grave, conservar el esquema y eventos y volver al puente, con el drenaje correspondiente; no ejecutar migraciones destructivas de rollback.

El preflight no puede impedir que un operador con permisos de despliegue invoque una CLI por fuera del procedimiento ni demostrar ausencia de tráfico antiguo sin inspeccionar el runtime remoto. Las funciones nuevas verifican el esquema al operar y el guard SQL comprueba mantenimiento al reservar; ante incompatibilidad fallan cerradas. Esas garantías están probadas localmente, pero la aplicación del procedimiento remoto queda pendiente.
