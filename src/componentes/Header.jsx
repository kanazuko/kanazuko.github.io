import '../hojas-de-estilo/navbar.css'
function Header(){
  return(
  <nav className="navbar navbar-expand-md navbar-light">
  <div className="container-fluid">
    <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-toggler" aria-controls="navbarToggler" aria-expanded="false" aria-label="Toggle navigation">
      <span className="navbar-toggler-icon"></span>
    </button>
    <div className="collapse navbar-collapse" id="navbar-toggler">
      <a className="navbar-brand" href="#"><img src={require("../imagenes/qt=q_95.webp")} width="100" alt="Logo de la pagina web" /></a>
      <ul className="navbar-nav d-flex justify-content-center align-items-center">
        <li className="nav-item">
          <a className="nav-link active" aria-current="page" href="#">Inicio</a>
        </li>
        <li className="nav-item">
          <a className="nav-link" href="#">Nosotros</a>
        </li>
        <li className="nav-item">
          <a className="nav-link" href="#">Proyectos</a>
        </li>
        <li className="nav-item">
          <a className="nav-link">Contacto</a>
        </li>
      </ul>
    </div>
  </div>
</nav>
  );
}

export default Header;