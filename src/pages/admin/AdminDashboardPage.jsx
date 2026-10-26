import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'

export default function AdminDashboardPage() {
  const { user } = useAuth()

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div><p className="eyebrow">Vista general</p><h1>Administración</h1></div>
        <p>Bienvenida, {user?.email}</p>
      </header>
      <div className="admin-summary-grid">
        <section className="admin-panel admin-panel--featured">
          <p className="eyebrow">Catálogo</p>
          <h2>Gestiona tu colección</h2>
          <p>El acceso está protegido por Supabase Auth y las operaciones dependen de las políticas RLS existentes.</p>
          <Link className="admin-button" to="/admin/productos">Ver productos</Link>
        </section>
        <section className="admin-panel">
          <p className="admin-panel__label">Estado</p>
          <strong>Sesión verificada</strong>
          <p>Tu cuenta pertenece a la lista de administradores autorizados.</p>
        </section>
      </div>
    </div>
  )
}
