import '../hojas-de-estilo/articles.css'

function Articulos(){
    return(
     
<section className="articulos justify-content-start">
    <h2 className="seccion-titulo texto-negro">Artículos</h2>
    <div className="card">
      <div className="card-header">
        Más recientes
      </div>
      <ul className="list-group list-group-flush">
        <a href="#" target="_blank" rel="noopener noreferrer">
        <li className="list-group-item">Lorem ipsum, dolor sit amet consectetur adipisicing elit. Saepe, corrupti.</li>
        </a>
        <a href="#" target="_blank" rel="noopener noreferrer">
        <li className="list-group-item">Vitae suscipit, assumenda, optio repellendus illo numquam eius nulla rerum reprehenderit beatae iusto laboriosam enim!</li>
        </a>
        <a href="#" target="_blank" rel="noopener noreferrer">
        <li className="list-group-item">Molestiae saepe in adipisci delectus voluptatem nostrum reiciendis!
        </li>
        </a>
        <a href="#" target="_blank" rel="noopener noreferrer">
          <li className="list-group-item">Lorem ipsum dolor, sit amet consectetur adipisicing elit. Saepe cum porro sed, nam cupiditate ipsa vitae nisi delectus eveniet eos.</li>
        </a>
        <a href="#" target="_blank" rel="noopener noreferrer">
          <li className="list-group-item">Lorem ipsum dolor sit amet consectetur adipisicing elit. Voluptas porro explicabo delectus soluta, ex corporis?</li>
        </a>
      </ul>
    </div>
    <a href="https://github.com/" target="_blank" rel="noopener noreferrer">
      <button type="button" className="btn btn-info">
        Ver más artículos
        <i className="bi bi-arrow-right-circle-fill"></i>
      </button>
    </a>

  </section>

);
}

export default Articulos;