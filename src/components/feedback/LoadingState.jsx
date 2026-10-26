export default function LoadingState({ label = 'Cargando…', fullPage = false }) {
  return (
    <div className={fullPage ? 'status status--page' : 'status'} role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
