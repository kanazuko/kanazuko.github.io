import React, { Component }  from 'react';
import '../hojas-de-estilo/contador.css';
function Contador({numClics}){
  return(
    <div className='contador seccion-obscura'>
      {numClics}
    </div>
  );
}
export default Contador;