import '../hojas-de-estilo/hero.css'
function Header(){
    return(<section className="hero align-items-stretch">
    <div className="hero-principal d-flex flex-column justify-content-center align-items-center">
          <img className="hero-imagen-desarrollador" src={require("../imagenes/qt=q_95.webp")} width="100" alt="GVA Logo" />
          <div className="row text-center align-items-center">
            <div className="columna col-12 col-md-8">
              <div className="hero-inferior">
                <img className="hero-inferior-imagen img-fluid" src={require("../imagenes/hero-inferior-arq.webp")} alt="Monitor, laptop y logos" />
              </div>
            </div>
          <div className="columna col-12 col-md-4">      
          <h1>GVA ARQUITECTOS</h1>
          <h2>La firma líder de arquitectura en Latinoamérica</h2>
        </div>
      </div>
    </div>
  </section>
  );
}

export default Header;