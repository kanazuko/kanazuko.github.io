import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AccessDenied from '../../components/auth/AccessDenied'
import ErrorState from '../../components/feedback/ErrorState'
import LoadingState from '../../components/feedback/LoadingState'
import { useAuth } from '../../hooks/useAuth'
import { signIn } from '../../services/authService'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { user, isAdmin, authorizationStatus, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = location.state?.from?.pathname || '/admin'

  useEffect(() => {
    if (!loading && isAdmin) navigate(destination, { replace: true })
  }, [destination, isAdmin, loading, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const { error: authError } = await signIn(email, password)
      if (authError) throw authError
      navigate(destination, { replace: true })
    } catch (submitError) {
      console.error(submitError)
      setError('El correo o la contraseña no son correctos.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState label="Restaurando sesión…" fullPage />
  if (user && authorizationStatus === 'denied') return <AccessDenied />
  if (user && authorizationStatus === 'error') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <ErrorState message="No fue posible verificar los permisos de esta cuenta. Recarga la página para intentarlo nuevamente." />
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand" to="/">PR<span>Art</span>Jewelry</Link>
        <div><p className="eyebrow">Acceso privado</p><h1>Bienvenida de nuevo</h1></div>
        <p className="auth-intro">Ingresa con la cuenta autorizada para administrar el catálogo.</p>
        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Correo electrónico</label>
          <input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label htmlFor="admin-password">Contraseña</label>
          <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Verificando…' : 'Ingresar al panel'}</button>
        </form>
        <Link className="text-link" to="/">← Volver al catálogo</Link>
      </section>
    </main>
  )
}
