import { Link } from 'react-router-dom'

export default function CategoryCard({ category }) {
  return (
    <Link className="category-card" to={`/categoria/${category.slug}`}>
      <span className="eyebrow">Colección</span>
      <h3>{category.name}</h3>
      {category.description && <p>{category.description}</p>}
      <span className="text-link">Explorar →</span>
    </Link>
  )
}
