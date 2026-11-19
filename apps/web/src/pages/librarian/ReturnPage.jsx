import { useState } from 'react';
import { AdminModal } from '../../components/admin/AdminModal';

import { StaffReadState, StaffMutationFeedback } from '../../components/staff/StaffReadState';
import { useStaffRead, useStaffMutation } from '../../features/staff/use-staff-circulation';
import '../../styles/staff-circulation.css';
import { StaffOperationNotice } from '../../components/staff/StaffOperationNotice';
import { StaffStatusBadge } from '../../components/staff/StaffStatusBadge';

import {
  listBorrowings,
  returnBorrowing
} from '../../features/staff/staff-api';

import {
  RETURN_OUTCOMES,
  borrowingTone,
  copyLabel,
  formatDateTime
} from '../../features/staff/staff-format';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function ReturnPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const read = useStaffRead(listBorrowings, auth.token, { q: submittedQuery, status: 'ACTIVE', page: 1, pageSize: 50 });
  const borrowings = read.result?.data || [];
  const { loading } = read;
  const action = useStaffMutation(auth.token);
  const submitting = Boolean(action.pending);
  const blocked = submitting || action.uncertain || read.loading || Boolean(read.error);
  const [returnTarget, setReturnTarget] = useState(null);
  const [outcome, setOutcome] = useState('GOOD');
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState(null);

  function submitReturn() {
    if (!returnTarget || blocked || !borrowings.some((record) => record.id === returnTarget.id)) return;
    setNotice(null);
    action.run(returnTarget.id, () => returnBorrowing(auth.token, returnTarget.id, { outcome, notes: notes.trim() || undefined }), (record) => {
      setNotice({ title: t('staff.ux.confirmed'), body: `${record.student?.user?.displayName || '—'} · ${record.item?.title || '—'} · ${t(`staff.borrowingStatus.${record.status}`)}` });
      setReturnTarget(null); setOutcome('GOOD'); setNotes('');
    });
  }

  return (
    <section className="staff-page staff-circulation">
      <header className="staff-page__header">
        <span>{t('staff.return.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('staff.return.title')}</h1>
        <p>{t('staff.return.subtitle')}</p>
      </header>

      {notice && (
        <StaffOperationNotice
          title={notice.title}
          body={notice.body}
          onDismiss={() => setNotice(null)}
        />
      )}

      {!returnTarget && <StaffMutationFeedback action={action} canVerify={!read.loading && !read.error && Boolean(read.result)} />}

      <section className="staff-workflow-card">
        <form
          className="staff-search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            if (submittedQuery === query.trim()) read.reload();
            else setSubmittedQuery(query.trim());
          }}
        >
          <input
            aria-label={t('staff.return.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('staff.return.searchPlaceholder')}
          />
          <button type="submit">
            {t('staff.common.search')}
          </button>
        </form>

        {!returnTarget && <StaffReadState read={read} limit={50} />}
        {loading && !read.result ? (
          <div className="staff-empty-state">
            {t('staff.common.loading')}
          </div>
        ) : !read.result || read.error && borrowings.length === 0 ? null : borrowings.length === 0 ? (
          <div className="staff-empty-state">
            <strong>{t('staff.return.noActive')}</strong>
            <span>{t('staff.return.noActiveBody')}</span>
          </div>
        ) : (
          <div className="staff-operation-list">
            {borrowings.map((borrowing) => (
              <article className="staff-operation-row" key={borrowing.id}>
                <div className="staff-operation-row__main">
                  <div className="staff-operation-row__title">
                    <span><bdi>{borrowing.student.studentId}</bdi></span>
                    <strong>{borrowing.student.user.displayName}</strong>
                    <small dir="auto">{borrowing.item.title}</small>
                  </div>

                  <div className="staff-operation-row__facts">
                    <span>
                      {t('staff.common.copy')}: <bdi>{copyLabel(borrowing.copy)}</bdi>
                    </span>
                    <span>
                      {t('staff.common.branch')}: {borrowing.branch.name}
                    </span>
                    <span>
                      {t('staff.return.due')}:{' '}
                      <bdi>{formatDateTime(borrowing.dueAt, language)}</bdi>
                    </span>
                    {borrowing.copy.shelfLocation && (
                      <span>
                        {t('staff.common.shelf')}: {borrowing.copy.shelfLocation}
                      </span>
                    )}
                  </div>
                </div>

                <div className="staff-operation-row__actions">
                  <StaffStatusBadge tone={borrowingTone(borrowing)}>
                    {borrowing.isOverdue
                      ? `${t('staff.borrowingStatus.OVERDUE')} · ${borrowing.overdueDays}`
                      : t(`staff.borrowingStatus.${borrowing.status}`)}
                  </StaffStatusBadge>

                  <button
                    type="button"
                    className="staff-primary-button"
                    disabled={blocked}
                    onClick={() => {
                      setReturnTarget(borrowing);
                      setOutcome('GOOD');
                      setNotes('');
                    }}
                  >
                    {t('staff.return.process')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {returnTarget && (
        <AdminModal
          eyebrow={t('staff.return.confirmEyebrow')}
          title={t('staff.return.confirmTitle')}
          onClose={() => setReturnTarget(null)}
          canClose={!submitting}
        >
            <StaffMutationFeedback action={action} canVerify={!read.loading && !read.error && Boolean(read.result)} />
            <StaffReadState read={read} />
            <p dir="auto">
              {returnTarget.student.user.displayName} · {returnTarget.item.title}
            </p>

            <div className="staff-return-options">
              {RETURN_OUTCOMES.map((value) => (
                <label
                  key={value}
                  className={
                    outcome === value
                      ? 'staff-return-option is-selected'
                      : 'staff-return-option'
                  }
                >
                  <input
                    disabled={submitting}
                    type="radio"
                    name="outcome"
                    value={value}
                    checked={outcome === value}
                    onChange={() => setOutcome(value)}
                  />
                  <strong>{t(`staff.returnOutcome.${value}`)}</strong>
                  <span>{t(`staff.returnOutcomeHelp.${value}`)}</span>
                </label>
              ))}
            </div>

            <label className="staff-notes-field">
              <span>{t('staff.return.notes')}</span>
              <textarea
                disabled={submitting}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
              />
            </label>

            <div className="staff-modal__actions">
              <button
                type="button"
                className="staff-primary-button"
                disabled={blocked || !borrowings.some((record) => record.id === returnTarget.id)}
                onClick={submitReturn}
              >
                {submitting
                  ? t('staff.return.returning')
                  : t('staff.return.confirm')}
              </button>

              <button
                type="button"
                className="staff-secondary-action"
                disabled={submitting}
                onClick={() => setReturnTarget(null)}
              >
                {t('staff.common.cancel')}
              </button>
            </div>
        </AdminModal>
      )}
    </section>
  );
}
