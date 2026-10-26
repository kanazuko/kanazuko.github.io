import { formatAvailability } from '../../utils/formatters'

export default function AvailabilityBadge({ availability }) {
  return (
    <span className={`availability availability--${availability}`}>
      <span className="availability__dot" aria-hidden="true" />
      {formatAvailability(availability)}
    </span>
  )
}
