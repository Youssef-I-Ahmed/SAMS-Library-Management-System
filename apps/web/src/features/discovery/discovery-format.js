export function getPrimaryContributor(item) {
  return item?.itemContributors?.[0]?.contributor?.fullName || null;
}

export function getItemTypeLabelKey(type) {
  if (type === 'THESIS') return 'itemTypes.THESIS';
  if (type === 'PROJECT') return 'itemTypes.PROJECT';
  return 'itemTypes.BOOK';
}

export function getAvailabilityState(availability) {
  if (availability?.available) return 'available';
  if ((availability?.totalCopies || 0) > 0) return 'unavailable';
  return 'noCopies';
}

export function getLanguageLabel(language, t) {
  const normalized = String(language || '').trim().toLowerCase();

  if (['en', 'eng', 'english'].includes(normalized)) {
    return t('languages.english');
  }

  if (['ar', 'ara', 'arabic', 'العربية'].includes(normalized)) {
    return t('languages.arabic');
  }

  return language || '';
}

export function getContributorRoleLabel(role, t) {
  const key = `contributorRoles.${role}`;

  return t(key, role);
}

export function hasRawInventoryLeak(value) {
  const text = JSON.stringify(value || {}).toLowerCase();

  return [
    '"barcode"',
    '"copycode"',
    '"shelflocation"',
    '"physicalcopyid"'
  ].some((needle) => text.includes(needle));
}
