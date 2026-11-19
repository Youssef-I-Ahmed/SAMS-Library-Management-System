import { useLanguage } from '../../hooks/useLanguage';

export function InlineAlert({
  title,
  message,
  requestId
}) {
  const { t } = useLanguage();
  return (
    <div className="inline-alert" role="alert">
      {title && <strong>{title}</strong>}
      <span>{message}</span>

      {requestId && (
        <small>
          {t('discovery.detail.requestId')}: <bdi>{requestId}</bdi>
        </small>
      )}
    </div>
  );
}
