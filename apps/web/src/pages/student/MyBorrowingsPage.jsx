import { useEffect, useMemo, useState } from 'react';

import { InlineAlert } from '../../components/ui/InlineAlert';
import { StatusBadge } from '../../components/circulation/StatusBadge';
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

  const totalPages = useMemo(
    () => Math.max(result.pagination?.totalPages || 0, 1),
    [result.pagination?.totalPages]
  );

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    listMyBorrowings(
      auth.token,
      {
        status,
        page,
        pageSize: PAGE_SIZE
      },
      controller.signal
    )
      .then(setResult)
      .catch((nextError) => {
        if (nextError.name !== 'AbortError') {
          setError(nextError);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [auth.token, status, page]);

  return (
    <section className="circulation-page">
      <header className="circulation-page__header">
        <span>{t('borrowings.page.eyebrow')}</span>
        <h1>{t('borrowings.page.title')}</h1>
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
          {result.pagination?.total || 0}
          {' '}
          {t('borrowings.page.total')}
        </strong>
      </div>

      {error && (
        <InlineAlert
          title={t('borrowings.errors.title')}
          message={error.message}
          requestId={error.requestId}
        />
      )}

      {loading ? (
        <div className="catalog-state">
          <span className="catalog-spinner" aria-hidden="true" />
          <p>{t('borrowings.page.loading')}</p>
        </div>
      ) : result.data.length === 0 ? (
        <div className="catalog-state">
          <h2>{t('borrowings.page.emptyTitle')}</h2>
          <p>{t('borrowings.page.emptyBody')}</p>
        </div>
      ) : (
        <div className="borrowing-list">
          {result.data.map((borrowing) => (
            <article className="circulation-card" key={borrowing.id}>
              <div className="circulation-card__heading">
                <div>
                  <span>{t(`itemTypes.${borrowing.item.type}`)}</span>
                  <h2 dir="auto">{borrowing.item.title}</h2>
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
                  <dt>{t('borrowings.fields.branch')}</dt>
                  <dd dir="auto">{borrowing.branch.name}</dd>
                </div>
                <div>
                  <dt>{t('borrowings.fields.borrowedAt')}</dt>
                  <dd>{formatDateTime(borrowing.borrowedAt, language)}</dd>
                </div>
                <div>
                  <dt>{t('borrowings.fields.dueAt')}</dt>
                  <dd>{formatDateTime(borrowing.dueAt, language)}</dd>
                </div>
                <div>
                  <dt>{t('borrowings.fields.returnedAt')}</dt>
                  <dd>{formatDateTime(borrowing.returnedAt, language)}</dd>
                </div>
                {borrowing.item.callNumber && (
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
