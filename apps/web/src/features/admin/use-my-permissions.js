import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';

/**
 * The caller's librarian permission groups. While loading (or if the check
 * fails) everything is shown; the server still refuses what is not allowed.
 */
export function useMyPermissions(token) {
  const [groups, setGroups] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    apiRequest('/auth/permissions', { token, signal: controller.signal })
      .then(({ data }) => setGroups(data.groups))
      .catch(() => {});
    return () => controller.abort();
  }, [token]);
  return { can: (group) => groups === null || groups.includes(group) };
}
