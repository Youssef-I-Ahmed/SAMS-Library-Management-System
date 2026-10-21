import { apiRequest } from '../../lib/api';
import { buildDiscoverySearchParams } from './discovery-query';

export async function getDiscoveryFacets(token, signal) {
  return apiRequest('/discovery/facets', { token, signal });
}

export async function searchDiscoveryItems(token, filters, signal) {
  const params = buildDiscoverySearchParams(filters);

  return apiRequest(`/discovery/items?${params.toString()}`, {
    token,
    signal
  });
}

export async function getDiscoveryItem(token, itemId, signal) {
  return apiRequest(`/discovery/items/${encodeURIComponent(itemId)}`, {
    token,
    signal
  });
}
