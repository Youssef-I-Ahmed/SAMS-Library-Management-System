// Builds the text for a notification in the reader's language from its type and data.

const fill = (text, values) => String(text ?? '').replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? '—'));

const locale = (language) => (language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');

export function formatWhen(value, language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(date);
}

export function notificationText(notification, t, language) {
  const known = t(`notifications.types.${notification.type}.title`) !== `notifications.types.${notification.type}.title`;
  const type = known ? notification.type : 'UNKNOWN';
  const data = notification.data || {};
  const values = {
    ...data,
    expiresAt: formatWhen(data.expiresAt, language),
    dueAt: formatWhen(data.dueAt, language),
    alertName: data.alert ? t(`notifications.alerts.${data.alert}`, data.alert) : '',
    who: data.who ?? '—'
  };
  return {
    title: fill(t(`notifications.types.${type}.title`), values),
    body: fill(t(`notifications.types.${type}.body`), values).trim()
  };
}

export function timeAgo(value, t, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return t('notifications.justNow');
  if (minutes < 60) return t('notifications.minutes').replace('{count}', minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('notifications.hours').replace('{count}', hours);
  return t('notifications.days').replace('{count}', Math.round(hours / 24));
}
