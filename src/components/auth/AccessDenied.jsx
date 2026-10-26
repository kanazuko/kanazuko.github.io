import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { signOut } from '../../services/authService'

export default function AccessDenied() {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    setSigningOut(true)
    setError('')
    const { error: signOutError } = await signOut()
    if (signOutError) {
      setError('No fue posible cerrar la sesión. Intenta nuevamente.')
      setSigningOut(false)
      return
    }
    navigate('/admin/login', { replace: true })
  }

  return (
    <main className="auth-page">
      <section className="auth-card access-denied" role="alert">
        <div className="access-denied__icon" aria-hidden="true">!</div>
        <p className="eyebrow">Acceso restringido</p>
        <h1>Sin permisos administrativos</h1>
        <p>
          La cuenta <strong>{user?.email}</strong> inició sesión correctamente, pero no está registrada
          como administradora de PRArtJewelry.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button" type="button" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Cerrando sesión…' : 'Usar otra cuenta'}
        </button>
      </section>
    </main>
  )
}
