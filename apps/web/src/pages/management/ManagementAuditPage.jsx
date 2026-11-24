import { useEffect, useState } from 'react';
import { AdminPagination, AdminReadState } from '../../components/admin/AdminReadState';
import { getAuditFacets, listAuditLogs } from '../../features/admin/admin-api';
import { useStaffRead } from '../../features/staff/use-staff-circulation';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/admin-operations.css';

const EMPTY = { action: '', actorUserId: '', from: '', to: '', page: 1, pageSize: 25 };

function ValueList({ values }) {
  if (!values || typeof values !== 'object') return null;
  return <dl className="audit-values">{Object.entries(values).map(([key, value]) => (
    <div key={key}><dt>{key}</dt><dd dir="auto">{Array.isArray(value) ? value.join('، ') : value === null ? '—' : String(value)}</dd></div>
  ))}</dl>;
}

export function ManagementAuditPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const [filters, setFilters] = useState(EMPTY);
  const [facets, setFacets] = useState({ actions: [], actors: [] });
  const read = useStaffRead(listAuditLogs, auth.token, filters, true, false);
  const rows = read.result?.data || [];

  useEffect(() => {
    const controller = new AbortController();
    getAuditFacets(auth.token, controller.signal).then(({ data }) => setFacets(data)).catch(() => {});
    return () => controller.abort();
  }, [auth.token]);

  const actionLabel = (action) => {
    const key = `auditLog.actions.${action}`;
    const text = t(key);
    return text && text !== key ? text : action;
  };
  const time = (value) => new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value, page: 1 }));

  return (
    <section className="admin-page admin-operations audit-log">
      <header className="admin-page__header">
        <span>{t('staffAdmin.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('auditLog.title')}</h1>
        <p>{t('auditLog.subtitle')}</p>
      </header>

      <section className="admin-card">
        <div className="audit-log__filters admin-form-grid">
          <label><span>{t('auditLog.action')}</span>
            <select value={filters.action} onChange={set('action')}>
              <option value="">{t('auditLog.allActions')}</option>
              {facets.actions.map(({ action, count }) => <option key={action} value={action}>{actionLabel(action)} ({count})</option>)}
            </select></label>
          <label><span>{t('auditLog.actor')}</span>
            <select value={filters.actorUserId} onChange={set('actorUserId')}>
              <option value="">{t('auditLog.everyone')}</option>
              {facets.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName} ({actor.count})</option>)}
            </select></label>
          <label><span>{t('auditLog.from')}</span><input type="date" value={filters.from} onChange={set('from')} /></label>
          <label><span>{t('auditLog.to')}</span><input type="date" value={filters.to} onChange={set('to')} /></label>
          {(filters.action || filters.actorUserId || filters.from || filters.to) &&
            <button type="button" className="admin-secondary-button" onClick={() => setFilters(EMPTY)}>{t('auditLog.clear')}</button>}
        </div>

        <AdminReadState read={read} compact />

        {!read.result ? null : rows.length === 0 ? <div className="admin-empty">{t('auditLog.empty')}</div> : (
          <ol className="audit-log__list">
            {rows.map((row) => (
              <li key={row.id} className="audit-log__entry">
                <div className="audit-log__head">
                  <strong>{actionLabel(row.action)}</strong>
                  <time dateTime={row.createdAt}>{time(row.createdAt)}</time>
                </div>
                <p>
                  <span dir="auto">{row.actor ? row.actor.displayName : t('auditLog.system')}</span>
                  {row.actor && <small> · <bdi>{row.actor.universityEmail}</bdi></small>}
                </p>
                <p className="audit-log__target">
                  {t(`auditLog.entities.${row.entityType}`) !== `auditLog.entities.${row.entityType}` ? t(`auditLog.entities.${row.entityType}`) : row.entityType}
                  {row.metadata?.label && <> · <span dir="auto">{row.metadata.label}</span></>}
                  {row.newValues?.displayName && !row.metadata?.label && <> · <span dir="auto">{row.newValues.displayName}</span></>}
                </p>
                {(row.oldValues || row.newValues || row.metadata?.fields?.length > 0) && (
                  <details>
                    <summary>{t('auditLog.details')}</summary>
                    {row.metadata?.fields?.length > 0 && <p>{t('auditLog.fields')}: <bdi>{row.metadata.fields.join(', ')}</bdi></p>}
                    {row.oldValues && <><h4>{t('auditLog.before')}</h4><ValueList values={row.oldValues} /></>}
                    {row.newValues && <><h4>{t('auditLog.after')}</h4><ValueList values={row.newValues} /></>}
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
        <AdminPagination read={read} onPage={(page) => setFilters((current) => ({ ...current, page }))} />
      </section>
    </section>
  );
}
