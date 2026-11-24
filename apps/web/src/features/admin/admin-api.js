import { API_URL, ApiError, apiRequest } from '../../lib/api';
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
export async function listSubjects(token, signal) { return apiRequest('/catalog-master/subjects', { token, signal }); }
export async function listFaculties(token, signal) { return apiRequest('/master-data/faculties?includeInactive=false', { token, signal }); }
export async function listDepartments(token, signal) { return apiRequest('/master-data/departments?includeInactive=false', { token, signal }); }
export async function suggestSubject(token, title, signal) { return apiRequest('/ai/classify-subject', { method: 'POST', token, body: { title }, signal }); }
export async function suggestCluster(token, title, signal) { return apiRequest('/ai/book-cluster', { method: 'POST', token, body: { title }, signal }); }
export async function listBranches(token, signal) { return apiRequest('/master-data/branches?includeInactive=false', { token, signal }); }

export async function listCopies(token, filters = {}, signal) {
  const p = buildAdminQuery({ search: filters.search, branchId: filters.branchId, status: filters.status, page: filters.page || 1, pageSize: filters.pageSize || 20 });
  return apiRequest(`/inventory/copies?${p}`, { token, signal });
}
export async function createCopy(token, body) { return apiRequest('/inventory/copies', { method: 'POST', token, body }); }
export async function getCopy(token, id, signal) { return apiRequest(`/inventory/copies/${encodeURIComponent(id)}`, { token, signal }); }
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

// Catalog import/export: files go up as raw bytes and come back as downloads.
async function fileRequest(path, { token, method = 'GET', file, signal } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method, signal,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(file ? { 'Content-Type': 'application/octet-stream' } : {}) },
    body: file
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError({ status: response.status, code: payload?.error?.code,
      message: payload?.error?.message || `Request failed with status ${response.status}.`,
      requestId: response.headers.get('x-request-id') || payload?.error?.requestId, payload });
  }
  return response;
}
async function saveDownload(response, fallback) {
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || fallback;
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadCatalogFile(token, kind, params) {
  const response = await fileRequest(`/catalog-transfer/${kind}?${buildAdminQuery(params)}`, { token });
  await saveDownload(response, `sams-catalog.${params.format}`);
}
export async function runCatalogImport(token, step, file, params, signal) {
  const query = buildAdminQuery({ ...params, mapping: params.mapping ? JSON.stringify(params.mapping) : undefined });
  const response = await fileRequest(`/catalog-transfer/import/${step}?${query}`, { token, method: 'POST', file, signal });
  return response.json();
}

// Student accounts.
export async function createStudent(token, body) { return apiRequest('/students', { method: 'POST', token, body }); }
export async function updateStudent(token, studentId, body) {
  return apiRequest(`/students/${encodeURIComponent(studentId)}`, { method: 'PATCH', token, body });
}
export async function downloadStudentFile(token, kind, params) {
  const response = await fileRequest(`/students/transfer/${kind}?${buildAdminQuery(params)}`, { token });
  await saveDownload(response, `sams-students.${params.format}`);
}
export async function runStudentImport(token, step, file, params, signal) {
  const query = buildAdminQuery({ ...params, mapping: params.mapping ? JSON.stringify(params.mapping) : undefined });
  const response = await fileRequest(`/students/transfer/${step}?${query}`, { token, method: 'POST', file, signal });
  return response.json();
}
