import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LoadingState from './components/feedback/LoadingState'
import SiteLayout from './layouts/SiteLayout'

const HomePage = lazy(() => import('./pages/HomePage'))
const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const CategoryPage = lazy(() => import('./pages/CategoryPage'))
const ProductPage = lazy(() => import('./pages/ProductPage'))
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

export default function App() {
  return (
    <Suspense fallback={<LoadingState label="Cargando página…" fullPage />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="categoria/:slug" element={<CategoryPage />} />
          <Route path="producto/:slug" element={<ProductPage />} />
        </Route>

        <Route path="admin/login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
          </Route>
        </Route>

        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  )
}
