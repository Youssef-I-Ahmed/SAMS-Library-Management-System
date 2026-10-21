import { useEffect, useMemo, useState } from 'react';

import { InlineAlert } from '../../components/ui/InlineAlert';
import { StaffOperationNotice } from '../../components/staff/StaffOperationNotice';
import { StaffStatusBadge } from '../../components/staff/StaffStatusBadge';

import {
  checkoutBorrowing,
  listReservationQueue,
  searchPhysicalCopies
} from '../../features/staff/staff-api';

import {
  copyLabel,
  formatDateTime,
  reservationTone
} from '../../features/staff/staff-format';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function BorrowPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const [mode, setMode] = useState('reservation');
  const [reservations, setReservations] = useState([]);
  const [reservationQuery, setReservationQuery] = useState('');
  const [loadingReservations, setLoadingReservations] = useState(true);

  const [studentNumber, setStudentNumber] = useState('');
  const [copySearch, setCopySearch] = useState('');
  const [copies, setCopies] = useState([]);
  const [selectedCopyId, setSelectedCopyId] = useState('');
  const [searchingCopies, setSearchingCopies] = useState(false);

  const [notes, setNotes] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const selectedCopy = useMemo(
    () => copies.find((copy) => copy.id === selectedCopyId) || null,
    [copies, selectedCopyId]
  );

  async function loadActiveReservations(signal) {
    setLoadingReservations(true);

    try {
      const response = await listReservationQueue(
        auth.token,
        {
          q: reservationQuery.trim() || undefined,
          status: 'ACTIVE',
          holdState: 'VALID',
          page: 1,
          pageSize: 50
        },
        signal
      );

      setReservations(response.data || []);
    } catch (nextError) {
      if (nextError.name !== 'AbortError') {
        setError(nextError);
      }
    } finally {
      if (!signal?.aborted) {
        setLoadingReservations(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadActiveReservations(controller.signal);
    return () => controller.abort();
  }, [auth.token]);

  async function searchCopies(event) {
    event.preventDefault();

    if (!copySearch.trim()) return;

    setSearchingCopies(true);
    setError(null);

    try {
      const response = await searchPhysicalCopies(
        auth.token,
        {
          search: copySearch.trim(),
          status: 'AVAILABLE',
          page: 1,
          pageSize: 30
        }
      );

      setCopies(response.data || []);
      setSelectedCopyId(response.data?.[0]?.id || '');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSearchingCopies(false);
    }
  }

  async function checkoutReservation(reservation) {
    setBusyId(reservation.id);
    setError(null);

    try {
      const response = await checkoutBorrowing(
        auth.token,
        {
          reservationId: reservation.id,
          notes: notes.trim() || undefined
        }
      );

      setNotice({
        title: t('staff.borrow.success'),
        body: `${response.data.student.user.displayName} · ${response.data.item.title}`
      });

      setNotes('');
      await loadActiveReservations();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusyId(null);
    }
  }

  async function checkoutDirect(event) {
    event.preventDefault();

    if (!studentNumber.trim() || !selectedCopyId) return;

    setBusyId('direct');
    setError(null);

    try {
      const response = await checkoutBorrowing(
        auth.token,
        {
          studentNumber: studentNumber.trim(),
          copyId: selectedCopyId,
          notes: notes.trim() || undefined
        }
      );

      setNotice({
        title: t('staff.borrow.success'),
        body: `${response.data.student.user.displayName} · ${response.data.item.title}`
      });

      setNotes('');
      setStudentNumber('');
      setCopies([]);
      setSelectedCopyId('');
      setCopySearch('');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="staff-page">
      <header className="staff-page__header">
        <span>{t('staff.borrow.eyebrow')}</span>
        <h1>{t('staff.borrow.title')}</h1>
        <p>{t('staff.borrow.subtitle')}</p>
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

      <div className="staff-mode-tabs">
        <button
          type="button"
          className={mode === 'reservation' ? 'is-active' : ''}
          onClick={() => setMode('reservation')}
        >
          {t('staff.borrow.fromReservation')}
        </button>

        <button
          type="button"
          className={mode === 'direct' ? 'is-active' : ''}
          onClick={() => setMode('direct')}
        >
          {t('staff.borrow.direct')}
        </button>
      </div>

      {mode === 'reservation' ? (
        <div className="staff-workflow-card">
          <div className="staff-workflow-card__toolbar">
            <div>
              <span>{t('staff.borrow.validReservations')}</span>
              <strong>
                {reservations.length} {t('staff.borrow.ready')}
              </strong>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadActiveReservations();
              }}
            >
              <input
                value={reservationQuery}
                onChange={(event) => setReservationQuery(event.target.value)}
                placeholder={t('staff.borrow.searchReservation')}
              />
              <button type="submit">
                {t('staff.common.search')}
              </button>
            </form>
          </div>

          <label className="staff-notes-field">
            <span>{t('staff.borrow.notes')}</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              placeholder={t('staff.borrow.notesPlaceholder')}
            />
          </label>

          {loadingReservations ? (
            <div className="staff-empty-state">
              {t('staff.common.loading')}
            </div>
          ) : reservations.length === 0 ? (
            <div className="staff-empty-state">
              <strong>{t('staff.borrow.noReservations')}</strong>
              <span>{t('staff.borrow.noReservationsBody')}</span>
            </div>
          ) : (
            <div className="staff-operation-list">
              {reservations.map((reservation) => (
                <article className="staff-operation-row" key={reservation.id}>
                  <div className="staff-operation-row__main">
                    <div className="staff-operation-row__title">
                      <span>{reservation.student.studentId}</span>
                      <strong>{reservation.student.user.displayName}</strong>
                      <small dir="auto">{reservation.item.title}</small>
                    </div>

                    <div className="staff-operation-row__facts">
                      <span>
                        {t('staff.common.branch')}: {reservation.branch.name}
                      </span>
                      <span>
                        {t('staff.reservations.expires')}:{' '}
                        {formatDateTime(reservation.expiresAt, language)}
                      </span>
                      <span>
                        {t('staff.common.copy')}:{' '}
                        {copyLabel(reservation.allocatedCopy)}
                      </span>
                    </div>
                  </div>

                  <div className="staff-operation-row__actions">
                    <StaffStatusBadge tone={reservationTone(reservation)}>
                      {t(`staff.reservationStatus.${reservation.status}`)}
                    </StaffStatusBadge>

                    <button
                      type="button"
                      className="staff-primary-button"
                      disabled={busyId === reservation.id}
                      onClick={() => checkoutReservation(reservation)}
                    >
                      {busyId === reservation.id
                        ? t('staff.borrow.checkingOut')
                        : t('staff.borrow.checkout')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="staff-workflow-grid">
          <section className="staff-workflow-card">
            <span className="staff-card-eyebrow">
              {t('staff.borrow.step1')}
            </span>
            <h2>{t('staff.borrow.studentAndCopy')}</h2>

            <form className="staff-form" onSubmit={searchCopies}>
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
                <span>{t('staff.borrow.copySearch')}</span>
                <input
                  value={copySearch}
                  onChange={(event) => setCopySearch(event.target.value)}
                  placeholder={t('staff.borrow.copySearchPlaceholder')}
                  required
                />
              </label>

              <button
                type="submit"
                className="staff-secondary-action"
                disabled={searchingCopies}
              >
                {searchingCopies
                  ? t('staff.common.searching')
                  : t('staff.borrow.findCopy')}
              </button>
            </form>

            {copies.length > 0 && (
              <div className="staff-copy-results">
                {copies.map((copy) => (
                  <label
                    key={copy.id}
                    className={
                      selectedCopyId === copy.id
                        ? 'staff-copy-option is-selected'
                        : 'staff-copy-option'
                    }
                  >
                    <input
                      type="radio"
                      name="copy"
                      value={copy.id}
                      checked={selectedCopyId === copy.id}
                      onChange={() => setSelectedCopyId(copy.id)}
                    />

                    <span>
                      <strong dir="auto">{copy.item.title}</strong>
                      <small>
                        {copyLabel(copy)} · {copy.branch.name}
                      </small>
                      <small>
                        {t('staff.common.shelf')}: {copy.shelfLocation || '—'}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="staff-workflow-card">
            <span className="staff-card-eyebrow">
              {t('staff.borrow.step2')}
            </span>
            <h2>{t('staff.borrow.confirmDirect')}</h2>

            {selectedCopy ? (
              <form className="staff-form" onSubmit={checkoutDirect}>
                <div className="staff-selection-summary">
                  <strong dir="auto">{selectedCopy.item.title}</strong>
                  <span>{copyLabel(selectedCopy)}</span>
                  <span>{selectedCopy.branch.name}</span>
                </div>

                <label>
                  <span>{t('staff.borrow.notes')}</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={1000}
                    placeholder={t('staff.borrow.notesPlaceholder')}
                  />
                </label>

                <button
                  type="submit"
                  className="staff-primary-button"
                  disabled={busyId === 'direct'}
                >
                  {busyId === 'direct'
                    ? t('staff.borrow.checkingOut')
                    : t('staff.borrow.checkout')}
                </button>
              </form>
            ) : (
              <div className="staff-empty-state">
                {t('staff.borrow.selectCopyHint')}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
