export const DISCOVERY_DEFAULTS = {
  sort: 'TITLE_ASC',
  page: 1,
  pageSize: 20
};

export function buildDiscoverySearchParams(filters = {}) {
  const params = new URLSearchParams();

  const values = {
    q: filters.q,
    type: filters.type,
    categoryId: filters.categoryId,
    deweyClassificationId: filters.deweyClassificationId,
    language: filters.language,
    publicationYear: filters.publicationYear,
    branchId: filters.branchId,
    availableOnly: filters.availableOnly ? 'true' : undefined,
    sort: filters.sort || DISCOVERY_DEFAULTS.sort,
    page: filters.page || DISCOVERY_DEFAULTS.page,
    pageSize: filters.pageSize || DISCOVERY_DEFAULTS.pageSize
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  return params;
}

export function readDiscoveryFilters(searchParams) {
  return {
    q: searchParams.get('q') || '',
    type: searchParams.get('type') || '',
    categoryId: searchParams.get('categoryId') || '',
    deweyClassificationId:
      searchParams.get('deweyClassificationId') || '',
    language: searchParams.get('language') || '',
    publicationYear: searchParams.get('publicationYear') || '',
    branchId: searchParams.get('branchId') || '',
    availableOnly: searchParams.get('availableOnly') === 'true',
    sort: searchParams.get('sort') || DISCOVERY_DEFAULTS.sort,
    page: Number(searchParams.get('page') || DISCOVERY_DEFAULTS.page),
    pageSize: Number(
      searchParams.get('pageSize') || DISCOVERY_DEFAULTS.pageSize
    )
  };
}
