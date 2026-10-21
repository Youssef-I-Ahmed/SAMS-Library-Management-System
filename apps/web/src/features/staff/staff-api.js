import { apiRequest } from '../../lib/api';
import { buildQuery } from './staff-query';

export async function listBranches(token, signal) {
  return apiRequest('/master-data/branches', {
    token,
    signal
  });
}

export async function listReservationQueue(
  token,
  filters = {},
  signal
) {
  const params = buildQuery({
    q: filters.q,
    status: filters.status,
    branchId: filters.branchId,
    studentNumber: filters.studentNumber,
    holdState: filters.holdState,
    page: filters.page || 1,
    pageSize: filters.pageSize || 20
  });

  return apiRequest(`/reservations?${params.toString()}`, {
    token,
    signal
  });
}

export async function cancelReservationAsStaff(
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

export async function checkoutBorrowing(
  token,
  body
) {
  return apiRequest('/borrowings/checkout', {
    method: 'POST',
    token,
    body
  });
}

export async function listBorrowings(
  token,
  filters = {},
  signal
) {
  const params = buildQuery({
    q: filters.q,
    status: filters.status,
    branchId: filters.branchId,
    studentNumber: filters.studentNumber,
    overdueOnly: filters.overdueOnly,
    page: filters.page || 1,
    pageSize: filters.pageSize || 20
  });

  return apiRequest(`/borrowings?${params.toString()}`, {
    token,
    signal
  });
}

export async function returnBorrowing(
  token,
  borrowingId,
  body
) {
  return apiRequest(
    `/borrowings/${encodeURIComponent(borrowingId)}/return`,
    {
      method: 'POST',
      token,
      body
    }
  );
}

export async function searchPhysicalCopies(
  token,
  filters = {},
  signal
) {
  const params = buildQuery({
    search: filters.search,
    branchId: filters.branchId,
    status: filters.status,
    page: filters.page || 1,
    pageSize: filters.pageSize || 20
  });

  return apiRequest(`/inventory/copies?${params.toString()}`, {
    token,
    signal
  });
}

export async function listVisits(
  token,
  filters = {},
  signal
) {
  const params = buildQuery({
    q: filters.q,
    branchId: filters.branchId,
    studentNumber: filters.studentNumber,
    source: filters.source,
    openOnly: filters.openOnly,
    from: filters.from,
    to: filters.to,
    page: filters.page || 1,
    pageSize: filters.pageSize || 20
  });

  return apiRequest(`/visits?${params.toString()}`, {
    token,
    signal
  });
}

export async function checkInVisit(
  token,
  body
) {
  return apiRequest('/visits/check-in', {
    method: 'POST',
    token,
    body
  });
}

export async function checkOutVisit(
  token,
  visitId
) {
  return apiRequest(
    `/visits/${encodeURIComponent(visitId)}/check-out`,
    {
      method: 'POST',
      token
    }
  );
}
