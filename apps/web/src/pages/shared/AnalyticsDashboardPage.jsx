import { useMemo, useState } from 'react';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { MetricCard } from '../../components/admin/MetricCard';
import { AdminReadState } from '../../components/admin/AdminReadState';
import { listBranches } from '../../features/admin/admin-api';
import { useStaffRead } from '../../features/staff/use-staff-circulation';
import { useAnalyticsSnapshot, reportDate, reportNumber, reportPercent } from '../../features/admin/use-analytics-snapshot';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/staff-reporting.css';

const loadBranches = (token, filters, signal) => listBranches(token, signal);
const series = [['reservationsCreated', 'admin.analytics.reservations'], ['borrowingsStarted', 'admin.analytics.borrowings'], ['returns', 'admin.analytics.returns'], ['visits', 'admin.analytics.visits']];
const isoDate = date => date.toISOString().slice(0, 10);
export function AnalyticsDashboardPage({ management = false }) {
  const auth = useAuth(); const { t, language } = useLanguage();
  const initial = useMemo(() => { const to = new Date(), from = new Date(to.getTime() - 29 * 86400000); return { from: isoDate(from), to: isoDate(to), branchId: '', bucket: 'DAY', metric: 'BORROWINGS' }; }, []);
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const branchesRead = useStaffRead(loadBranches, auth.token, {}, true, false);
  const branches = branchesRead.result?.data || [];
  const read = useAnalyticsSnapshot(auth.token, filters);
  const snapshot = read.snapshot;
  const overview = snapshot?.overview;
  const trends = snapshot?.trends.data || [], comparison = snapshot?.branches.data || [], top = snapshot?.top.data || [];
  const max = useMemo(() => Math.max(1, ...trends.flatMap(row => series.map(([key]) => row[key])).filter(value => typeof value === 'number' && Number.isFinite(value))), [trends]);
  const num = value => reportNumber(value, language);
  function submit(event) {
    event.preventDefault();
    if (JSON.stringify(draft) === JSON.stringify(filters)) read.reload();
    else setFilters({ ...draft });
  }
  const retry = () => { document.querySelector('.staff-reports h1')?.focus({ preventScroll: true }); read.reload(); };
  const differentDraft = JSON.stringify(draft) !== JSON.stringify(filters);
  const scope = overview?.scope;
  return <section className="admin-page admin-operations staff-reports analytics-report">
    <header className="admin-page__header"><span>{t(management ? 'admin.analytics.managementEyebrow' : 'admin.analytics.librarianEyebrow')}</span><h1 tabIndex={-1}>{t(management ? 'admin.analytics.managementTitle' : 'admin.analytics.title')}</h1><p>{t('admin.analytics.subtitle')}</p></header>
    <section className="admin-card report-filters" aria-label={t('admin.reporting.filters')}>
      <form onSubmit={submit} className="analytics-filters">
        <label><span>{t('admin.common.branch')}</span><select aria-label={t('admin.common.branch')} value={draft.branchId} disabled={branchesRead.loading || Boolean(branchesRead.error)} onChange={event => setDraft(value => ({ ...value, branchId: event.target.value }))}><option value="">{t('admin.common.allBranches')}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label><span>{t('admin.analytics.from')}</span><input type="date" required value={draft.from} max={draft.to || undefined} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))} /></label>
        <label><span>{t('admin.reporting.through')}</span><input type="date" required value={draft.to} min={draft.from || undefined} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))} /></label>
        <label><span>{t('admin.analytics.bucket')}</span><select aria-label={t('admin.analytics.bucket')} value={draft.bucket} onChange={event => setDraft(value => ({ ...value, bucket: event.target.value }))}>{['DAY', 'WEEK', 'MONTH'].map(bucket => <option key={bucket} value={bucket}>{t(`admin.analytics.bucketValue.${bucket}`)}</option>)}</select></label>
        <label><span>{t('admin.analytics.topItems')}</span><select aria-label={t('admin.analytics.topItems')} value={draft.metric} onChange={event => setDraft(value => ({ ...value, metric: event.target.value }))}><option value="BORROWINGS">{t('admin.analytics.borrowings')}</option><option value="RESERVATIONS">{t('admin.analytics.reservations')}</option></select></label>
        <button type="submit" className="admin-primary-button" disabled={!draft.from || !draft.to || draft.from > draft.to || read.loading && !differentDraft}>{t(differentDraft ? 'admin.reporting.apply' : 'admin.workflows.refresh')}</button>
      </form>
      <p className="report-help">{t('admin.reporting.dateHelp')}</p>
      {differentDraft && <p role="status">{t('admin.reporting.unapplied')}</p>}
      {(branchesRead.error || branchesRead.loading) && <AdminReadState read={branchesRead} compact label={t('admin.common.branch')} />}
    </section>
    <div className="report-read-state">
      <p role="status">{t(read.loading ? 'admin.common.loading' : read.error ? 'admin.workflows.unavailable' : 'admin.workflows.loaded')}</p>
      {read.error && <><InlineAlert title={t('admin.workflows.readFailed')} message={read.error.code === 'INCOMPLETE_ANALYTICS' ? t('admin.reporting.incomplete') : read.error.message} requestId={read.error.requestId} /><button type="button" className="admin-secondary-button" onClick={retry}>{t('admin.workflows.retry')}</button></>}
    </div>
    {snapshot && <>
      <section className={`report-scope${read.stale ? ' report-scope--stale' : ''}`} aria-label={t('admin.reporting.displayedScope')}>
        <strong>{t(read.stale ? 'admin.reporting.previous' : 'admin.reporting.displayedScope')}</strong>
        {read.stale && <p>{t(read.error ? 'admin.reporting.stale' : 'admin.reporting.updating')}</p>}
        <dl><div><dt>{t('admin.common.branch')}</dt><dd dir="auto">{scope?.branch?.name || (snapshot.filters.branchId ? snapshot.filters.branchId : t('admin.common.allBranches'))}</dd></div>
          <div><dt>{t('admin.reporting.window')}</dt><dd><bdi>{reportDate(scope?.from, language)}</bdi><span> — </span><bdi>{reportDate(scope?.to, language)}</bdi></dd></div>
          <div><dt>{t('admin.reporting.generated')}</dt><dd><bdi>{reportDate(scope?.generatedAt, language)}</bdi></dd></div></dl>
        <p>{t('admin.reporting.meaning')}</p><small>{t('admin.reporting.missing')}</small>
      </section>
      <section aria-labelledby="report-current"><h2 id="report-current">{t('admin.reporting.current')}</h2><div className="metric-grid report-metrics">
        <MetricCard label={t('admin.analytics.activeItems')} value={<bdi>{num(overview.catalog?.activeItems)}</bdi>} hint={<><span>{t('admin.analytics.availableCopies')}: <bdi>{num(overview.catalog?.availableCopies)}/{num(overview.catalog?.physicalCopies)}</bdi></span><span>{t('admin.analytics.availabilityRate')}: <bdi>{reportPercent(overview.catalog?.availabilityRatePercent, language)}</bdi></span></>} />
        <MetricCard label={t('admin.analytics.activeLoans')} value={<bdi>{num(overview.circulation?.activeLoans)}</bdi>} hint={<><span>{t('admin.analytics.overdueLoans')}: <bdi>{num(overview.circulation?.overdueLoans)}</bdi></span><span>{t('admin.analytics.overdueRate')}: <bdi>{reportPercent(overview.circulation?.overdueLoanRatePercent, language)}</bdi></span></>} />
        <MetricCard label={t('admin.analytics.activeHolds')} value={<bdi>{num(overview.reservations?.activeHolds)}</bdi>} />
      </div></section>
      <section aria-labelledby="report-activity"><h2 id="report-activity">{t('admin.reporting.activity')}</h2><div className="metric-grid report-metrics">
        <MetricCard label={t('admin.reporting.loansStarted')} value={<bdi>{num(overview.circulation?.borrowingsStartedInPeriod)}</bdi>} />
        <MetricCard label={t('admin.analytics.returns')} value={<bdi>{num(overview.circulation?.returnsInPeriod)}</bdi>} />
        <MetricCard label={t('admin.analytics.visitsInPeriod')} value={<bdi>{num(overview.visits?.visitsInPeriod)}</bdi>} />
      </div></section>
      <div className="analytics-grid">
        <section className="admin-card"><h2>{t('admin.analytics.trends')}</h2><p className="report-help">{t('admin.reporting.trendHelp')} · {t(`admin.analytics.bucketValue.${snapshot.filters.bucket}`)}</p>
          {!trends.length ? <p className="admin-empty">{t('admin.reporting.noTrends')}</p> : <div className="trend-list" role="region" aria-label={t('admin.analytics.trends')} tabIndex={0}>{trends.map(row => <div className="trend-row" key={row.bucketStart}>
            <strong><bdi>{reportDate(row.bucketStart, language, true)}</bdi></strong><dl className="trend-bars">{series.map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd><i aria-hidden="true"><b style={{ width: `${typeof row[key] === 'number' && Number.isFinite(row[key]) ? Math.max(0, row[key] / max * 100) : 0}%` }} /></i><bdi>{num(row[key])}</bdi></dd></div>)}</dl>
          </div>)}</div>}
        </section>
        <section className="admin-card"><h2>{t('admin.analytics.topItems')}</h2><p className="report-help">{t('admin.reporting.topScope')} <bdi>{num(snapshot.top.scope?.limit)}</bdi> · {t(snapshot.filters.metric === 'RESERVATIONS' ? 'admin.analytics.reservations' : 'admin.analytics.borrowings')}</p>
          {!top.length ? <p className="admin-empty">{t('admin.reporting.noTop')}</p> : <ol className="ranking-list">{top.map(row => <li key={row.item.id}><b><bdi>#{num(row.rank)}</bdi></b><span><strong dir="auto">{row.item.title}</strong><small><bdi>{row.item.callNumber || '—'}</bdi></small></span><em><bdi>{num(row.count)}</bdi></em></li>)}</ol>}
        </section>
      </div>
      <section className="admin-card"><h2>{t('admin.analytics.branchComparison')}</h2><p className="report-help">{t('admin.reporting.comparisonScope')}</p>
        {!comparison.length ? <p className="admin-empty">{t('admin.reporting.noBranches')}</p> : <><p id="branch-scroll" className="admin-table-hint">{t('admin.workflows.tableHint')}</p><div className="admin-table-wrap" role="region" aria-label={t('admin.analytics.branchComparison')} aria-describedby="branch-scroll" tabIndex={0}><table className="admin-table" aria-label={t('admin.analytics.branchComparison')}><thead><tr>{['admin.common.branch', 'admin.analytics.copies', 'admin.analytics.activeLoans', 'admin.analytics.overdueLoans', 'admin.analytics.borrowings', 'admin.analytics.visits'].map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead><tbody>{comparison.map(row => <tr key={row.branch.id}><th scope="row">{row.branch.name}</th><td><bdi>{num(row.catalog?.availableCopies)}/{num(row.catalog?.physicalCopies)}</bdi></td><td><bdi>{num(row.circulation?.activeLoans)}</bdi></td><td><bdi>{num(row.circulation?.overdueLoans)}</bdi></td><td><bdi>{num(row.circulation?.borrowingsStartedInPeriod)}</bdi></td><td><bdi>{num(row.visits?.visitsInPeriod)}</bdi></td></tr>)}</tbody></table></div></>}
      </section>
    </>}
    {read.loading && !snapshot && <div className="report-placeholders" aria-hidden="true">{[0, 1, 2].map(value => <div key={value} />)}</div>}
  </section>;
}
