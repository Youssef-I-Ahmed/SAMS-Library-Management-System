import { useLanguage } from '../../hooks/useLanguage';

export function StaffOperationNotice({
  title,
  body,
  onDismiss
}) {
  const { t } = useLanguage();
  if (!title) return null;

  return (
    <div className="staff-operation-notice" role="status">
      <div>
        <strong>{title}</strong>
        {body && <span>{body}</span>}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('staff.ux.dismiss')}
        >
          ×
        </button>
      )}
    </div>
  );
}
