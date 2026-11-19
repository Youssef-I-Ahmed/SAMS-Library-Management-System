import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '../../components/circulation/StatusBadge';
import { CirculationListState, CirculationPagination } from '../../components/circulation/CirculationListState';
import { useCirculationList } from '../../features/circulation/use-circulation-list';
import {
  listMyBorrowings
} from '../../features/circulation/circulation-api';
import {
  BORROWING_STATUSES,
  formatDateTime,
  getBorrowingTone
} from '../../features/circulation/circulation-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

const PAGE_SIZE = 20;

export function MyBorrowingsPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const read = useCirculationList(listMyBorrowings, { token: auth.token, status, page, pageSize: PAGE_SIZE });
  const { result, loading, error } = read;
  const headingRef = useRef(null);
  const totalPages = Math.max(result?.pagination?.totalPages || 0, 1);

  return (
    <section className="circulation-page circulation-page--student">
      <header className="circulation-page__header">
        <span>{t('borrowings.page.eyebrow')}</span>
        <h1 ref={headingRef} tabIndex={-1}>{t('borrowings.page.title')}</h1>
        <p>{t('borrowings.page.subtitle')}</p>
      </header>

      <div className="circulation-toolbar">
        <label>
          <span>{t('borrowings.page.statusFilter')}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {t('borrowings.status.ALL')}
            </option>

            {BORROWING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`borrowings.status.${value}`)}
              </option>
            ))}
          </select>
        </label>

        <strong>
          {loading ? t('borrowings.page.loading') : error ? t('circulationUx.unavailable')
            : `${result?.pagination?.total ?? ''} ${t('borrowings.page.total')}`}
        </strong>
        <button type="button" className="circulation-secondary-button" disabled={loading}
          onClick={read.reload}>{t('circulationUx.refresh')}</button>
      </div>

      <CirculationListState read={read} headingRef={headingRef} totalLabel={t('borrowings.page.total')}
        loadingText={t('borrowings.page.loading')} emptyTitle={t('borrowings.page.emptyTitle')}
        emptyBody={t('borrowings.page.emptyBody')} errorTitle={t('borrowings.errors.title')}>
        <div className="borrowing-list">
          {result?.data.map((borrowing) => (
            <article className="circulation-card" key={borrowing.id}>
              <div className="circulation-card__heading">
                <div>
                  {borrowing.item?.type && <span>{t(borrowing.item.type === 'ACADEMIC_WORK'
                    ? 'catalogRefinement.academicWork' : `itemTypes.${borrowing.item.type}`)}</span>}
                  <h2 dir="auto">{typeof borrowing.item?.id === 'string' && borrowing.item.id.trim()
                    ? <Link to={`/student/items/${encodeURIComponent(borrowing.item.id)}`}>{borrowing.item.title || t('circulationUx.noTitle')}</Link>
                    : borrowing.item?.title || t('circulationUx.noTitle')}</h2>
                </div>

                <StatusBadge tone={getBorrowingTone(borrowing)}>
                  {borrowing.isOverdue
                    ? t('borrowings.status.OVERDUE')
                    : t(`borrowings.status.${borrowing.status}`)}
                </StatusBadge>
              </div>

              {borrowing.isOverdue && (
                <div className="overdue-banner">
                  <strong>
                    {t('borrowings.overdue.title')}
                  </strong>
                  <span>
                    {borrowing.overdueDays}
                    {' '}
                    {t('borrowings.overdue.days')}
                  </span>
                </div>
              )}

              <dl className="circulation-card__meta">
                <div>
                  <dt>{t('borrowings.fields.dueAt')}</dt>
                  <dd><bdi>{formatDateTime(borrowing.dueAt, language)}</bdi></dd>
                </div>
                <div>
                  <dt>{t('borrowings.fields.borrowedAt')}</dt>
                  <dd><bdi>{formatDateTime(borrowing.borrowedAt, language)}</bdi></dd>
                </div>
                <div>
                  <dt>{t('borrowings.fields.branch')}</dt>
                  <dd><bdi>{borrowing.branch?.name || '—'}</bdi></dd>
                </div>
                <div>
                  <dt>{t('borrowings.fields.returnedAt')}</dt>
                  <dd><bdi>{formatDateTime(borrowing.returnedAt, language)}</bdi></dd>
                </div>
                {borrowing.item?.callNumber && (
                  <div>
                    <dt>{t('borrowings.fields.callNumber')}</dt>
                    <dd dir="auto">{borrowing.item.callNumber}</dd>
                  </div>
                )}
                {borrowing.returnCondition && (
                  <div>
                    <dt>{t('borrowings.fields.returnCondition')}</dt>
                    <dd>
                      {t(`borrowings.conditions.${borrowing.returnCondition}`)}
                    </dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      </CirculationListState>

      {Boolean(result?.data.length) && (
        <CirculationPagination page={page} totalPages={totalPages} disabled={loading || Boolean(error)}
          onChange={(value) => { setPage(value); headingRef.current?.focus(); }} />
      )}
    </section>
  );
}
