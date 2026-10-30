import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { signOut } from '../services/authService'

export default function AdminLayout() {
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    setSigningOut(true)
    setSignOutError('')
    const { error } = await signOut()
    if (error) {
      setSignOutError('No se pudo cerrar la sesión.')
      setSigningOut(false)
      return
    }
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <NavLink className="admin-brand" to="/admin">PR<span>Art</span>Jewelry <small>Admin</small></NavLink>
        <nav className="admin-nav" aria-label="Administración">
          <NavLink to="/admin" end>
            <span aria-hidden="true">◇</span> Resumen
          </NavLink>
          <NavLink to="/admin/productos">
            <span aria-hidden="true">□</span> Productos
          </NavLink>
          <NavLink to="/admin/configuracion">
            <span aria-hidden="true">⚙</span> Configuración
          </NavLink>
          <NavLink to="/admin/pedidos"><span aria-hidden="true">▤</span> Pedidos</NavLink>
        </nav>
        <div className="admin-account">
          <span className="admin-account__avatar" aria-hidden="true">
            {user?.email?.charAt(0).toUpperCase()}
          </span>
          <div><small>Sesión activa</small><span title={user?.email}>{user?.email}</span></div>
          <button type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Saliendo…' : 'Cerrar sesión'}
          </button>
          {signOutError && <small className="admin-account__error" role="alert">{signOutError}</small>}
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>Panel administrativo</span>
          <NavLink to="/">Ver catálogo ↗</NavLink>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  )
}
