import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { InlineAlert } from '../ui/InlineAlert';
import {
  createReservation,
  listMyReservations
} from '../../features/circulation/circulation-api';
import {
  formatDateTime,
  makeReservationIdempotencyKey
} from '../../features/circulation/circulation-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

function getReservationErrorMessage(error, t) {
  const keyByCode = {
    ACTIVE_RESERVATION_EXISTS:
      'reservations.errors.activeExists',
    RESERVATION_LIMIT_REACHED:
      'reservations.errors.limitReached',
    NO_AVAILABLE_COPY:
      'reservations.errors.noAvailableCopy',
    STUDENT_NOT_ELIGIBLE:
      'reservations.errors.notEligible',
    STUDENT_ACCOUNT_INACTIVE:
      'reservations.errors.accountInactive',
    NO_CIRCULATION_POLICY:
      'reservations.errors.noPolicy',
    ITEM_NOT_AVAILABLE:
      'reservations.errors.itemUnavailable',
    BRANCH_NOT_AVAILABLE:
      'reservations.errors.branchUnavailable'
  };

  const key = keyByCode[error?.code];

  return key
    ? t(key)
    : error?.message || t('reservations.errors.default');
}

export function ReservationPanel({
  item,
  onReservationCreated,
  inventoryDescriptionId
}) {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const candidates =
    item.reservationReadiness?.candidateBranches || [];

  const [existing, setExisting] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(
    candidates[0]?.branch?.id || ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const startRef = useRef(null);
  const branchRef = useRef(null);
  const successLinkRef = useRef(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) branchRef.current?.focus();
    else if (wasConfirming.current && !existing) startRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming, existing]);

  useEffect(() => {
    if (created) successLinkRef.current?.focus();
  }, [created]);

  const selectedCandidate = useMemo(
    () =>
      candidates.find(
        (candidate) =>
          candidate.branch.id === selectedBranchId
      ) || null,
    [candidates, selectedBranchId]
  );

  useEffect(() => {
    const controller = new AbortController();

    setCheckingExisting(true);
    setCheckError(null);

    listMyReservations(
      auth.token,
      { page: 1, pageSize: 100 },
      controller.signal
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        const match = response.data?.find(
          (reservation) =>
            reservation.item?.id === item.id &&
            ['PENDING', 'ACTIVE'].includes(reservation.status)
        );

        setExisting(match || null);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted && nextError.name !== 'AbortError') {
          setCheckError(nextError);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCheckingExisting(false);
        }
      });

    return () => controller.abort();
  }, [auth.token, item.id]);

  useEffect(() => {
    if (
      selectedBranchId &&
      candidates.some(
        (candidate) =>
          candidate.branch.id === selectedBranchId
      )
    ) {
      return;
    }

    setSelectedBranchId(
      candidates[0]?.branch?.id || ''
    );
  }, [candidates, selectedBranchId]);

  async function submitReservation() {
    if (!selectedCandidate || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await createReservation(
        auth.token,
        {
          itemId: item.id,
          branchId: selectedCandidate.branch.id
        },
        makeReservationIdempotencyKey(
          item.id,
          selectedCandidate.branch.id
        )
      );

      setCreated(response.data);
      setExisting(response.data);
      setConfirming(false);
      await onReservationCreated?.(response.data);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  const unavailable = !item.reservationReadiness?.hasAvailableCopy || candidates.length === 0;
  return (
    <div className={`reservation-panel${existing ? ' reservation-panel--existing' : checkingExisting || unavailable ? ' reservation-panel--quiet' : ''}`}>
      <div className={`reservation-panel__status${checkingExisting || created ? '' : ' sr-only'}`}
        role="status" aria-live="polite" aria-atomic="true">
        {checkingExisting ? t('reservations.detail.checking') : submitting ? t('reservations.detail.reserving') : created ? t('reservations.detail.successTitle') : ''}
      </div>
      {!checkingExisting && (existing ? <>
        <span>{t('reservations.detail.currentEyebrow')}</span>
        {!created && <strong>{t('reservations.detail.alreadyReserved')}</strong>}
        <p>{t('reservations.detail.holdUntil')}{' '}<b>{formatDateTime(existing.expiresAt, language)}</b></p>
        <Link to="/student/reservations" ref={successLinkRef}>
          {t('reservations.detail.viewReservations')} <span className="reservation-link-arrow" aria-hidden="true">→</span>
        </Link>
      </> : unavailable ? <>
        <strong>{t('reservations.detail.unavailableTitle')}</strong>
        <p>{t('reservations.detail.unavailableBody')}</p>
      </> : <>
        <span>{t('reservations.detail.eyebrow')}</span>
        <strong>{t('reservations.detail.title')}</strong>
        <p>{t('reservations.detail.body')}</p>

        {!confirming ? (
          <button
            type="button"
            className="reservation-primary-button"
            ref={startRef}
            aria-describedby={inventoryDescriptionId}
            onClick={() => setConfirming(true)}
          >
            {t('reservations.detail.start')}
          </button>
        ) : (
          <div className="reservation-confirmation" aria-busy={submitting}>
            <label>
              <span>{t('reservations.detail.pickupBranch')}</span>
              <select
                ref={branchRef}
                value={selectedBranchId}
                onChange={(event) =>
                  setSelectedBranchId(event.target.value)
                }
              >
                {candidates.map((candidate) => (
                  <option
                    key={candidate.branch.id}
                    value={candidate.branch.id}
                  >
                    {candidate.branch.name}
                    {' · '}
                    {candidate.availableCopies}
                    {' '}
                    {t('reservations.detail.available')}
                  </option>
                ))}
              </select>
            </label>

            {selectedCandidate?.branch.location && (
              <small dir="auto">
                {selectedCandidate.branch.location}
              </small>
            )}

            <div className="reservation-confirmation__actions">
              <button
                type="button"
                className="reservation-primary-button"
                aria-describedby={inventoryDescriptionId}
                disabled={submitting}
                onClick={submitReservation}
              >
                {submitting
                  ? t('reservations.detail.reserving')
                  : t('reservations.detail.confirm')}
              </button>

              <button
                type="button"
                className="reservation-secondary-button"
                disabled={submitting}
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
              >
                {t('reservations.detail.keepBrowsing')}
              </button>
            </div>
          </div>
        )}
      </>)}
      {checkError && <InlineAlert title={t('reservations.detail.checkError')}
        message={checkError.message} requestId={checkError.requestId} />}
      {error && <InlineAlert title={t('reservations.errors.title')}
        message={getReservationErrorMessage(error, t)} requestId={error.requestId} />}
    </div>
  );
}
