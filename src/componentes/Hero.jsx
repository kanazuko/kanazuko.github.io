import '../hojas-de-estilo/hero.css'
function Header(){
    return(<section className="hero align-items-stretch">
    <div className="hero-principal d-flex flex-column justify-content-center align-items-center">
          <img className="hero-imagen-desarrollador" src={require("../imagenes/retratoTitulo.png")} width="100" alt="GVA Logo" />
          <div className="row text-center align-items-center">
            <div className="columna col-12 col-md-8">
              <div className="hero-inferior">
                <img className="hero-inferior-imagen img-fluid" src={require("../imagenes/4045240_a392_3.jpg")} alt="Monitor, laptop y logos" />
              </div>
            </div>
          <div className="columna col-12 col-md-4">      
          <h1>RAUL EDUARDO AVILA MATA</h1>
          <h2>Desarrollador, ingeniero, gamer y apasionado por la tecnología.</h2>
        </div>
      </div>
    </div>
  </section>
  );
}

export default Header;