import '../hojas-de-estilo/experience.css'

function Experiencia(){
    return(
<section className="experiencia seccion-clara">
    <div className="container text-center">
      <div className="row">
        {/* Dessarrollo web */}
        <div className="columna col-12 col-md-4">
          <i className="bi bi-laptop"></i>
          <p className="experiencia-titulo">Desarrollo Arquitectónico</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In posuere ultrices metus, in rutrum dolor varius ultrices. Donec efficitur pellentesque massa, a sodales metus rhoncus id.</p>
          <div className="badges-contenedor">
            <span className="badge text-bg-primary">HTML</span>
            <span className="badge text-bg-primary">CSS</span>
            <span className="badge text-bg-primary">JavaScript</span>
            <span className="badge text-bg-primary">React</span>
          </div>
        </div>

        {/* Articulos */}
        <div className="columna col-12 col-md-4">
          <i className="bi bi-laptop"></i>
          <p className="experiencia-titulo">Artículos</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In posuere ultrices metus, in rutrum dolor varius ultrices. Donec efficitur pellentesque massa, a sodales metus rhoncus id.</p>
          <div className="badges-contenedor">
            <span className="badge text-bg-primary">Escribir</span>
            <span className="badge text-bg-primary">Editar</span>
            <span className="badge text-bg-primary">Blogs</span>
            </div>
        </div>

        {/* Estudiante */}
        <div className="columna col-12 col-md-4">
          <i className="bi bi-laptop"></i>
          <p className="experiencia-titulo">Estudios</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In posuere ultrices metus, in rutrum dolor varius ultrices. Donec efficitur pellentesque massa, a sodales metus rhoncus id.</p>
          <div className="badges-contenedor">
            <span className="badge text-bg-primary">Arquitectura</span>
            <span className="badge text-bg-primary">Ingeniería Civil</span>
            <span className="badge text-bg-primary">Maestrías</span>
            </div>
        </div>
      </div>

    </div>
  </section>
    );
}

export default Experiencia;