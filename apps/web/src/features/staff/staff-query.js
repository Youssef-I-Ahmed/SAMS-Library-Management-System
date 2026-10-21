export function buildQuery(values = {}) {
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
