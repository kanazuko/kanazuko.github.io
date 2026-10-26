export default function ErrorState({ message = 'No pudimos cargar la información.' }) {
  return <p className="status status--error" role="alert">{message}</p>
}
