import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navigation from './Navigation'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="brand" to="/" aria-label="PRArtJewelry, inicio">
          PR<span>Art</span>Jewelry
        </Link>
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <Navigation open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      </div>
    </header>
  )
}
