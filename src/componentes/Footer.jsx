import '../hojas-de-estilo/footer.css'
function Footer(){
  return(
    <footer className='seccion-obscura d-flex flex-column align-items-center justify-content-center'>
      <img className='footer-logo' src={require('../imagenes/qt=q_95.webp')} alt="logo del portafolio" />
      <p className='footer-texto text-center'>Aprendo y crezco todos los días.<br/>Creemos un proyecto juntos</p>
      <div className='iconos-redes-sociales d-flex flex-wrap align-items-center justify-content-center'>
        <a href='https://twitter.com/' target='_blank' rel='noopener noreferrer'>
          <i className="bi bi-twitter"></i>
        </a>
        <a href='https://linkedin.com/' target='_blank' rel='noopener noreferrer'>
          <i className="bi bi-linkedin"></i>
        </a>
        <a href='https://facebook.com/' target='_blank' rel='noopener noreferrer'>
          <i className="bi bi-facebook"></i>
        </a>
        <a href='https://github.com/' target='_blank' rel='noopener noreferrer'>
          <i className="bi bi-github"></i>
        </a>
        <a href='mailto:gva@gmail.com' target='_blank' rel='noopener noreferrer'>
          <i className="bi bi-envelope"></i>
        </a>
      </div>
    </footer>
  );
}
export default Footer;