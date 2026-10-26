import { NavLink } from 'react-router-dom'

export default function Navigation({ open, onNavigate }) {
  return (
    <nav id="main-navigation" className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Navegación principal">
      <ul className="nav-list">
        <li><NavLink to="/" end onClick={onNavigate}>Inicio</NavLink></li>
        <li><NavLink to="/catalogo" onClick={onNavigate}>Catálogo</NavLink></li>
      </ul>
    </nav>
  )
}
