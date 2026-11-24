import { useCallback, useEffect, useState } from 'react';
import { getUnreadCount } from './notifications-api';

const POLL_MS = 30000;

/** Unread count, checked every 30 s while the tab is visible and when it regains focus. */
export function useUnreadCount(token) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    if (!token) return;
    getUnreadCount(token).then(({ data }) => setCount(data.unreadCount)).catch(() => {});
  }, [token]);
  useEffect(() => {
    if (!token) return undefined;
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisible); };
  }, [token, refresh]);
  return { count, setCount, refresh };
}
