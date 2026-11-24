import '../../styles/notifications.css';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { listNotifications, markNotificationsRead } from '../../features/notifications/notifications-api';
import { notificationText, timeAgo } from '../../features/notifications/notification-text';
import { useUnreadCount } from '../../features/notifications/use-unread-count';

const PAGE_SIZE = 15;

function BellIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>;
}

export function NotificationBell() {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { count, setCount, refresh } = useUnreadCount(auth.token);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ rows: [], page: 0, totalPages: 0, loading: false, error: false });
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();

  const load = useCallback(async (page) => {
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const reply = await listNotifications(auth.token, { page, pageSize: PAGE_SIZE });
      setState((s) => ({ rows: page === 1 ? reply.data : [...s.rows, ...reply.data], page, totalPages: reply.pagination.totalPages, loading: false, error: false }));
      setCount(reply.unreadCount);
    } catch {
      setState((s) => ({ ...s, loading: false, error: true }));
    }
  }, [auth.token, setCount]);

  useEffect(() => { if (open) load(1); }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markAll = async () => {
    try {
      const { data } = await markNotificationsRead(auth.token, { all: true });
      setCount(data.unreadCount);
      setState((s) => ({ ...s, rows: s.rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })) }));
    } catch { refresh(); }
  };

  const openRow = async (row) => {
    if (!row.readAt) {
      setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === row.id ? { ...r, readAt: new Date().toISOString() } : r)) }));
      setCount((c) => Math.max(0, c - 1));
      markNotificationsRead(auth.token, { ids: [row.id] }).catch(() => refresh());
    }
    if (row.link) { setOpen(false); navigate(row.link); }
  };

  const label = count ? t('notifications.openUnread').replace('{count}', count) : t('notifications.open');

  return <div className="notification-bell" ref={rootRef}>
    <button ref={triggerRef} type="button" className="notification-bell__trigger" aria-label={label} title={label}
      aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((v) => !v)}>
      <BellIcon />
      {count > 0 && <span className="notification-bell__badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </button>
    {open && <section className="notification-panel" id={panelId} role="dialog" aria-label={t('notifications.title')}>
      <header className="notification-panel__header">
        <h2>{t('notifications.title')}</h2>
        {count > 0 && <button type="button" onClick={markAll}>{t('notifications.markAll')}</button>}
      </header>
      <div className="notification-panel__list" aria-busy={state.loading}>
        {state.error && !state.rows.length ? <p className="notification-panel__state">{t('notifications.error')} <button type="button" onClick={() => load(1)}>{t('notifications.retry')}</button></p>
          : state.loading && !state.rows.length ? <p className="notification-panel__state">{t('notifications.loading')}</p>
          : !state.rows.length ? <p className="notification-panel__state">{t('notifications.empty')}</p>
          : <ul>{state.rows.map((row) => {
            const text = notificationText(row, t, language);
            return <li key={row.id}>
              <button type="button" className={`notification-item${row.readAt ? '' : ' is-unread'} notification-item--${row.type.toLowerCase().replace(/_/g, '-')}`} onClick={() => openRow(row)}>
                <span className="notification-item__dot" aria-hidden="true" />
                <span className="notification-item__text">
                  <strong dir="auto">{text.title}</strong>
                  {text.body && <span dir="auto">{text.body}</span>}
                  <small>{row.sender?.displayName ? `${t('notifications.from').replace('{name}', row.sender.displayName)} · ` : ''}{timeAgo(row.createdAt, t)}{!row.readAt && <span className="sr-only"> · {t('notifications.unread')}</span>}</small>
                </span>
              </button>
            </li>;
          })}</ul>}
        {state.page > 0 && state.page < state.totalPages && <button type="button" className="notification-panel__more" disabled={state.loading} onClick={() => load(state.page + 1)}>{state.loading ? t('notifications.loading') : t('notifications.more')}</button>}
      </div>
    </section>}
  </div>;
}
