import "../hojas-de-estilo/testimonies.css"

function Testimonios(){
    return(
        
<section className="testimonios seccion-clara">
    <h2 className="seccion-titulo">Testimonios</h2>
    <h3 className="seccion-descripcion">Estos son algunos de los testimonios de mis clientes...</h3>
    
     {/* Corrousel  */}
    <div id="testimonios-carrusel" className="carousel carousel-dark slide" data-bs-ride="carousel">
      <div className="carousel-indicators">
        <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="0" className="active" aria-current="true" aria-label="Slide 1"></button>
        <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="1" aria-label="Slide 2"></button>
        <button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="2" aria-label="Slide 3"></button>
      </div>
      <div className="carousel-inner">
        <div className="carousel-item active">
          <div className="container">
            <img className="testimonio-imagen rounded-circle" src={require("../imagenes/testimonios/testimonio-sarah.png")} alt="Cliente 1" />
            <p className="testimonio-texto">Lorem ipsum dolor sit amet consectetur adipisicing elit. Voluptas tenetur alias aut aperiam voluptates commodi sed, quisquam odit magni dolor?</p>
            <div className="testimonio-info">
              <p className="cliente">Gino</p>
              <p className="cargo">Gerente de proyectos en Desarrollo Web</p>
            </div>
          </div>
        </div>
        <div className="carousel-item">
          <div className="container">
            <img className="testimonio-imagen rounded-circle" src={require("../imagenes/testimonios/testimonio-emma.png")} alt="Cliente 2" />
            <p className="testimonio-texto">Lorem ipsum dolor sit amet consectetur adipisicing elit. Voluptas tenetur alias aut aperiam voluptates commodi sed, quisquam odit magni dolor?</p>
            <div className="testimonio-info">
              <p className="cliente">Gina</p>
              <p className="cargo">Gerente de proyectos en Amazon</p>
            </div>
          </div>
        </div>
        <div className="carousel-item">
          <img src={require("../imagenes/proyectos/proyecto3.png")} className="d-block w-100" alt="..." />
        </div>
      </div>
      <button className="carousel-control-prev" type="button" data-bs-target="#testimonios-carrusel" data-bs-slide="prev">
        <span className="carousel-control-prev-icon" aria-hidden="true"></span>
        <span className="visually-hidden">Anterior</span>
      </button>
      <button className="carousel-control-next" type="button" data-bs-target="#testimonios-carrusel" data-bs-slide="next">
        <span className="carousel-control-next-icon" aria-hidden="true"></span>
        <span className="visually-hidden">Siguiente</span>
      </button>
    </div>


  </section>

  );
}

export default Testimonios;