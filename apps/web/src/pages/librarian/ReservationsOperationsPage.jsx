import { useEffect, useState } from 'react';

import { InlineAlert } from '../../components/ui/InlineAlert';
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
  const [result, setResult] = useState({
    data: [],
    pagination: {
      page: 1,
      total: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false
    }
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function load(signal) {
    setLoading(true);
    setError(null);

    try {
      const response = await listReservationQueue(
        auth.token,
        {
          q: query.trim() || undefined,
          status: status || undefined,
          holdState: holdState || undefined,
          page,
          pageSize: 20
        },
        signal
      );

      setResult(response);
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
    load(controller.signal);
    return () => controller.abort();
  }, [auth.token, status, holdState, page]);

  async function checkout(reservation) {
    setBusyId(`checkout-${reservation.id}`);
    setError(null);

    try {
      const response = await checkoutBorrowing(
        auth.token,
        { reservationId: reservation.id }
      );

      setNotice({
        title: t('staff.reservations.checkoutSuccess'),
        body: `${response.data.student.user.displayName} · ${response.data.item.title}`
      });

      await load();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(reservation) {
    setBusyId(`cancel-${reservation.id}`);
    setError(null);

    try {
      const response = await cancelReservationAsStaff(
        auth.token,
        reservation.id
      );

      setNotice({
        title: t('staff.reservations.cancelSuccess'),
        body: `${response.data.item.title} · ${response.data.status}`
      });

      await load();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="staff-page">
      <header className="staff-page__header">
        <span>{t('staff.reservations.eyebrow')}</span>
        <h1>{t('staff.reservations.title')}</h1>
        <p>{t('staff.reservations.subtitle')}</p>
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

      <section className="staff-workflow-card">
        <form
          className="staff-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            load();
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

        <div className="staff-results-count">
          {result.pagination?.total || 0} {t('staff.reservations.records')}
        </div>

        {loading ? (
          <div className="staff-empty-state">
            {t('staff.common.loading')}
          </div>
        ) : result.data.length === 0 ? (
          <div className="staff-empty-state">
            <strong>{t('staff.reservations.empty')}</strong>
          </div>
        ) : (
          <div className="staff-operation-list">
            {result.data.map((reservation) => (
              <article className="staff-operation-row" key={reservation.id}>
                <div className="staff-operation-row__main">
                  <div className="staff-operation-row__title">
                    <span>{reservation.student.studentId}</span>
                    <strong>{reservation.student.user.displayName}</strong>
                    <small dir="auto">{reservation.item.title}</small>
                  </div>

                  <div className="staff-operation-row__facts">
                    <span>{reservation.branch.name}</span>
                    <span>
                      {t('staff.reservations.reserved')}:{' '}
                      {formatDateTime(reservation.reservedAt, language)}
                    </span>
                    <span>
                      {t('staff.reservations.expires')}:{' '}
                      {formatDateTime(reservation.expiresAt, language)}
                    </span>
                    {reservation.allocatedCopy && (
                      <span>
                        {t('staff.common.copy')}:{' '}
                        {copyLabel(reservation.allocatedCopy)}
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
                        disabled={Boolean(busyId)}
                        onClick={() => checkout(reservation)}
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
                      disabled={Boolean(busyId)}
                      onClick={() => cancel(reservation)}
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

        {!loading && result.data.length > 0 && (
          <nav className="staff-pagination">
            <button
              type="button"
              disabled={!result.pagination.hasPreviousPage}
              onClick={() => setPage((value) => value - 1)}
            >
              ← {t('discovery.pagination.previous')}
            </button>

            <span>
              {t('discovery.pagination.page')} {page}
              {' '}{t('discovery.pagination.of')}{' '}
              {Math.max(result.pagination.totalPages, 1)}
            </span>

            <button
              type="button"
              disabled={!result.pagination.hasNextPage}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('discovery.pagination.next')} →
            </button>
          </nav>
        )}
      </section>
    </section>
  );
}
