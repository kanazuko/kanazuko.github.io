export default function CatalogControls({
  categories,
  category,
  onCategoryChange,
  subcategory,
  onSubcategoryChange,
  color,
  onColorChange,
  tag,
  onTagChange,
  colors,
  tags,
  query,
  onQueryChange,
  sort,
  onSortChange,
  resultCount,
}) {
  return (
    <div className="catalog-tools">
      <div className="catalog-search">
        <label htmlFor="catalog-search">Buscar piezas</label>
        <input
          id="catalog-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Nombre, material o color"
        />
      </div>

      <div className="catalog-selects">
        <label>
          <span>Categoría</span>
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value="">Todas</option>
            {categories.filter((item) => !item.parent_id).map((item) => (
              <option key={item.id} value={item.slug}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Subcategoría</span>
          <select value={subcategory} onChange={(event) => onSubcategoryChange(event.target.value)} disabled={!category}>
            <option value="">Todas</option>
            {categories.filter((item) => item.parent_id && (!category || categories.find((parent) => parent.id === item.parent_id)?.slug === category)).map((item) => (
              <option key={item.id} value={item.slug}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Color</span>
          <select value={color} onChange={(event) => onColorChange(event.target.value)}>
            <option value="">Todos</option>
            {colors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Etiqueta</span>
          <select value={tag} onChange={(event) => onTagChange(event.target.value)}>
            <option value="">Todas</option>
            {tags.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Ordenar</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
            <option value="featured">Orden del catálogo</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
            <option value="name-asc">Nombre: A–Z</option>
            <option value="name-desc">Nombre: Z–A</option>
          </select>
        </label>
      </div>

      <p className="catalog-count" aria-live="polite">
        {resultCount} {resultCount === 1 ? 'pieza' : 'piezas'}
      </p>
    </div>
  )
}
