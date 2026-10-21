export function StaffOperationNotice({
  title,
  body,
  onDismiss
}) {
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
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
