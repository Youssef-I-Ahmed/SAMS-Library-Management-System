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

export function formatDate(value, language = 'en') {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(
    language === 'ar' ? 'ar-EG' : 'en-GB',
    { dateStyle: 'medium' }
  ).format(date);
}

export function getReservationTone(status) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'info';
  if (status === 'FULFILLED') return 'neutral';
  if (status === 'EXPIRED') return 'warning';
  return 'muted';
}

export function getBorrowingTone(borrowing) {
  if (borrowing?.status === 'LOST') return 'danger';
  if (borrowing?.isOverdue) return 'danger';
  if (borrowing?.status === 'ACTIVE') return 'success';
  return 'neutral';
}

export function isReservationCancellable(reservation) {
  return ['PENDING', 'ACTIVE'].includes(reservation?.status);
}

export function makeReservationIdempotencyKey(itemId, branchId) {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `sams-reserve-${itemId}-${branchId}-${randomPart}`;
}

export function hasStudentCirculationPrivacyLeak(value) {
  const text = JSON.stringify(value || {}).toLowerCase();

  return [
    '"barcode"',
    '"copycode"',
    '"shelflocation"',
    '"allocatedcopy"',
    '"copy":'
  ].some((needle) => text.includes(needle));
}
