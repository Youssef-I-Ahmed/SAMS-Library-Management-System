import { useState } from 'react';
import { StaffStatusBadge } from '../staff/StaffStatusBadge';
import { AdminPagination, AdminReadState } from './AdminReadState';
import { listBorrowings, listVisits } from '../../features/staff/staff-api';
import { useStaffRead } from '../../features/staff/use-staff-circulation';
import { borrowingTone, formatDateTime, formatDuration, visitTone } from '../../features/staff/staff-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/staff-reporting.css';

export function ManagementCirculationReport({ kind }) {
  const { token } = useAuth(); const { t, language } = useLanguage();
  const isBorrowings = kind === 'borrowings';
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', overdueOnly: false, openOnly: false, page: 1, pageSize: 20 });
  const read = useStaffRead(isBorrowings ? listBorrowings : listVisits, token, filters, true, false);
  const records = read.result?.data || [];
  const title = t(isBorrowings ? 'admin.management.borrowingsTitle' : 'admin.management.visitsTitle');
  const update = patch => setFilters(value => ({ ...value, ...patch, page: 1 }));
  return <section className="admin-page admin-operations staff-reports management-records">
    <header className="admin-page__header"><span>{t('admin.management.readOnly')}</span><h1 tabIndex={-1}>{title}</h1><p>{t(isBorrowings ? 'admin.management.borrowingsSubtitle' : 'admin.management.visitsSubtitle')}</p></header>
    <section className="admin-card">
      <form className="management-filter-bar" onSubmit={event => { event.preventDefault(); if (filters.page === 1 && filters.q === search.trim()) read.reload(); else update({ q: search.trim() }); }}>
        <input aria-label={t('admin.common.search')} maxLength={300} value={search} onChange={event => setSearch(event.target.value)} placeholder={t(isBorrowings ? 'staff.return.searchPlaceholder' : 'staff.visits.searchPlaceholder')} />
        {isBorrowings && <select aria-label={t('admin.common.status')} value={filters.status} onChange={event => update({ status: event.target.value })}><option value="">{t('admin.common.allStatuses')}</option>{['ACTIVE', 'RETURNED', 'LOST'].map(status => <option key={status} value={status}>{t(`staff.borrowingStatus.${status}`)}</option>)}</select>}
        <label className="admin-check"><input type="checkbox" checked={isBorrowings ? filters.overdueOnly : filters.openOnly} onChange={event => update(isBorrowings ? { overdueOnly: event.target.checked } : { openOnly: event.target.checked })} /><span>{t(isBorrowings ? 'admin.management.overdueOnly' : 'staff.visits.openOnly')}</span></label>
        <button type="submit" className="admin-secondary-button">{t('admin.common.search')}</button>
      </form>
      <p className="report-help">{t('admin.reporting.localTime')} <bdi>{Intl.DateTimeFormat().resolvedOptions().timeZone}</bdi></p>
      <AdminReadState read={read} hintId="management-table-hint" />
      {read.loading && !read.result ? <div className="admin-empty">{t('admin.common.loading')}</div> : !read.result || read.error && !records.length ? null : !records.length ? <div className="admin-empty">{t(isBorrowings ? 'admin.reporting.noBorrowings' : 'admin.reporting.noVisits')}</div> :
        <div className="admin-table-wrap" role="region" tabIndex={0} aria-label={title} aria-describedby="management-table-hint"><table className="admin-table" aria-label={title}>
          <thead><tr><th scope="col">{t('admin.students.student')}</th>{isBorrowings && <th scope="col">{t('admin.catalog.item')}</th>}<th scope="col">{t('admin.common.branch')}</th><th scope="col">{t(isBorrowings ? 'staff.return.due' : 'staff.visits.checkedIn')}</th>{!isBorrowings && <th scope="col">{t('staff.visits.duration')}</th>}<th scope="col">{t('admin.common.status')}</th></tr></thead>
          <tbody>{records.map(record => <tr key={record.id}><td><span className="admin-stack"><strong dir="auto">{record.student?.user?.displayName || '—'}</strong><small><bdi>{record.student?.studentId || '—'}</bdi></small></span></td>
            {isBorrowings && <td dir="auto">{record.item?.title || '—'}</td>}<td dir="auto">{record.branch?.name || '—'}</td><td><bdi>{formatDateTime(isBorrowings ? record.dueAt : record.checkedInAt, language)}</bdi></td>
            {!isBorrowings && <td><bdi>{typeof record.durationMinutes === 'number' && Number.isFinite(record.durationMinutes) ? formatDuration(record.durationMinutes, t) : '—'}</bdi></td>}
            <td><StaffStatusBadge tone={isBorrowings ? borrowingTone(record) : visitTone(record)}>{isBorrowings ? (record.isOverdue ? t('staff.borrowingStatus.OVERDUE') : record.status ? t(`staff.borrowingStatus.${record.status}`) : '—') : typeof record.isOpen === 'boolean' ? t(record.isOpen ? 'staff.visits.open' : 'staff.visits.closed') : '—'}</StaffStatusBadge></td>
          </tr>)}</tbody>
        </table></div>}
      <AdminPagination read={read} onPage={page => setFilters(value => ({ ...value, page }))} />
    </section>
  </section>;
}
