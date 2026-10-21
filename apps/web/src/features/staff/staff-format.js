export const RETURN_OUTCOMES = [
  'GOOD',
  'FAIR',
  'DAMAGED',
  'LOST'
];

export const RESERVATION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'FULFILLED',
  'CANCELLED',
  'EXPIRED'
];

export const BORROWING_STATUSES = [
  'ACTIVE',
  'RETURNED',
  'LOST'
];

export const VISIT_SOURCES = [
  'MANUAL',
  'BARCODE',
  'QR'
];

export function formatDateTime(value, language = 'en') {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(
    language === 'ar' ? 'ar-EG' : 'en-GB',
    {
      dateStyle: 'medium',
      timeStyle: 'short'
    }
  ).format(date);
}

export function formatDuration(minutes, t) {
  const value = Number(minutes || 0);

  if (value < 60) {
    return `${value} ${t('staff.common.minutes')}`;
  }

  const hours = Math.floor(value / 60);
  const remaining = value % 60;

  return remaining
    ? `${hours} ${t('staff.common.hours')} ${remaining} ${t('staff.common.minutes')}`
    : `${hours} ${t('staff.common.hours')}`;
}

export function reservationTone(reservation) {
  if (reservation?.isHoldOverdue) return 'danger';
  if (reservation?.status === 'ACTIVE') return 'success';
  if (reservation?.status === 'PENDING') return 'info';
  if (reservation?.status === 'EXPIRED') return 'warning';
  return 'neutral';
}

export function borrowingTone(borrowing) {
  if (borrowing?.status === 'LOST') return 'danger';
  if (borrowing?.isOverdue) return 'danger';
  if (borrowing?.status === 'ACTIVE') return 'success';
  return 'neutral';
}

export function visitTone(visit) {
  return visit?.isOpen ? 'success' : 'neutral';
}

export function copyLabel(copy) {
  return (
    copy?.barcode ||
    copy?.copyCode ||
    copy?.id ||
    '—'
  );
}
