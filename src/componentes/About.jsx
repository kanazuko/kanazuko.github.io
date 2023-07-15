import '../hojas-de-estilo/about.css'

function About(){
    return(
<section className="sobre-mi seccion-obscura">
    <div className="contenedor">
    <h2 className="seccion-titulo">Un poco sobre mi...</h2>
    <p className="seccion-texto">
      Ingeniero en Ciencias Computacionales, egresado y titulado de la Universidad de Guadalajara,
      que tiene gustos por la tecnología y le apasionan los retos, los acertijos, la resolución de problemas, 
      el pensamiento crítico y el análisis.
    </p>
    <p className='seccion-texto'>El camino que me llevó a donde estoy data desde mi infancia, donde
      siempre tuve un gusto por desarmar todo, desde juguetes hasta aparatos electrónicos, cajas fuertes,
      bicicletas, bocinas, y todo aquello que se me cruzara, con el <strong>objetivo</strong> de conocer
      cómo funcionan las cosas detrás de la fachada.
    </p>
    <p className='seccion-texto'>
      Esta virtud, y mi pasión por la tecnología y la computación, me llevó a que a la edad de 12 años me
      hiciera la pregunta que cambiaría mi vida:
    </p>
    <p className='seccion-titulo'>¿Cómo funciona una página web?</p>
    <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
      <div className='button-class'>
    <button type="button" className="btn btn-info">
      Leer más sobre mi trayectoria de vida
      <i className="bi bi-arrow-right-circle-fill"></i>
    </button>
    </div>
  </a>
    </div>
  </section>
    );
}

export default About;