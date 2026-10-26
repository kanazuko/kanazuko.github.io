import { useEffect, useRef } from 'react'

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', busy, onConfirm, onCancel }) {
  const cancelButtonRef = useRef(null)

  useEffect(() => {
    if (open) cancelButtonRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <p className="eyebrow">Confirmación</p>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="confirm-dialog__actions">
          <button ref={cancelButtonRef} className="admin-button admin-button--secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="admin-button admin-button--danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Eliminando…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
