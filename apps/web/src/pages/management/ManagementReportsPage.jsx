import { useEffect, useState } from 'react';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { downloadStaffPerformance, getSecurityAlerts, getStaffPerformance } from '../../features/admin/admin-api';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/admin-operations.css';

const COUNTS = ['checkouts', 'returns', 'visits', 'catalog', 'copies', 'students', 'reservations'];
const TONE = { high: 'danger', medium: 'warning', low: 'neutral', info: 'success' };
const isoDay = (date) => date.toISOString().slice(0, 10);
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

function useReport(loader, token, filters) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    loader(token, filters, controller.signal)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => { if (!controller.signal.aborted) setState({ loading: false, data: null, error }); });
    return () => controller.abort();
  }, [loader, token, filters]);
  return state;
}

export function ManagementReportsPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const today = new Date();
  const [tab, setTab] = useState('performance');
  const [filters, setFilters] = useState({ from: isoDay(new Date(today.getTime() - 29 * 864e5)), to: isoDay(today) });
  const [download, setDownload] = useState({ busy: false, error: null });
  const performance = useReport(getStaffPerformance, auth.token, filters);
  const security = useReport(getSecurityAlerts, auth.token, filters);
  const number = new Intl.NumberFormat(language === 'en' ? 'en' : 'ar-EG');
  const time = (value) => value ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const set = (key) => (event) => event.target.value && setFilters((current) => ({ ...current, [key]: event.target.value }));
  const preset = (days) => setFilters({ from: isoDay(new Date(Date.now() - (days - 1) * 864e5)), to: isoDay(new Date()) });

  async function exportFile(format) {
    setDownload({ busy: true, error: null });
    try { await downloadStaffPerformance(auth.token, { ...filters, format }); setDownload({ busy: false, error: null }); }
    catch (error) { setDownload({ busy: false, error }); }
  }

  const alertText = (alert) => fill(t(`reports.alerts.${alert.type}`), {
    count: number.format(alert.count), who: alert.actor?.displayName ?? '', email: alert.details?.email ?? '',
    target: alert.details?.target ?? '', label: alert.details?.label ?? '', day: alert.details?.day ?? ''
  });

  return (
    <section className="admin-page admin-operations reports-page">
      <header className="admin-page__header">
        <span>{t('staffAdmin.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('reports.title')}</h1>
        <p>{t('reports.subtitle')}</p>
      </header>

      <section className="admin-card reports-page__controls">
        <div className="admin-tabs" role="tablist">
          {['performance', 'security'].map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
              {t(`reports.tabs.${key}`)}
              {key === 'security' && security.data?.summary?.high > 0 && <span className="reports-page__dot">{number.format(security.data.summary.high)}</span>}
            </button>
          ))}
        </div>
        <div className="reports-page__range">
          <label><span>{t('auditLog.from')}</span><input type="date" value={filters.from} max={filters.to} onChange={set('from')} /></label>
          <label><span>{t('auditLog.to')}</span><input type="date" value={filters.to} min={filters.from} onChange={set('to')} /></label>
          <div className="reports-page__presets">
            {[7, 30, 90].map((days) => <button key={days} type="button" className="admin-secondary-button" onClick={() => preset(days)}>{fill(t('reports.lastDays'), { days })}</button>)}
          </div>
        </div>
      </section>

      {tab === 'performance' ? (
        <section className="admin-card">
          <div className="admin-section-heading">
            <h2>{t('reports.tabs.performance')}</h2>
            <div className="reports-page__exports">
              {['xlsx', 'csv'].map((format) => <button key={format} type="button" className="admin-secondary-button" disabled={download.busy}
                onClick={() => exportFile(format)}>{fill(t('reports.export'), { format: format === 'xlsx' ? 'Excel' : 'CSV' })}</button>)}
            </div>
          </div>
          <p className="staff-admin__hint">{t('reports.performanceHint')}</p>
          {download.error && <InlineAlert title={t('admin.workflows.readFailed')} message={download.error.message} requestId={download.error.requestId} />}
          {performance.error && <InlineAlert title={t('admin.workflows.readFailed')} message={performance.error.message} requestId={performance.error.requestId} />}
          {!performance.data ? <div className="admin-empty">{t('admin.common.loading')}</div> : (
            <div className="admin-table-wrap" role="region" tabIndex={0} aria-label={t('reports.tabs.performance')}>
              <table className="admin-table reports-page__table">
                <thead><tr>
                  <th scope="col">{t('staffAdmin.name')}</th>
                  {COUNTS.map((key) => <th key={key} scope="col">{t(`reports.columns.${key}`)}</th>)}
                  <th scope="col">{t('reports.columns.total')}</th>
                  <th scope="col">{t('reports.columns.activeDays')}</th>
                  <th scope="col">{t('reports.columns.lastActive')}</th>
                </tr></thead>
                <tbody>{performance.data.data.map((row) => (
                  <tr key={row.userId} className={row.total === 0 ? 'is-quiet' : ''}>
                    <td><span className="admin-stack"><strong dir="auto">{row.displayName}</strong>
                      <small>{row.roles.map((role) => t(`reports.roles.${role}`)).join('، ')}{row.isActive ? '' : ` · ${t('admin.common.inactive')}`}</small></span></td>
                    {COUNTS.map((key) => <td key={key}>{number.format(row[key])}</td>)}
                    <td><strong>{number.format(row.total)}</strong></td>
                    <td>{number.format(row.activeDays)}</td>
                    <td>{time(row.lastActive)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="admin-card">
          <h2>{t('reports.tabs.security')}</h2>
          <p className="staff-admin__hint">{t('reports.securityHint')}</p>
          {security.error && <InlineAlert title={t('admin.workflows.readFailed')} message={security.error.message} requestId={security.error.requestId} />}
          {!security.data ? <div className="admin-empty">{t('admin.common.loading')}</div> : <>
            <dl className="catalog-transfer__stats reports-page__summary">
              {['high', 'medium', 'low', 'info'].map((level) => <div key={level}><dt>{t(`reports.severity.${level}`)}</dt><dd>{number.format(security.data.summary[level])}</dd></div>)}
            </dl>
            {security.data.data.length === 0 ? <div className="admin-empty">{t('reports.noAlerts')}</div> : (
              <ol className="audit-log__list">
                {security.data.data.map((alert, index) => (
                  <li key={`${alert.type}-${index}`} className={`audit-log__entry reports-alert reports-alert--${alert.severity}`}>
                    <div className="audit-log__head">
                      <AdminStatusBadge tone={TONE[alert.severity]}>{t(`reports.severity.${alert.severity}`)}</AdminStatusBadge>
                      <time dateTime={alert.at}>{time(alert.at)}</time>
                    </div>
                    <p dir="auto">{alertText(alert)}</p>
                    {alert.details?.permissions?.length > 0 && <small>{t('reports.attempted')}: <bdi>{alert.details.permissions.join(', ')}</bdi></small>}
                    {alert.details?.removed?.length > 0 && <small>{t('reports.removed')}: <bdi>{alert.details.removed.join(', ')}</bdi></small>}
                    {alert.details?.added?.length > 0 && <small>{t('reports.added')}: <bdi>{alert.details.added.join(', ')}</bdi></small>}
                  </li>
                ))}
              </ol>
            )}
          </>}
        </section>
      )}
    </section>
  );
}
