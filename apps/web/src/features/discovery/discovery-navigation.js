const CATALOG = '/student/catalog';

// Navigation state is untrusted. Only this exact local route may be restored.
export function readCatalogReturn(state) {
  const context = state?.catalogReturn;
  if (typeof context?.to !== 'string' || !context.to.startsWith('/')
      || /[\\\u0000-\u001f\u007f]/.test(context.to)) return { to: CATALOG, view: 'grid' };
  try {
    const url = new URL(context.to, 'https://sams.invalid');
    if (url.origin !== 'https://sams.invalid' || url.pathname !== CATALOG) {
      return { to: CATALOG, view: 'grid' };
    }
    return { to: url.pathname + url.search, view: context.view === 'list' ? 'list' : 'grid' };
  } catch {
    return { to: CATALOG, view: 'grid' };
  }
}
