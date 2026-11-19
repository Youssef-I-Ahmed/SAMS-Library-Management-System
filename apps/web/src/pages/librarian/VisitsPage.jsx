import { useEffect, useState } from 'react';

import { StaffReadState, StaffMutationFeedback } from '../../components/staff/StaffReadState';
import { useStaffRead, useStaffMutation } from '../../features/staff/use-staff-circulation';
import '../../styles/staff-circulation.css';
import { StaffOperationNotice } from '../../components/staff/StaffOperationNotice';
import { StaffStatusBadge } from '../../components/staff/StaffStatusBadge';

import {
  checkInVisit,
  checkOutVisit,
  listBranches,
  listVisits
} from '../../features/staff/staff-api';

import {
  VISIT_SOURCES,
  formatDateTime,
  formatDuration,
  visitTone
} from '../../features/staff/staff-format';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

const loadBranches = (token, filters, signal) => listBranches(token, signal);

export function VisitsPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const branchesRead = useStaffRead(loadBranches, auth.token, {}, true, false);
  const branches = branchesRead.result?.data || [];
  const [studentNumber, setStudentNumber] = useState('');
  const [checkInBranchId, setCheckInBranchId] = useState('');
  const [source, setSource] = useState('MANUAL');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [branchId, setBranchId] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const read = useStaffRead(listVisits, auth.token, { q: submittedQuery, branchId, openOnly, page: 1, pageSize: 50 });
  const visits = read.result?.data || [];
  const { loading } = read;
  const action = useStaffMutation(auth.token);
  const busy = action.pending;
  const blocked = Boolean(busy) || action.uncertain || read.loading || Boolean(read.error);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (branchesRead.result) setCheckInBranchId((current) => current || branchesRead.result.data[0]?.id || '');
  }, [branchesRead.result]);
  function confirmVisit(record) {
    setNotice({ title: t('staff.ux.confirmed'), body: `${record.student?.user?.displayName || '—'} · ${record.branch?.name || '—'} · ${t(record.isOpen ? 'staff.visits.open' : 'staff.visits.closed')} · ${formatDuration(record.durationMinutes, t)}` });
  }
  function submitCheckIn(event) {
    event.preventDefault();
    if (!studentNumber.trim() || !checkInBranchId || blocked || branchesRead.loading || branchesRead.error) return;
    setNotice(null);
    action.run('check-in', () => checkInVisit(auth.token, { studentNumber: studentNumber.trim(), branchId: checkInBranchId, source }), (record) => {
      confirmVisit(record); setStudentNumber('');
    });
  }
  function submitCheckOut(visit) {
    if (blocked) return;
    setNotice(null);
    action.run(visit.id, () => checkOutVisit(auth.token, visit.id), confirmVisit);
  }

  return (
    <section className="staff-page staff-circulation">
      <header className="staff-page__header">
        <span>{t('staff.visits.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('staff.visits.title')}</h1>
        <p>{t('staff.visits.subtitle')}</p>
      </header>

      {notice && (
        <StaffOperationNotice
          title={notice.title}
          body={notice.body}
          onDismiss={() => setNotice(null)}
        />
      )}

      <StaffMutationFeedback action={action} canVerify={!read.loading && !read.error && Boolean(read.result)} />

      <div className="staff-workflow-grid staff-workflow-grid--visits">
        <section className="staff-workflow-card">
          <span className="staff-card-eyebrow">
            {t('staff.visits.newVisit')}
          </span>
          <h2>{t('staff.visits.checkIn')}</h2>

          {(branchesRead.loading || branchesRead.error) && <StaffReadState read={branchesRead} />}
          <form className="staff-form" onSubmit={submitCheckIn}>
            <label>
              <span>{t('staff.common.studentNumber')}</span>
              <input
                disabled={Boolean(busy)}
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                dir="ltr"
                autoComplete="off"
                required
              />
            </label>

            <label>
              <span>{t('staff.common.branch')}</span>
              <select
                disabled={Boolean(busy) || branchesRead.loading || Boolean(branchesRead.error)}
                value={checkInBranchId}
                onChange={(event) => setCheckInBranchId(event.target.value)}
                required
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{t('staff.visits.source')}</span>
              <select
                disabled={Boolean(busy)}
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                {VISIT_SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {t(`staff.visitSource.${value}`)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="staff-primary-button"
              disabled={blocked || branchesRead.loading || Boolean(branchesRead.error) || !checkInBranchId}
            >
              {busy === 'check-in'
                ? t('staff.visits.checkingIn')
                : t('staff.visits.checkIn')}
            </button>
          </form>
        </section>

        <section className="staff-workflow-card">
          <span className="staff-card-eyebrow">
            {t('staff.visits.queue')}
          </span>
          <h2>{t('staff.visits.currentVisitors')}</h2>

          <div className="staff-visit-filters">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (submittedQuery === query.trim()) read.reload();
                else setSubmittedQuery(query.trim());
              }}
            >
              <input
                aria-label={t('staff.visits.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('staff.visits.searchPlaceholder')}
              />
              <button type="submit">
                {t('staff.common.search')}
              </button>
            </form>

            <select
              aria-label={t('staff.common.branch')}
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">{t('staff.common.allBranches')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <label className="staff-checkbox">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(event) => setOpenOnly(event.target.checked)}
              />
              <span>{t('staff.visits.openOnly')}</span>
            </label>
          </div>
        </section>
      </div>

      <section className="staff-workflow-card">
        <StaffReadState read={read} limit={50} />
        {loading && !read.result ? (
          <div className="staff-empty-state">
            {t('staff.common.loading')}
          </div>
        ) : !read.result || read.error && visits.length === 0 ? null : visits.length === 0 ? (
          <div className="staff-empty-state">
            <strong>{t('staff.visits.empty')}</strong>
          </div>
        ) : (
          <div className="staff-operation-list">
            {visits.map((visit) => (
              <article className="staff-operation-row" key={visit.id}>
                <div className="staff-operation-row__main">
                  <div className="staff-operation-row__title">
                    <span><bdi>{visit.student.studentId}</bdi></span>
                    <strong>{visit.student.user.displayName}</strong>
                    <small>{visit.branch.name}</small>
                  </div>

                  <div className="staff-operation-row__facts">
                    <span>
                      {t('staff.visits.checkedIn')}:{' '}
                      <bdi>{formatDateTime(visit.checkedInAt, language)}</bdi>
                    </span>
                    <span>
                      {t('staff.visits.duration')}:{' '}
                      {formatDuration(visit.durationMinutes, t)}
                    </span>
                    <span>
                      {t('staff.visits.source')}:{' '}
                      {t(`staff.visitSource.${visit.source}`)}
                    </span>
                  </div>
                </div>

                <div className="staff-operation-row__actions">
                  <StaffStatusBadge tone={visitTone(visit)}>
                    {visit.isOpen
                      ? t('staff.visits.open')
                      : t('staff.visits.closed')}
                  </StaffStatusBadge>

                  {visit.isOpen && (
                    <button
                      type="button"
                      className="staff-primary-button"
                      disabled={blocked}
                      onClick={() => submitCheckOut(visit)}
                    >
                      {busy === visit.id
                        ? t('staff.visits.checkingOut')
                        : t('staff.visits.checkOut')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
