export function buildPagedParams({
  status = '',
  page = 1,
  pageSize = 20
} = {}) {
  const params = new URLSearchParams();

  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  return params;
}
