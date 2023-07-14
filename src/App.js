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
  return (
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