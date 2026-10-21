import { apiRequest } from '../../lib/api';
import { buildPagedParams } from './circulation-query';

export async function createReservation(
  token,
  { itemId, branchId },
  idempotencyKey
) {
  return apiRequest('/reservations', {
    method: 'POST',
    token,
    headers: {
      'Idempotency-Key': idempotencyKey
    },
    body: {
      itemId,
      branchId
    }
  });
}

export async function listMyReservations(
  token,
  filters = {},
  signal
) {
  const params = buildPagedParams(filters);

  return apiRequest(`/reservations/me?${params.toString()}`, {
    token,
    signal
  });
}

export async function cancelReservation(
  token,
  reservationId
) {
  return apiRequest(
    `/reservations/${encodeURIComponent(reservationId)}/cancel`,
    {
      method: 'POST',
      token
    }
  );
}

export async function listMyBorrowings(
  token,
  filters = {},
  signal
) {
  const params = buildPagedParams(filters);

  return apiRequest(`/borrowings/me?${params.toString()}`, {
    token,
    signal
  });
}
