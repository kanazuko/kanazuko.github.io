import { useState } from 'react'
import { getInstagramStatus } from '../../services/instagramService'
import InstagramComposer from '../../components/admin/InstagramComposer'

export default function AdminInstagramPage() {
  const [checking, setChecking] = useState(false)
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)

  async function checkConnection() {
    setChecking(true)
    setAccount(null)
    setError('')
    try {
      setAccount(await getInstagramStatus())
    } catch (checkError) {
      setError(checkError.message)
    } finally {
      setChecked(true)
      setChecking(false)
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header"><div><h1>Instagram</h1><p>Consulta la conexión de PRArtJewelry con Instagram.</p></div></header>
      <section className="admin-form-section" aria-busy={checking}>
        <div className="admin-form-section__heading"><h2>Instagram API with Unified Login</h2><p>Cuenta de la tienda: @prartjewelry</p></div>
        <div role="status" aria-live="polite">
          <p><strong>Estado:</strong> {checking ? 'Verificando…' : account ? 'Conectado' : checked ? 'Desconectado · no se pudo confirmar la conexión' : 'Sin verificar'}</p>
          {account && <p><strong>Usuario:</strong> @{account.username}<br /><strong>Identificador:</strong> {account.account_id}</p>}
        </div>
        {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
        <button className="admin-button" type="button" onClick={checkConnection} disabled={checking}>
          {checking ? 'Verificando…' : 'Verificar conexión'}
        </button>
      </section>
      <InstagramComposer />
    </div>
  )
}
