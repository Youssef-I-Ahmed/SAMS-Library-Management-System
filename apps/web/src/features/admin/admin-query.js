export function buildAdminQuery(values = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === false
    ) {
      continue;
    }

    params.set(
      key,
      value === true ? 'true' : String(value)
    );
  }

  return params;
}

export function toIsoStartOfDay(value) {
  if (!value) return undefined;

  // Date-only analytics filters represent calendar boundaries, not the
  // browser's local midnight. Parse them explicitly as UTC so converting
  // to ISO cannot shift the requested date in UTC+/- time zones.
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function toIsoNextDay(value) {
  if (!value) return undefined;

  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString();
}
