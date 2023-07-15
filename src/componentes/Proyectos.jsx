import '../hojas-de-estilo/proyects.css'

function Proyectos(){
    return(
        
<section className="proyectos-recientes seccion-clara d-flex flex-column">
    
    <h2 className="seccion-titulo texto-negro">Hobbies</h2>
    <h3 className="seccion-descripcion">Estos son algunos de los hobbies que me llenan y apasionan</h3>
   {/* Galería de proyectos  */}
  <div className="container text-center proyectos-contenedor">
    <div className="row">
        {/* Proyecto 1  */}
      <div className="col-12 col-md-6 col-lg-4">
        <div className="proyecto">
          <img src={require("../imagenes/proyectos/hobbie1.jpg")} alt="Hobbie 1" />
          <div className="overlay">
            <p>Billar</p>
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
          <img src={require("../imagenes/proyectos/hobbie2.jpg")} alt="Hobbie 2" />
          <div className="overlay">
            <p>Arquería</p>
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
          <img src={require("../imagenes/proyectos/hobbie3.png")} alt="Hobbie 3" />
          <div className="overlay">
            <p>Fotografía</p>
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
          <img src={require("../imagenes/proyectos/hobbie4.jpg")} alt="Hobbie 4" />
          <div className="overlay">
            <p>Baseball</p>
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
          <img src={require("../imagenes/proyectos/hobbie5.jpg")} alt="Hobbie 5" />
          <div className="overlay">
            <p>Fotografía</p>
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
          <img src={require("../imagenes/proyectos/hobbie6.jpg")} alt="Proyecto 6" />
          <div className="overlay">
            <p>Gaming</p>
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
  {/* <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
    <button type="button" className="btn btn-info">
      Ver más proyectos
      <i className="bi bi-arrow-right-circle-fill"></i>
    </button>
  </a> */}
  </section>

  );
}

export default Proyectos;