export function InlineAlert({
  title,
  message,
  requestId
}) {
  return (
    <div className="inline-alert" role="alert">
      {title && <strong>{title}</strong>}
      <span>{message}</span>

      {requestId && (
        <small>
          Request ID: {requestId}
        </small>
      )}
    </div>
  );
}
