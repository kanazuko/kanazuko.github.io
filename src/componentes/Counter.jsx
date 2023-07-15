import React, { Component }  from 'react';
import '../hojas-de-estilo/contador.css';
function Counter ({numClics}){
  return(
    <section className='contadores_principal seccion-obscura'>
          <div className='contador' data-cantidad-total="2850">
            {numClics}
        </div>
      </section>
  );
}
export default Counter;