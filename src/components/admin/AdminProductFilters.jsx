export default function AdminProductFilters({ filters, categories, onChange, resultCount }) {
  return (
    <div className="admin-filters">
      <div className="admin-filter admin-filter--search">
        <label htmlFor="admin-product-search">Buscar</label>
        <input id="admin-product-search" type="search" value={filters.query} onChange={(event) => onChange('query', event.target.value)} placeholder="Nombre, SKU o slug" />
      </div>
      <div className="admin-filter">
        <label htmlFor="admin-category-filter">Categoría</label>
        <select id="admin-category-filter" value={filters.category} onChange={(event) => onChange('category', event.target.value)}>
          <option value="">Todas</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div className="admin-filter">
        <label htmlFor="admin-published-filter">Publicación</label>
        <select id="admin-published-filter" value={filters.published} onChange={(event) => onChange('published', event.target.value)}>
          <option value="">Todos</option><option value="published">Publicados</option><option value="draft">Borradores</option>
        </select>
      </div>
      <div className="admin-filter">
        <label htmlFor="admin-availability-filter">Disponibilidad</label>
        <select id="admin-availability-filter" value={filters.availability} onChange={(event) => onChange('availability', event.target.value)}>
          <option value="">Todas</option><option value="available">Disponible</option><option value="out_of_stock">Agotado</option><option value="made_to_order">Sobre pedido</option>
        </select>
      </div>
      <div className="admin-filter">
        <label htmlFor="admin-sort">Ordenar</label>
        <select id="admin-sort" value={filters.sort} onChange={(event) => onChange('sort', event.target.value)}>
          <option value="catalog">Orden del catálogo</option><option value="newest">Más recientes</option><option value="name-asc">Nombre A–Z</option><option value="name-desc">Nombre Z–A</option><option value="price-asc">Menor precio</option><option value="price-desc">Mayor precio</option>
        </select>
      </div>
      <p className="admin-filter-count">{resultCount} {resultCount === 1 ? 'producto' : 'productos'}</p>
    </div>
  )
}
