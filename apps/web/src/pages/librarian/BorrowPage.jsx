import { useMemo, useState } from 'react';

import { AdminModal } from '../../components/admin/AdminModal';
import { StaffReadState, StaffMutationFeedback } from '../../components/staff/StaffReadState';
import { useStaffRead, useStaffMutation } from '../../features/staff/use-staff-circulation';
import '../../styles/staff-circulation.css';
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
  const [reservationQuery, setReservationQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const read = useStaffRead(listReservationQueue, auth.token, { q: submittedQuery, status: 'ACTIVE', holdState: 'VALID', page: 1, pageSize: 50 });
  const reservations = read.result?.data || [];
  const loadingReservations = read.loading;
  const [studentNumber, setStudentNumber] = useState('');
  const [copySearch, setCopySearch] = useState('');
  const [copyQuery, setCopyQuery] = useState(null);
  const copiesRead = useStaffRead(searchPhysicalCopies, auth.token, { search: copyQuery, status: 'AVAILABLE', page: 1, pageSize: 30 }, copyQuery !== null);
  const copies = copiesRead.result?.data || [];
  const searchingCopies = copiesRead.loading;
  const [selectedCopyId, setSelectedCopyId] = useState('');
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState(null);
  const [target, setTarget] = useState(null);
  const action = useStaffMutation(auth.token);
  const busyId = action.pending;
  const activeRead = mode === 'reservation' ? read : copiesRead;
  const blocked = Boolean(busyId) || action.uncertain || activeRead.loading || Boolean(activeRead.error) || !activeRead.result;
  const selectedCopy = useMemo(() => copies.find((copy) => copy.id === selectedCopyId) || null, [copies, selectedCopyId]);

  function searchCopies(event) {
    event.preventDefault();
    if (!copySearch.trim() || busyId) return;
    setSelectedCopyId('');
    if (copyQuery === copySearch.trim()) copiesRead.reload();
    else setCopyQuery(copySearch.trim());
  }
  function checkoutDirect(event) {
    event.preventDefault();
    if (!studentNumber.trim() || !selectedCopy || blocked) return;
    setTarget({ id: selectedCopy.id, student: studentNumber.trim(), title: selectedCopy.item.title,
      copy: copyLabel(selectedCopy), branch: selectedCopy.branch.name,
      payload: { studentNumber: studentNumber.trim(), copyId: selectedCopy.id } });
  }
  function checkoutReservation(reservation) {
    if (blocked) return;
    setTarget({ id: reservation.id, student: reservation.student.studentId, title: reservation.item.title,
      copy: copyLabel(reservation.allocatedCopy), branch: reservation.branch.name,
      payload: { reservationId: reservation.id } });
  }
  function submitCheckout() {
    if (!target || blocked || !activeRead.result?.data.some((record) => record.id === target.id)) return;
    setNotice(null);
    action.run(target.id, () => checkoutBorrowing(auth.token, { ...target.payload, notes: notes.trim() || undefined }), (record) => {
      setNotice({ title: t('staff.ux.confirmed'), body: `${record.student?.user?.displayName || '—'} · ${record.item?.title || '—'} · ${t(`staff.borrowingStatus.${record.status}`)}` });
      setTarget(null); setNotes('');
      if (!target.payload.reservationId) { setStudentNumber(''); setSelectedCopyId(''); setCopySearch(''); setCopyQuery(null); }
    });
  }

  return (
    <section className="staff-page staff-circulation">
      <header className="staff-page__header">
        <span>{t('staff.borrow.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('staff.borrow.title')}</h1>
        <p>{t('staff.borrow.subtitle')}</p>
      </header>

      {notice && (
        <StaffOperationNotice
          title={notice.title}
          body={notice.body}
          onDismiss={() => setNotice(null)}
        />
      )}

      {!target && <StaffMutationFeedback action={action} canVerify={!activeRead.loading && !activeRead.error && Boolean(activeRead.result)} />}

      <div className="staff-mode-tabs">
        <button
          type="button"
          disabled={Boolean(busyId)}
          aria-pressed={mode === 'reservation'}
          className={mode === 'reservation' ? 'is-active' : ''}
          onClick={() => setMode('reservation')}
        >
          {t('staff.borrow.fromReservation')}
        </button>

        <button
          type="button"
          disabled={Boolean(busyId)}
          aria-pressed={mode === 'direct'}
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
                {read.loading ? t('staff.ux.loading') : !read.error && read.result ? `${reservations.length} ${t('staff.borrow.ready')}` : t('staff.ux.unavailable')}
              </strong>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (submittedQuery === reservationQuery.trim()) read.reload();
                else setSubmittedQuery(reservationQuery.trim());
              }}
            >
              <input
                aria-label={t('staff.borrow.searchReservation')}
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
              disabled={Boolean(busyId)}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              placeholder={t('staff.borrow.notesPlaceholder')}
            />
          </label>

          {!target && <StaffReadState read={read} limit={50} />}
          {loadingReservations && !read.result ? (
            <div className="staff-empty-state">
              {t('staff.common.loading')}
            </div>
          ) : !read.result || read.error && reservations.length === 0 ? null : reservations.length === 0 ? (
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
                      <span><bdi>{reservation.student.studentId}</bdi></span>
                      <strong>{reservation.student.user.displayName}</strong>
                      <small dir="auto">{reservation.item.title}</small>
                    </div>

                    <div className="staff-operation-row__facts">
                      <span>
                        {t('staff.common.branch')}: {reservation.branch.name}
                      </span>
                      <span>
                        {t('staff.reservations.expires')}:{' '}
                        <bdi>{formatDateTime(reservation.expiresAt, language)}</bdi>
                      </span>
                      <span>
                        {t('staff.common.copy')}:{' '}
                        <bdi>{copyLabel(reservation.allocatedCopy)}</bdi>
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
                      disabled={blocked}
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
                  disabled={Boolean(busyId)}
                  value={studentNumber}
                  onChange={(event) => setStudentNumber(event.target.value)}
                  autoComplete="off"
                  dir="ltr"
                  required
                />
              </label>

              <label>
                <span>{t('staff.borrow.copySearch')}</span>
                <input
                  disabled={Boolean(busyId)}
                  value={copySearch}
                  onChange={(event) => setCopySearch(event.target.value)}
                  placeholder={t('staff.borrow.copySearchPlaceholder')}
                  required
                />
              </label>

              <button
                type="submit"
                className="staff-secondary-action"
                disabled={searchingCopies || Boolean(busyId)}
              >
                {searchingCopies
                  ? t('staff.common.searching')
                  : t('staff.borrow.findCopy')}
              </button>
            </form>

            {copyQuery !== null && !target && <StaffReadState read={copiesRead} limit={30} />}
            {copiesRead.result && !copiesRead.error && !copies.length && <p>{t('staff.ux.noCopies')}</p>}
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
                      disabled={blocked}
                      type="radio"
                      name="copy"
                      value={copy.id}
                      checked={selectedCopyId === copy.id}
                      onChange={() => setSelectedCopyId(copy.id)}
                    />

                    <span>
                      <strong dir="auto">{copy.item.title}</strong>
                      <small>
                        <bdi>{copyLabel(copy)}</bdi> · {copy.branch.name}
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
                  <span>{t('staff.common.studentNumber')}: <bdi>{studentNumber.trim() || '—'}</bdi></span>
                  <span><bdi>{copyLabel(selectedCopy)}</bdi></span>
                  <span>{selectedCopy.branch.name}</span>
                </div>

                <label>
                  <span>{t('staff.borrow.notes')}</span>
                  <textarea
                    disabled={Boolean(busyId)}
              value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={1000}
                    placeholder={t('staff.borrow.notesPlaceholder')}
                  />
                </label>

                <button
                  type="submit"
                  className="staff-primary-button"
                  disabled={blocked || !studentNumber.trim()}
                >
                  {Boolean(busyId)
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
      {target && <AdminModal title={t('staff.ux.confirmCheckout')} canClose={!busyId} onClose={() => setTarget(null)}>
        <StaffMutationFeedback action={action} canVerify={!activeRead.loading && !activeRead.error && Boolean(activeRead.result)} />
        <StaffReadState read={activeRead} />
        <div className="staff-selection-summary">
          <strong dir="auto">{target.title}</strong>
          <span>{t('staff.common.studentNumber')}: <bdi>{target.student}</bdi></span>
          <span>{t('staff.common.copy')}: <bdi>{target.copy}</bdi></span>
          <span>{target.branch}</span>
        </div>
        <p>{t('staff.ux.checkoutHelp')}</p>
        <div className="staff-modal__actions">
          <button type="button" className="staff-primary-button" disabled={blocked || !activeRead.result?.data.some((record) => record.id === target.id)} onClick={submitCheckout}>{t(busyId ? 'staff.borrow.checkingOut' : 'staff.ux.confirmCheckout')}</button>
          <button type="button" className="staff-secondary-action" disabled={Boolean(busyId)} onClick={() => setTarget(null)}>{t('staff.common.cancel')}</button>
        </div>
      </AdminModal>}
    </section>
  );
}
