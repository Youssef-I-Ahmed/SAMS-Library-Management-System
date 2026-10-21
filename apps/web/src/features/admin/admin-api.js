import { apiRequest } from '../../lib/api';
import { buildAdminQuery, toIsoNextDay, toIsoStartOfDay } from './admin-query';

export async function listCatalogItems(token, filters = {}, signal) {
  const p = buildAdminQuery({ search: filters.search, type: filters.type, includeInactive: filters.includeInactive, page: filters.page || 1, pageSize: filters.pageSize || 20 });
  return apiRequest(`/catalog/items?${p}`, { token, signal });
}
export async function getCatalogItem(token, id, signal) {
  return apiRequest(`/catalog/items/${encodeURIComponent(id)}?includeInactive=true`, { token, signal });
}
export async function createCatalogItem(token, body) { return apiRequest('/catalog/items', { method: 'POST', token, body }); }
export async function updateCatalogItem(token, id, body) { return apiRequest(`/catalog/items/${encodeURIComponent(id)}`, { method: 'PATCH', token, body }); }
export async function putBookDetails(token, id, body) { return apiRequest(`/catalog/items/${encodeURIComponent(id)}/book-details`, { method: 'PUT', token, body }); }
export async function putAcademicWorkDetails(token, id, body) { return apiRequest(`/catalog/items/${encodeURIComponent(id)}/academic-work-details`, { method: 'PUT', token, body }); }
export async function listCategories(token, signal) { return apiRequest('/catalog-master/categories?includeInactive=false', { token, signal }); }
export async function listDewey(token, signal) { return apiRequest('/catalog-master/dewey', { token, signal }); }
export async function listFaculties(token, signal) { return apiRequest('/master-data/faculties?includeInactive=false', { token, signal }); }
export async function listDepartments(token, signal) { return apiRequest('/master-data/departments?includeInactive=false', { token, signal }); }
export async function listBranches(token, signal) { return apiRequest('/master-data/branches?includeInactive=false', { token, signal }); }

export async function listCopies(token, filters = {}, signal) {
  const p = buildAdminQuery({ search: filters.search, branchId: filters.branchId, status: filters.status, page: filters.page || 1, pageSize: filters.pageSize || 20 });
  return apiRequest(`/inventory/copies?${p}`, { token, signal });
}
export async function createCopy(token, body) { return apiRequest('/inventory/copies', { method: 'POST', token, body }); }
export async function updateCopy(token, id, body) { return apiRequest(`/inventory/copies/${encodeURIComponent(id)}`, { method: 'PATCH', token, body }); }

export async function listStudents(token, filters = {}, signal) {
  const p = buildAdminQuery({ search: filters.search, academicStatus: filters.academicStatus, includeInactive: filters.includeInactive, page: filters.page || 1, pageSize: filters.pageSize || 20 });
  return apiRequest(`/students?${p}`, { token, signal });
}
export async function importStudents(token, students) { return apiRequest('/students/import', { method: 'POST', token, body: { students } }); }

function period(filters = {}) {
  return { branchId: filters.branchId, from: toIsoStartOfDay(filters.from), to: toIsoNextDay(filters.to) };
}
export async function getOverview(token, filters = {}, signal) {
  const p = buildAdminQuery(period(filters));
  return apiRequest(`/analytics/overview?${p}`, { token, signal });
}
export async function getTrends(token, filters = {}, signal) {
  const p = buildAdminQuery({ ...period(filters), bucket: filters.bucket || 'DAY' });
  return apiRequest(`/analytics/trends?${p}`, { token, signal });
}
export async function getBranchesAnalytics(token, filters = {}, signal) {
  const { from, to } = period(filters); const p = buildAdminQuery({ from, to });
  return apiRequest(`/analytics/branches?${p}`, { token, signal });
}
export async function getTopItems(token, filters = {}, signal) {
  const p = buildAdminQuery({ ...period(filters), metric: filters.metric || 'BORROWINGS', limit: 10 });
  return apiRequest(`/analytics/top-items?${p}`, { token, signal });
}
