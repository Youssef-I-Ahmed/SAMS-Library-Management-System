import { useEffect, useState } from 'react';

import { InlineAlert } from '../../components/ui/InlineAlert';
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
  const [borrowings, setBorrowings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [outcome, setOutcome] = useState('GOOD');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  async function load(signal) {
    setLoading(true);
    setError(null);

    try {
      const response = await listBorrowings(
        auth.token,
        {
          q: query.trim() || undefined,
          status: 'ACTIVE',
          page: 1,
          pageSize: 50
        },
        signal
      );

      setBorrowings(response.data || []);
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
  }, [auth.token]);

  async function submitReturn() {
    if (!returnTarget || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await returnBorrowing(
        auth.token,
        returnTarget.id,
        {
          outcome,
          notes: notes.trim() || undefined
        }
      );

      setNotice({
        title: t('staff.return.success'),
        body: `${response.data.student.user.displayName} · ${response.data.item.title}`
      });

      setReturnTarget(null);
      setOutcome('GOOD');
      setNotes('');
      await load();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="staff-page">
      <header className="staff-page__header">
        <span>{t('staff.return.eyebrow')}</span>
        <h1>{t('staff.return.title')}</h1>
        <p>{t('staff.return.subtitle')}</p>
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
          className="staff-search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('staff.return.searchPlaceholder')}
          />
          <button type="submit">
            {t('staff.common.search')}
          </button>
        </form>

        {loading ? (
          <div className="staff-empty-state">
            {t('staff.common.loading')}
          </div>
        ) : borrowings.length === 0 ? (
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
                    <span>{borrowing.student.studentId}</span>
                    <strong>{borrowing.student.user.displayName}</strong>
                    <small dir="auto">{borrowing.item.title}</small>
                  </div>

                  <div className="staff-operation-row__facts">
                    <span>
                      {t('staff.common.copy')}: {copyLabel(borrowing.copy)}
                    </span>
                    <span>
                      {t('staff.common.branch')}: {borrowing.branch.name}
                    </span>
                    <span>
                      {t('staff.return.due')}:{' '}
                      {formatDateTime(borrowing.dueAt, language)}
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
        <div className="staff-modal-backdrop">
          <section
            className="staff-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-dialog-title"
          >
            <span className="staff-card-eyebrow">
              {t('staff.return.confirmEyebrow')}
            </span>
            <h2 id="return-dialog-title">
              {t('staff.return.confirmTitle')}
            </h2>
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
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
              />
            </label>

            <div className="staff-modal__actions">
              <button
                type="button"
                className="staff-primary-button"
                disabled={submitting}
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
          </section>
        </div>
      )}
    </section>
  );
}
