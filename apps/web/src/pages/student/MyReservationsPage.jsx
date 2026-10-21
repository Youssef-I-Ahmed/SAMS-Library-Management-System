import { useEffect, useMemo, useState } from 'react';

import { InlineAlert } from '../../components/ui/InlineAlert';
import { StatusBadge } from '../../components/circulation/StatusBadge';
import {
  cancelReservation,
  listMyReservations
} from '../../features/circulation/circulation-api';
import {
  RESERVATION_STATUSES,
  formatDateTime,
  getReservationTone,
  isReservationCancellable
} from '../../features/circulation/circulation-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

const PAGE_SIZE = 20;

export function MyReservationsPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({
    data: [],
    pagination: {
      page: 1,
      pageSize: PAGE_SIZE,
      total: 0,
      totalPages: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const totalPages = useMemo(
    () => Math.max(result.pagination?.totalPages || 0, 1),
    [result.pagination?.totalPages]
  );

  async function loadReservations(signal) {
    setLoading(true);
    setError(null);

    try {
      const response = await listMyReservations(
        auth.token,
        {
          status,
          page,
          pageSize: PAGE_SIZE
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
    loadReservations(controller.signal);
    return () => controller.abort();
  }, [auth.token, status, page]);

  async function confirmCancel() {
    if (!cancelTarget || cancelling) return;

    setCancelling(true);
    setError(null);

    try {
      await cancelReservation(
        auth.token,
        cancelTarget.id
      );

      setCancelTarget(null);
      await loadReservations();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="circulation-page">
      <header className="circulation-page__header">
        <span>{t('reservations.page.eyebrow')}</span>
        <h1>{t('reservations.page.title')}</h1>
        <p>{t('reservations.page.subtitle')}</p>
      </header>

      <div className="circulation-toolbar">
        <label>
          <span>{t('reservations.page.statusFilter')}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {t('reservations.status.ALL')}
            </option>

            {RESERVATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`reservations.status.${value}`)}
              </option>
            ))}
          </select>
        </label>

        <strong>
          {result.pagination?.total || 0}
          {' '}
          {t('reservations.page.total')}
        </strong>
      </div>

      {error && (
        <InlineAlert
          title={t('reservations.errors.title')}
          message={error.message}
          requestId={error.requestId}
        />
      )}

      {loading ? (
        <div className="catalog-state">
          <span className="catalog-spinner" aria-hidden="true" />
          <p>{t('reservations.page.loading')}</p>
        </div>
      ) : result.data.length === 0 ? (
        <div className="catalog-state">
          <h2>{t('reservations.page.emptyTitle')}</h2>
          <p>{t('reservations.page.emptyBody')}</p>
        </div>
      ) : (
        <div className="reservation-list">
          {result.data.map((reservation) => (
            <article className="circulation-card" key={reservation.id}>
              <div className="circulation-card__heading">
                <div>
                  <span>{t(`itemTypes.${reservation.item.type}`)}</span>
                  <h2 dir="auto">{reservation.item.title}</h2>
                </div>

                <StatusBadge tone={getReservationTone(reservation.status)}>
                  {t(`reservations.status.${reservation.status}`)}
                </StatusBadge>
              </div>

              <dl className="circulation-card__meta">
                <div>
                  <dt>{t('reservations.fields.branch')}</dt>
                  <dd dir="auto">{reservation.branch.name}</dd>
                </div>
                <div>
                  <dt>{t('reservations.fields.reservedAt')}</dt>
                  <dd>{formatDateTime(reservation.reservedAt, language)}</dd>
                </div>
                <div>
                  <dt>{t('reservations.fields.expiresAt')}</dt>
                  <dd>{formatDateTime(reservation.expiresAt, language)}</dd>
                </div>
                {reservation.item.callNumber && (
                  <div>
                    <dt>{t('reservations.fields.callNumber')}</dt>
                    <dd dir="auto">{reservation.item.callNumber}</dd>
                  </div>
                )}
              </dl>

              {isReservationCancellable(reservation) && (
                <div className="circulation-card__actions">
                  {cancelTarget?.id === reservation.id ? (
                    <div className="inline-confirm">
                      <span>
                        {t('reservations.cancel.confirmText')}
                      </span>

                      <button
                        type="button"
                        className="danger-button"
                        disabled={cancelling}
                        onClick={confirmCancel}
                      >
                        {cancelling
                          ? t('reservations.cancel.cancelling')
                          : t('reservations.cancel.confirm')}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={cancelling}
                        onClick={() => setCancelTarget(null)}
                      >
                        {t('reservations.cancel.keep')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="danger-link-button"
                      onClick={() => setCancelTarget(reservation)}
                    >
                      {t('reservations.cancel.action')}
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && result.data.length > 0 && (
        <nav className="catalog-pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            ← {t('discovery.pagination.previous')}
          </button>

          <span>
            {t('discovery.pagination.page')} <strong>{page}</strong>
            {' '}{t('discovery.pagination.of')}{' '}
            <strong>{totalPages}</strong>
          </span>

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            {t('discovery.pagination.next')} →
          </button>
        </nav>
      )}
    </section>
  );
}
