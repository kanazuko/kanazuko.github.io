import '../hojas-de-estilo/proyects.css'

function Proyectos(){
    return(
        
<section className="proyectos-recientes seccion-clara d-flex flex-column">
    
    <h2 className="seccion-titulo texto-negro">Proyectos</h2>
    <h3 className="seccion-descripcion">Estos son algunos proyectos que hemos realizado recientemente</h3>
   {/* Galería de proyectos  */}
  <div className="container text-center proyectos-contenedor">
    <div className="row">
        {/* Proyecto 1  */}
      <div className="col-12 col-md-6 col-lg-4">
        <div className="proyecto">
          <img src={require("../imagenes/proyectos/proyecto1.png")} alt="Proyecto 1" />
          <div className="overlay">
            <p>Proyecto 1</p>
            <div className="iconos-contenedor">
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-github"></i>
              </a>
              <a href="https://www.freecodecamp.org/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-laptop"></i>
              </a>
              </div>
          </div>
        </div>
      </div>
    {/*  Proyecto 2  */}
      <div className="col-12 col-md-6 col-lg-4">
        <div className="proyecto">
          <img src={require("../imagenes/proyectos/proyecto2.png")} alt="Proyecto 2" />
          <div className="overlay">
            <p>Proyecto 2</p>
            <div className="iconos-contenedor">
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-github"></i>
              </a>
              <a href="https://www.freecodecamp.org/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-laptop"></i>
              </a>
              </div>
          </div>
        </div>
      </div>
    {/* //    Proyecto 3  */}
      <div className="col-12 col-md-6 col-lg-4">
        <div className="proyecto">
          <img src={require("../imagenes/proyectos/proyecto3.png")} alt="Proyecto 3" />
          <div className="overlay">
            <p>Proyecto 3</p>
            <div className="iconos-contenedor">
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-github"></i>
              </a>
              <a href="https://www.freecodecamp.org/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-laptop"></i>
              </a>
              </div>
          </div>
        </div>
      </div>
    {/* //    Proyecto 4  */}
      <div className="col-12 col-md-6 col-lg-4">
        <div className="proyecto">
          <img src={require("../imagenes/proyectos/proyecto4.png")} alt="Proyecto 4" />
          <div className="overlay">
            <p>Proyecto 4</p>
            <div className="iconos-contenedor">
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-github"></i>
              </a>
              <a href="https://www.freecodecamp.org/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-laptop"></i>
              </a>
              </div>
          </div>
        </div>
      </div>
    {/* //    Proyecto 5  */}
      <div className="col-12 col-md-6 col-lg-4">
        <div className="proyecto">
          <img src={require("../imagenes/proyectos/proyecto5.png")} alt="Proyecto 5" />
          <div className="overlay">
            <p>Proyecto 5</p>
            <div className="iconos-contenedor">
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-github"></i>
              </a>
              <a href="https://www.freecodecamp.org/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-laptop"></i>
              </a>
              </div>
          </div>
        </div>
      </div>
    {/* //    Proyecto 6  */}
      <div className="col-12 col-md-6 col-lg-4">
        <div className="proyecto">
          <img src={require("../imagenes/proyectos/proyecto6.png")} alt="Proyecto 6" />
          <div className="overlay">
            <p>Proyecto 6</p>
            <div className="iconos-contenedor">
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-github"></i>
              </a>
              <a href="https://www.freecodecamp.org/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-laptop"></i>
              </a>
              </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
    <button type="button" className="btn btn-info">
      Ver más proyectos
      <i className="bi bi-arrow-right-circle-fill"></i>
    </button>
  </a>
  </section>

  );
}

export default Proyectos;