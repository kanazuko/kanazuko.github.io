export default function EmptyState({ message = 'Aún no hay elementos para mostrar.' }) {
  return <p className="status status--empty">{message}</p>
}
