import { useEffect, useState } from 'react';

import { InlineAlert } from '../../components/ui/InlineAlert';
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

export function VisitsPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const [branches, setBranches] = useState([]);
  const [studentNumber, setStudentNumber] = useState('');
  const [checkInBranchId, setCheckInBranchId] = useState('');
  const [source, setSource] = useState('MANUAL');

  const [query, setQuery] = useState('');
  const [branchId, setBranchId] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function loadVisits(signal) {
    setLoading(true);
    setError(null);

    try {
      const response = await listVisits(
        auth.token,
        {
          q: query.trim() || undefined,
          branchId: branchId || undefined,
          openOnly,
          page: 1,
          pageSize: 50
        },
        signal
      );

      setVisits(response.data || []);
    } catch (nextError) {
      if (nextError.name !== 'AbortError') {
        setError(nextError);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    listBranches(auth.token, controller.signal)
      .then((response) => {
        setBranches(response.data || []);
        setCheckInBranchId((current) =>
          current || response.data?.[0]?.id || ''
        );
      })
      .catch((nextError) => {
        if (nextError.name !== 'AbortError') {
          setError(nextError);
        }
      });

    return () => controller.abort();
  }, [auth.token]);

  useEffect(() => {
    const controller = new AbortController();
    loadVisits(controller.signal);
    return () => controller.abort();
  }, [auth.token, branchId, openOnly]);

  async function submitCheckIn(event) {
    event.preventDefault();

    if (!studentNumber.trim() || !checkInBranchId) return;

    setBusy('check-in');
    setError(null);

    try {
      const response = await checkInVisit(
        auth.token,
        {
          studentNumber: studentNumber.trim(),
          branchId: checkInBranchId,
          source
        }
      );

      setNotice({
        title: t('staff.visits.checkInSuccess'),
        body: `${response.data.student.user.displayName} · ${response.data.branch.name}`
      });

      setStudentNumber('');
      await loadVisits();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusy(null);
    }
  }

  async function submitCheckOut(visit) {
    setBusy(visit.id);
    setError(null);

    try {
      const response = await checkOutVisit(
        auth.token,
        visit.id
      );

      setNotice({
        title: t('staff.visits.checkOutSuccess'),
        body: `${response.data.student.user.displayName} · ${formatDuration(response.data.durationMinutes, t)}`
      });

      await loadVisits();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="staff-page">
      <header className="staff-page__header">
        <span>{t('staff.visits.eyebrow')}</span>
        <h1>{t('staff.visits.title')}</h1>
        <p>{t('staff.visits.subtitle')}</p>
      </header>

      {notice && (
        <StaffOperationNotice
          title={notice.title}
          body={notice.body}
          onDismiss={() => setNotice(null)}
        />
      )}

      {error && (
        <InlineAlert
          title={t('staff.common.operationFailed')}
          message={error.message}
          requestId={error.requestId}
        />
      )}

      <div className="staff-workflow-grid staff-workflow-grid--visits">
        <section className="staff-workflow-card">
          <span className="staff-card-eyebrow">
            {t('staff.visits.newVisit')}
          </span>
          <h2>{t('staff.visits.checkIn')}</h2>

          <form className="staff-form" onSubmit={submitCheckIn}>
            <label>
              <span>{t('staff.common.studentNumber')}</span>
              <input
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                placeholder="DEV-FRONTEND-50"
                required
              />
            </label>

            <label>
              <span>{t('staff.common.branch')}</span>
              <select
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
              disabled={busy === 'check-in'}
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
                loadVisits();
              }}
            >
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('staff.visits.searchPlaceholder')}
              />
              <button type="submit">
                {t('staff.common.search')}
              </button>
            </form>

            <select
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
        {loading ? (
          <div className="staff-empty-state">
            {t('staff.common.loading')}
          </div>
        ) : visits.length === 0 ? (
          <div className="staff-empty-state">
            <strong>{t('staff.visits.empty')}</strong>
          </div>
        ) : (
          <div className="staff-operation-list">
            {visits.map((visit) => (
              <article className="staff-operation-row" key={visit.id}>
                <div className="staff-operation-row__main">
                  <div className="staff-operation-row__title">
                    <span>{visit.student.studentId}</span>
                    <strong>{visit.student.user.displayName}</strong>
                    <small>{visit.branch.name}</small>
                  </div>

                  <div className="staff-operation-row__facts">
                    <span>
                      {t('staff.visits.checkedIn')}:{' '}
                      {formatDateTime(visit.checkedInAt, language)}
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
                      disabled={busy === visit.id}
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
