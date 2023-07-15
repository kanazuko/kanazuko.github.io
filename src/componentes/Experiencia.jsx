import '../hojas-de-estilo/experience.css'

function Experiencia(){
    return(
<section className="experiencia seccion-clara">
    <div className="container text-center">
      <div className="row">
        {/* Dessarrollo web */}
        <div className="columna col-12 col-md-4">
          <i className="bi bi-laptop"></i>
          <p className="experiencia-titulo">Desarrollo Web Frontend</p>
          <p>En esta área no tengo problemas con desenvolverme y aprender sobre nuevas tecnologías para
            poder ofrecer una mejor experiencia y calidad al usuario que utilice mis aplicaciones, sin 
            embargo es un área de oportunidad para mi crecimiento personal.
          </p>
            <div className="badges-contenedor">
            <span className="badge text-bg-primary">HTML</span>
            <span className="badge text-bg-primary">CSS</span>
            <span className="badge text-bg-primary">JavaScript</span>
            <span className="badge text-bg-primary">React.js</span>

          </div>
        </div>

        {/* Articulos */}
        <div className="columna col-12 col-md-4">
          <i className="bi bi-dpad-fill"></i>
          <p className="experiencia-titulo">Desarrollo web backend</p>
          <p>Es sin duda mi área preferida. Me gusta resolver retos, idear soluciones, automatizar procesos
            y dejarle al usuario final una experiencia bonita donde, con el sencillo paso de darle clic a un
            botón, pueda disfrutar de múltiples funcionalidades, sin siquiera tener la necesidad de saber qué
            se encuentra detrás de la aplicación.
          </p>
            <div className="badges-contenedor">
            <span className="badge text-bg-primary">Laravel</span>
            <span className="badge text-bg-primary">Codeigniter</span>
            <span className="badge text-bg-primary">ASP.NET</span>
            <span className="badge text-bg-primary">MySQL</span>
            <span className="badge text-bg-primary">SQLServer</span>
            <span className="badge text-bg-primary">Drupal</span>
            </div>
        </div>

        {/* Estudiante */}
        <div className="columna col-12 col-md-4">
          <i className="bi bi-dpad"></i>
          <p className="experiencia-titulo">Diseño</p>
          <p>Gracias a mi trayectoria como fotógrafo, y al tiempo que estuve estudiando diseño industrial, 
            tuve la fortuna de aprender y nutrirme del mundo del diseño, lo que me otorgó conocimientos en
            los programas de diseño más populares, así como la teoría del diseño y la composición.
          </p>
            <div className="badges-contenedor">
            <span className="badge text-bg-primary">Photoshop</span>
            <span className="badge text-bg-primary">Lightroom</span>
            <span className="badge text-bg-primary">Fotografía Profesional</span>
            </div>
        </div>
      </div>

    </div>
  </section>
    );
}

export default Experiencia;