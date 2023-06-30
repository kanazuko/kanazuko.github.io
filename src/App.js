import './App.css';
import './hojas-de-estilo/adaptativeresponsive.css';

import Header from './componentes/Header.jsx';
import Hero from './componentes/Hero.jsx';
import About from './componentes/About.jsx';
import Experiencia from './componentes/Experiencia.jsx';
import Proyectos from './componentes/Proyectos.jsx';
import Articulos from './componentes/Articulos.jsx';
import Testimonios from './componentes/Testimonios.jsx';
import Footer from './componentes/Footer.jsx';

//import {useState} from 'react';


function App() {

  // const [numClics,setNumClics] = useState(0);

  // const manejarClic = () => {
  //   setNumClics(numClics+1);
  // };
  // const reiniciarContador = () => {
  //   setNumClics(0);
  // };

  return (
    //   <div className='freecodecamp-logo-contenedor'>
    //     <img
    //       className='freecodecamp-logo'
    //       src={freeCodeCampLogo}
    //       alt='Logo de freeCodeCamp' />
    //   </div>
    //   <div className='contenedor-principal'>
    //     <Contador
    //     numClics={numClics}
    //     />
    //     <Boton 
    //       texto='Clic'
    //       esBotonDeClic={true}
    //       manejarClic={manejarClic}
    //     />
    //     <Boton 
    //     texto='Reiniciar'
    //     esBotonDeClic={false}
    //     manejarClic={reiniciarContador}
    //     />
    //   </div>
    <div className="App">
      <Header />
      <Hero />
      <About />
      <Experiencia />
      <Proyectos />
      <Articulos />
      <Testimonios />
      <Footer />
    </div>
  );

}

export default App;