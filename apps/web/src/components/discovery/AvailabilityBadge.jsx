import { useLanguage } from '../../hooks/useLanguage';
import { getAvailabilityState } from '../../features/discovery/discovery-format';

export function AvailabilityBadge({ availability }) {
  const { t } = useLanguage();
  const state = getAvailabilityState(availability);

  return (
    <span className={`availability-badge availability-badge--${state}`}>
      <span className="availability-badge__dot" aria-hidden="true" />
      {t(`discovery.availability.${state}`)}
      {availability?.availableCopies > 0
        ? ` · ${availability.availableCopies}`
        : ''}
    </span>
  );
}
