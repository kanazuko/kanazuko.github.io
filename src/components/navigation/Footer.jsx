import { Link } from 'react-router-dom'

const currentYear = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link className="brand" to="/">PR<span>Art</span>Jewelry</Link>
          <p>Piezas elegidas para acompañar historias únicas.</p>
        </div>
        <nav aria-label="Navegación del pie de página">
          <p className="footer-title">Explorar</p>
          <Link to="/">Inicio</Link>
          <Link to="/catalogo">Catálogo</Link>
        </nav>
        <div>
          <p className="footer-title">Colección</p>
          <p>Joyería contemporánea con una mirada atemporal.</p>
        </div>
      </div>
      <div className="container footer-bottom">© {currentYear} PRArtJewelry.</div>
    </footer>
  )
}
