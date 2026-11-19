import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { InlineAlert } from '../../components/ui/InlineAlert';
import { InventoryNotice } from '../../components/discovery/InventoryNotice';
import { StatusBadge } from '../../components/circulation/StatusBadge';
import { AdminModal } from '../../components/admin/AdminModal';
import { CirculationListState, CirculationPagination } from '../../components/circulation/CirculationListState';
import { useCirculationList } from '../../features/circulation/use-circulation-list';
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
  const read = useCirculationList(listMyReservations, { token: auth.token, status, page, pageSize: PAGE_SIZE });
  const { result, loading, error } = read;
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [cancelNotice, setCancelNotice] = useState(false);
  const headingRef = useRef(null);
  const confirmRef = useRef(null);
  const operationRef = useRef(null);
  const pendingRef = useRef(false);
  const totalPages = Math.max(result?.pagination?.totalPages || 0, 1);

  useEffect(() => {
    const operation = { token: auth.token };
    operationRef.current = operation;
    setCancelTarget(null);
    setCancelling(false);
    setCancelError(null);
    setCancelNotice(false);
    return () => { operationRef.current = null; pendingRef.current = false; };
  }, [auth.token]);

  useEffect(() => { if (cancelError) confirmRef.current?.focus(); }, [cancelError]);
  useEffect(() => { if (cancelNotice) headingRef.current?.focus(); }, [cancelNotice]);

  async function confirmCancel() {
    if (!cancelTarget || pendingRef.current || !operationRef.current) return;
    const operation = operationRef.current;
    pendingRef.current = true;
    setCancelling(true);
    setCancelError(null);

    try {
      const response = await cancelReservation(
        auth.token,
        cancelTarget.id
      );

      if (operationRef.current !== operation) return;
      // Use the actual returned status: an expired hold can be returned here too.
      read.updateRecord(response?.data);
      setCancelTarget(null);
      setCancelNotice(true);
      read.reload();
    } catch (nextError) {
      if (operationRef.current === operation) setCancelError(nextError);
    } finally {
      if (operationRef.current === operation) {
        pendingRef.current = false;
        setCancelling(false);
      }
    }
  }

  return (
    <section className="circulation-page circulation-page--student">
      <header className="circulation-page__header">
        <span>{t('reservations.page.eyebrow')}</span>
        <h1 ref={headingRef} tabIndex={-1}>{t('reservations.page.title')}</h1>
        <p>{t('reservations.page.subtitle')}</p>
      </header>

      <InventoryNotice />

      <div className="circulation-toolbar">
        <label>
          <span>{t('reservations.page.statusFilter')}</span>
          <select
            value={status}
            disabled={cancelling}
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
          {loading ? t('reservations.page.loading') : error ? t('circulationUx.unavailable')
            : `${result?.pagination?.total ?? ''} ${t('reservations.page.total')}`}
        </strong>
        <button type="button" className="circulation-secondary-button" disabled={loading || cancelling}
          onClick={read.reload}>{t('circulationUx.refresh')}</button>
      </div>

      <div role="status" aria-live="polite" className={cancelNotice ? 'circulation-notice' : 'sr-only'}>
        {cancelNotice ? t('circulationUx.cancellationRecorded') : ''}
      </div>
      <CirculationListState read={read} headingRef={headingRef} totalLabel={t('reservations.page.total')}
        loadingText={t('reservations.page.loading')} emptyTitle={t('reservations.page.emptyTitle')}
        emptyBody={t('reservations.page.emptyBody')} errorTitle={t('circulationUx.reservationsReadError')}>
        <div className="reservation-list">
          {result?.data.map((reservation) => (
            <article className="circulation-card" key={reservation.id}>
              <div className="circulation-card__heading">
                <div>
                  {reservation.item?.type && <span>{t(reservation.item.type === 'ACADEMIC_WORK'
                    ? 'catalogRefinement.academicWork' : `itemTypes.${reservation.item.type}`)}</span>}
                  <h2 dir="auto">{typeof reservation.item?.id === 'string' && reservation.item.id.trim()
                    ? <Link to={`/student/items/${encodeURIComponent(reservation.item.id)}`}>{reservation.item.title || t('circulationUx.noTitle')}</Link>
                    : reservation.item?.title || t('circulationUx.noTitle')}</h2>
                </div>

                <StatusBadge tone={getReservationTone(reservation.status)}>
                  {t(`reservations.status.${reservation.status}`)}
                </StatusBadge>
              </div>

              <dl className="circulation-card__meta">
                <div>
                  <dt>{t('reservations.fields.expiresAt')}</dt>
                  <dd><bdi>{formatDateTime(reservation.expiresAt, language)}</bdi></dd>
                </div>
                <div>
                  <dt>{t('reservations.fields.reservedAt')}</dt>
                  <dd><bdi>{formatDateTime(reservation.reservedAt, language)}</bdi></dd>
                </div>
                <div>
                  <dt>{t('reservations.fields.branch')}</dt>
                  <dd><bdi>{reservation.branch?.name || '—'}</bdi></dd>
                </div>
                {reservation.item?.callNumber && (
                  <div>
                    <dt>{t('reservations.fields.callNumber')}</dt>
                    <dd dir="auto">{reservation.item.callNumber}</dd>
                  </div>
                )}
              </dl>

              {isReservationCancellable(reservation) && (
                <div className="circulation-card__actions">
                    <button
                      type="button"
                      className="danger-link-button"
                      disabled={loading || Boolean(error) || cancelling}
                      onClick={() => { setCancelTarget(reservation); setCancelError(null); setCancelNotice(false); }}
                    >
                      {t('reservations.cancel.action')}
                    </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </CirculationListState>

      {Boolean(result?.data.length) && (
        <CirculationPagination page={page} totalPages={totalPages} disabled={loading || Boolean(error) || cancelling}
          onChange={(value) => { setPage(value); headingRef.current?.focus(); }} />
      )}

      {cancelTarget && <div className="circulation-cancel-dialog">
        <AdminModal title={t('reservations.cancel.action')} canClose={!cancelling}
          onClose={() => { setCancelTarget(null); setCancelError(null); }} actions={<>
            <button type="button" className="circulation-secondary-button" disabled={cancelling}
              onClick={() => { setCancelTarget(null); setCancelError(null); }}>{t('reservations.cancel.keep')}</button>
            <button type="button" className="circulation-cancel-button" ref={confirmRef} disabled={cancelling}
              onClick={confirmCancel}>{t(cancelling ? 'reservations.cancel.cancelling' : 'reservations.cancel.confirm')}</button>
          </>}>
          <p>{t('reservations.cancel.confirmText')}</p>
          <p><strong><bdi>{cancelTarget.item?.title || t('circulationUx.noTitle')}</bdi></strong></p>
          <div role="status" aria-live="polite">{cancelling ? t('reservations.cancel.cancelling') : ''}</div>
          {cancelError && <InlineAlert title={t('reservations.errors.title')} message={cancelError.message} requestId={cancelError.requestId} />}
        </AdminModal>
      </div>}
    </section>
  );
}
