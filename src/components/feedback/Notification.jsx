export default function Notification({ type = 'success', message, onDismiss }) {
  if (!message) return null

  return (
    <div className={`notification notification--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Cerrar notificación">×</button>
    </div>
  )
}
