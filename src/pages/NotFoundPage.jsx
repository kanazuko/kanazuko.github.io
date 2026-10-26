import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="eyebrow">Error 404</p>
      <h1>Esta página no existe.</h1>
      <Link className="button" to="/">Volver al inicio</Link>
    </main>
  )
}
