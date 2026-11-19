import { useState } from 'react';

import { AdminModal } from '../../components/admin/AdminModal';
import { StaffReadState, StaffMutationFeedback } from '../../components/staff/StaffReadState';
import { useStaffRead, useStaffMutation } from '../../features/staff/use-staff-circulation';
import '../../styles/staff-circulation.css';
import { StaffOperationNotice } from '../../components/staff/StaffOperationNotice';
import { StaffStatusBadge } from '../../components/staff/StaffStatusBadge';

import {
  cancelReservationAsStaff,
  checkoutBorrowing,
  listReservationQueue
} from '../../features/staff/staff-api';

import {
  RESERVATION_STATUSES,
  copyLabel,
  formatDateTime,
  reservationTone
} from '../../features/staff/staff-format';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function ReservationsOperationsPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [holdState, setHoldState] = useState('');
  const [page, setPage] = useState(1);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const read = useStaffRead(listReservationQueue, auth.token, { q: submittedQuery, status, holdState, page, pageSize: 20 });
  const result = read.result || { data: [] };
  const { loading } = read;
  const action = useStaffMutation(auth.token);
  const busyId = action.pending;
  const blocked = Boolean(busyId) || action.uncertain || read.loading || Boolean(read.error);
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState(null);

  const targetCurrent = target && result.data.some((record) => record.id === target.reservation.id && (target.kind === 'cancel' ? ['PENDING', 'ACTIVE'].includes(record.status) : record.status === 'ACTIVE' && !record.isHoldOverdue));
  function submitAction() {
    if (!target || !targetCurrent || blocked) return;
    const { reservation, kind } = target;
    setNotice(null);
    action.run(`${kind}-${reservation.id}`, () => kind === 'cancel'
      ? cancelReservationAsStaff(auth.token, reservation.id)
      : checkoutBorrowing(auth.token, { reservationId: reservation.id }), (record) => {
      setNotice({ title: t('staff.ux.confirmed'), body: `${record.item?.title || '—'} · ${t(`staff.${kind === 'cancel' ? 'reservationStatus' : 'borrowingStatus'}.${record.status}`)}` });
      setTarget(null);
    });
  }

  return (
    <section className="staff-page staff-circulation">
      <header className="staff-page__header">
        <span>{t('staff.reservations.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('staff.reservations.title')}</h1>
        <p>{t('staff.reservations.subtitle')}</p>
      </header>

      {notice && (
        <StaffOperationNotice
          title={notice.title}
          body={notice.body}
          onDismiss={() => setNotice(null)}
        />
      )}

      {!target && <StaffMutationFeedback action={action} canVerify={!read.loading && !read.error && Boolean(read.result)} />}

      <section className="staff-workflow-card">
        <form
          className="staff-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            if (page === 1 && submittedQuery === query.trim()) read.reload();
            else setSubmittedQuery(query.trim());
          }}
        >
          <label className="staff-filter-bar__search">
            <span>{t('staff.common.search')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('staff.reservations.searchPlaceholder')}
            />
          </label>

          <label>
            <span>{t('staff.common.status')}</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('staff.common.all')}</option>
              {RESERVATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`staff.reservationStatus.${value}`)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('staff.reservations.holdState')}</span>
            <select
              value={holdState}
              onChange={(event) => {
                setHoldState(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('staff.common.all')}</option>
              <option value="VALID">{t('staff.reservations.valid')}</option>
              <option value="OVERDUE">{t('staff.reservations.overdue')}</option>
            </select>
          </label>

          <button type="submit">
            {t('staff.common.search')}
          </button>
        </form>

        {!target && <StaffReadState read={read} />}
        {read.result && !read.error && !loading && Number.isFinite(result.pagination?.total) && <div className="staff-results-count">
          {result.pagination.total} {t('staff.reservations.records')}
        </div>}

        {loading && !read.result ? (
          <div className="staff-empty-state">
            {t('staff.common.loading')}
          </div>
        ) : !read.result || read.error && result.data.length === 0 ? null : result.data.length === 0 ? (
          <div className="staff-empty-state">
            <strong>{t('staff.reservations.empty')}</strong>
          </div>
        ) : (
          <div className="staff-operation-list">
            {result.data.map((reservation) => (
              <article className="staff-operation-row" key={reservation.id}>
                <div className="staff-operation-row__main">
                  <div className="staff-operation-row__title">
                    <span><bdi>{reservation.student.studentId}</bdi></span>
                    <strong>{reservation.student.user.displayName}</strong>
                    <small dir="auto">{reservation.item.title}</small>
                  </div>

                  <div className="staff-operation-row__facts">
                    <span>{reservation.branch.name}</span>
                    <span>
                      {t('staff.reservations.reserved')}:{' '}
                      <bdi>{formatDateTime(reservation.reservedAt, language)}</bdi>
                    </span>
                    <span>
                      {t('staff.reservations.expires')}:{' '}
                      <bdi>{formatDateTime(reservation.expiresAt, language)}</bdi>
                    </span>
                    {reservation.allocatedCopy && (
                      <span>
                        {t('staff.common.copy')}:{' '}
                        <bdi>{copyLabel(reservation.allocatedCopy)}</bdi>
                      </span>
                    )}
                  </div>
                </div>

                <div className="staff-operation-row__actions">
                  <StaffStatusBadge tone={reservationTone(reservation)}>
                    {reservation.isHoldOverdue
                      ? t('staff.reservations.overdue')
                      : t(`staff.reservationStatus.${reservation.status}`)}
                  </StaffStatusBadge>

                  {reservation.status === 'ACTIVE' &&
                    !reservation.isHoldOverdue && (
                      <button
                        type="button"
                        className="staff-primary-button"
                        disabled={blocked}
                        onClick={() => setTarget({ reservation, kind: 'checkout' })}
                      >
                        {busyId === `checkout-${reservation.id}`
                          ? t('staff.borrow.checkingOut')
                          : t('staff.reservations.checkout')}
                      </button>
                    )}

                  {['PENDING', 'ACTIVE'].includes(reservation.status) && (
                    <button
                      type="button"
                      className="staff-danger-link"
                      disabled={blocked}
                      onClick={() => setTarget({ reservation, kind: 'cancel' })}
                    >
                      {busyId === `cancel-${reservation.id}`
                        ? t('staff.reservations.cancelling')
                        : t('staff.reservations.cancel')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && !read.error && result.pagination && (
          <nav className="staff-pagination" aria-label={t('staff.ux.pagination')}>
            <button
              type="button"
              disabled={blocked || !result.pagination.hasPreviousPage}
              onClick={() => setPage((value) => value - 1)}
            >
              {t('discovery.pagination.previous')}
            </button>

            <span>
              {t('discovery.pagination.page')} {page}
              {' '}{t('discovery.pagination.of')}{' '}
              {Math.max(result.pagination.totalPages, 1)}
            </span>

            <button
              type="button"
              disabled={blocked || !result.pagination.hasNextPage}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('discovery.pagination.next')}
            </button>
          </nav>
        )}
      </section>
      {target && <AdminModal title={t(target.kind === 'cancel' ? 'staff.ux.confirmCancel' : 'staff.ux.confirmCheckout')} canClose={!busyId} onClose={() => setTarget(null)}>
        <StaffMutationFeedback action={action} canVerify={!read.loading && !read.error && Boolean(read.result)} />
        <StaffReadState read={read} />
        <p dir="auto">{target.reservation.student.user.displayName} · {target.reservation.item.title}</p>
        <p><bdi>{target.reservation.student.studentId}</bdi> · <bdi>{copyLabel(target.reservation.allocatedCopy)}</bdi></p>
        <p>{t(target.kind === 'cancel' ? 'staff.ux.cancelHelp' : 'staff.ux.checkoutHelp')}</p>
        <div className="staff-modal__actions">
          <button type="button" className={target.kind === 'cancel' ? 'staff-danger-link' : 'staff-primary-button'} disabled={blocked || !targetCurrent} onClick={submitAction}>
            {busyId ? t('staff.ux.pending') : t(target.kind === 'cancel' ? 'staff.ux.confirmCancel' : 'staff.ux.confirmCheckout')}
          </button>
          <button type="button" className="staff-secondary-action" disabled={Boolean(busyId)} onClick={() => setTarget(null)}>{t('staff.common.cancel')}</button>
        </div>
      </AdminModal>}
    </section>
  );
}
