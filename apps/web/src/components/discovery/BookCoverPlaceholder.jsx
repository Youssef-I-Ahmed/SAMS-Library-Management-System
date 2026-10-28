import { getItemTypeLabelKey } from '../../features/discovery/discovery-format';
import { useLanguage } from '../../hooks/useLanguage';

// Decorative generic book shape, never an edition's cover artwork.
export function BookCoverPlaceholder({ type }) {
  const { t } = useLanguage();
  return (
    <div className={`discovery-cover discovery-cover--${(type || 'BOOK').toLowerCase()}`}>
      <div className="discovery-cover__book" aria-hidden="true">
        <span>SAMS</span>
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M24 14c-6-5-13-5-18-3v25c6-2 12-1 18 3 6-4 12-5 18-3V11c-5-2-12-2-18 3Zm0 0v25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>{t(getItemTypeLabelKey(type))}</span>
      </div>
      <small>{t('discovery.card.noCover')}</small>
    </div>
  );
}
