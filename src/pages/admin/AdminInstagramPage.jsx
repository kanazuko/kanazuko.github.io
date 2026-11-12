import { useEffect, useState } from 'react'
import { getInstagramRuntime, getInstagramStatus, resumeInstagramQueries } from '../../services/instagramService'
import InstagramComposer from '../../components/admin/InstagramComposer'

export default function AdminInstagramPage() {
  const [checking, setChecking] = useState(false)
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)
  const [errorCode, setErrorCode] = useState('')
  const [notice, setNotice] = useState('')
  const [runtime, setRuntime] = useState(null)
  const [runtimePending, setRuntimePending] = useState(true)
  const [runtimeError, setRuntimeError] = useState('')
  const [runtimeRevision, setRuntimeRevision] = useState(0)
  const suspended = runtimePending || Boolean(runtimeError) || !runtime || runtime.maintenance || !runtime.frontend_ready

  useEffect(() => {
    let active = true
    getInstagramRuntime().then(state => {
      if (active) { setRuntime(state); setRuntimeError('') }
    }).catch(() => {
      if (active) { setRuntime(null); setRuntimeError('No se pudo verificar el estado de Instagram. Las operaciones permanecen bloqueadas.') }
    }).finally(() => { if (active) setRuntimePending(false) })
    return () => { active = false }
  }, [runtimeRevision])

  async function checkConnection() {
    if (suspended) return
    setChecking(true)
    setAccount(null)
    setError('')
    setErrorCode(''); setNotice('')
    try {
      setAccount(await getInstagramStatus())
    } catch (checkError) {
      setError(checkError.message)
      setErrorCode(checkError.code || '')
    } finally {
      setChecked(true)
      setChecking(false)
    }
  }

  async function resumeQueries() {
    if (suspended) return
    if (!window.confirm('¿Ya corregiste el token, los permisos o la restricción en Meta? Se permitirá volver a consultar la cuenta. No se continuará ni reenviará ninguna publicación.')) return
    setChecking(true); setNotice('')
    try {
      await resumeInstagramQueries()
      setError(''); setErrorCode(''); setChecked(false)
      setNotice('Bloqueo retirado. Verifica la conexión cuando estés listo. Las pausas temporales de Meta siguen vigentes.')
    } catch (failure) { setError(failure.message) } finally { setChecking(false) }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header"><div><h1>Instagram</h1><p>Consulta la conexión de PRArtJewelry con Instagram.</p></div></header>
      <section aria-label="Disponibilidad de Instagram" aria-live="polite">
        {runtimePending ? <p role="status">Comprobando disponibilidad de Instagram…</p>
          : runtimeError ? <p className="form-banner form-banner--error" role="alert">{runtimeError}</p>
            : runtime?.maintenance ? <p className="form-banner" role="status">Instagram está en mantenimiento. No se enviará contenido; el catálogo continúa disponible.</p>
              : !runtime?.frontend_ready ? <p role="status">Instagram está pendiente de activación. Las operaciones siguen bloqueadas.</p> : null}
        <button className="admin-button admin-button--secondary" type="button" disabled={runtimePending} onClick={() => { setRuntimePending(true); setRuntimeRevision(value => value + 1) }}>Actualizar disponibilidad</button>
      </section>
      <section className="admin-form-section" aria-busy={checking}>
        <div className="admin-form-section__heading"><h2>Instagram API with Unified Login</h2><p>Cuenta de la tienda: @prartjewelry</p></div>
        <div role="status" aria-live="polite">
          <p><strong>Estado:</strong> {suspended ? runtime?.maintenance ? 'Mantenimiento' : 'Operaciones suspendidas' : checking ? 'Verificando…' : account ? 'Conectado' : checked ? 'Desconectado · no se pudo confirmar la conexión' : 'Sin verificar'}</p>
          {account && <p><strong>Usuario:</strong> @{account.username}<br /><strong>Identificador:</strong> {account.account_id}</p>}
        </div>
        {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button className="admin-button" type="button" onClick={checkConnection} disabled={checking || suspended}>
          {checking ? 'Verificando…' : 'Verificar conexión'}
        </button>
        {['INSTAGRAM_TOKEN_INVALID', 'INSTAGRAM_PERMISSION_DENIED', 'INSTAGRAM_ACCOUNT_RESTRICTED'].includes(errorCode) && <button className="admin-button admin-button--secondary" type="button" disabled={checking || suspended} onClick={resumeQueries}>Reactivar consultas después de corregir el acceso</button>}
      </section>
      <InstagramComposer suspended={suspended} />
    </div>
  )
}
