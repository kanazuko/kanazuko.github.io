import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import LoadingState from '../feedback/LoadingState'
import ErrorState from '../feedback/ErrorState'
import AccessDenied from './AccessDenied'

export default function ProtectedRoute() {
  const { user, isAdmin, authorizationStatus, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingState label="Verificando acceso…" fullPage />
  if (!user) return <Navigate to="/admin/login" state={{ from: location }} replace />
  if (authorizationStatus === 'error') {
    return (
      <main className="auth-page">
        <div className="auth-card"><ErrorState message="No fue posible verificar tus permisos. Intenta recargar la página." /></div>
      </main>
    )
  }
  if (!isAdmin) return <AccessDenied />

  return <Outlet />
}
