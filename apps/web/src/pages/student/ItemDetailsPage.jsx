import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AvailabilityBadge } from '../../components/discovery/AvailabilityBadge';
import { BookCover } from '../../components/discovery/BookCover';
import { InventoryNotice } from '../../components/discovery/InventoryNotice';
import { ReservationPanel } from '../../components/circulation/ReservationPanel';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { getDiscoveryItem } from '../../features/discovery/discovery-api';
import {
  getCategoryLabel,
  getContributorRoleLabel,
  getItemTypeLabelKey,
  getLanguageLabel
} from '../../features/discovery/discovery-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function ItemDetailsPage({ backTo = '/student/catalog', backLabel = 'discovery.detail.back', canReserve = true }) {
  const { itemId } = useParams();
  const auth = useAuth();
  const { t } = useLanguage();
  const inventoryDescriptionId = useId();
  const titleId = useId();
  const availabilityTitleId = useId();
  const metadataTitleId = useId();
  const descriptionTitleId = useId();
  const backRef = useRef(null);
  const activeItemRef = useRef(null);
  const refreshControllerRef = useRef(null);

  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestItemId, setRequestItemId] = useState(itemId);
  const [retryVersion, setRetryVersion] = useState(0);
  const [refreshError, setRefreshError] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const isLoading = loading || requestItemId !== itemId;

  async function refreshItem() {
    if (activeItemRef.current?.itemId !== itemId || activeItemRef.current?.token !== auth.token) return;
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    setRefreshError(null);
    try {
      const response = await getDiscoveryItem(auth.token, itemId, controller.signal);
      if (!controller.signal.aborted) setItem(response?.data || null);
    } catch (nextError) {
      // A recorded reservation remains successful if the subsequent read fails.
      if (!controller.signal.aborted && nextError.name !== 'AbortError') setRefreshError(nextError);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    activeItemRef.current = { itemId, token: auth.token };
    setRequestItemId(itemId);
    setLoading(true);
    setError(null);
    setItem(null);
    setRefreshError(null);

    getDiscoveryItem(auth.token, itemId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setItem(response?.data || null);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted && nextError.name !== 'AbortError') {
          setError(nextError);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      refreshControllerRef.current?.abort();
      activeItemRef.current = null;
    };
  }, [auth.token, itemId, retryVersion]);

  useEffect(() => {
    setAnnouncement(!isLoading && !error && item?.id ? t('discovery.detail.loaded') : '');
  }, [isLoading, error, item?.id, t]);

  const backLink = (
    <Link className="item-detail-back" to={backTo} ref={backRef}>
      <span className="item-detail-back__arrow" aria-hidden="true">←</span> {t(backLabel)}
    </Link>
  );
  const status = (
    <div className={`item-detail-announcement ${isLoading ? 'item-detail-state' : 'sr-only'}`}
      role="status" aria-live="polite" aria-atomic="true">
      {isLoading ? <><span className="catalog-spinner" aria-hidden="true" /><h1>{t('discovery.detail.loading')}</h1></> : announcement}
    </div>
  );

  if (isLoading) {
    return (
      <article className="item-detail-page">{backLink}{status}</article>
    );
  }

  if (error || !item) {
    const missing = !error || error.status === 404 || error.code === 'NOT_FOUND';
    return (
      <article className="item-detail-page">
        {backLink}{status}
        <section className="item-detail-state item-detail-error">
          <h1>{t(missing ? 'discovery.detail.missingTitle' : 'discovery.errors.detailTitle')}</h1>
          {missing ? <>
            <p>{t('discovery.detail.missingBody')}</p>
            {error?.requestId && <small>{t('discovery.detail.requestId')}: {error.requestId}</small>}
          </> : <>
            <InlineAlert message={error.message} requestId={error.requestId} />
            <button type="button" onClick={() => {
              setRetryVersion((version) => version + 1);
              backRef.current?.focus();
            }}>{t('discovery.catalog.retry')}</button>
          </>}
        </section>
      </article>
    );
  }

  const categoryLabel = getCategoryLabel(item.category?.name, t);
  const fields = [
    ['discovery.detail.type', t(getItemTypeLabelKey(item.type))],
    ['discovery.detail.year', item.publicationYear],
    [
      'discovery.detail.language',
      item.language ? getLanguageLabel(item.language, t) : null
    ],
    ['discovery.detail.callNumber', item.callNumber],
    [
      'discovery.detail.dewey',
      item.deweyClassification
        ? [item.deweyClassification.code, item.deweyClassification.name].filter(Boolean).join(' · ') || item.deweyCodeRaw
        : item.deweyCodeRaw
    ],
    ['discovery.detail.category', categoryLabel],
    ['discovery.detail.isbn', item.bookDetails?.isbn],
    ['discovery.detail.publisher', item.bookDetails?.publisher],
    ['discovery.detail.edition', item.bookDetails?.edition],
    ['discovery.detail.academicYear', item.academicWorkDetails?.academicYear],
    ['discovery.detail.legacyCode', item.legacyIdentities?.map((entry) => entry.legacyCode).join('، ')],
    ['discovery.detail.subjects', item.itemSubjects?.map((entry) => entry.subject.name).join('، ')],
    ['discovery.detail.extent', item.academicWorkDetails?.extent],
    ['discovery.detail.dimensions', item.academicWorkDetails?.dimensions],
    ['discovery.detail.recordType', item.academicWorkDetails?.recordType],
    ['discovery.detail.faculty', item.academicWorkDetails?.faculty?.name],
    ['discovery.detail.department', item.academicWorkDetails?.department?.name]
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <article className="item-detail-page">
      {backLink}
      {status}
      <div className="item-detail-layout">
        <div className="item-detail-main">
          <section className="item-detail-hero" aria-labelledby={titleId}>
            <BookCover item={item} />
            <div className="item-detail-identity">
              <span className="item-type-mark">
                {t(getItemTypeLabelKey(item.type))}
              </span>

              <h1 id={titleId} dir="auto">{item.title}</h1>

              <div className="item-contributors">
                {item.itemContributors?.map((entry) => (
                  <span key={`${entry.role}-${entry.contributor.id}`} dir="auto">
                    <strong>{entry.contributor.fullName}</strong>
                    <small>{getContributorRoleLabel(entry.role, t)}</small>
                  </span>
                ))}
              </div>
              {!item.itemContributors?.length && <p className="item-detail-muted">{t('discovery.card.noContributor')}</p>}
              {categoryLabel && <p className="item-detail-category" dir="auto">{categoryLabel}</p>}
            </div>
          </section>

          <nav className="item-detail-sections" aria-label={t('discovery.detail.sections')}>
            {item.abstractDescription && <a href={`#${descriptionTitleId}`}>{t('discovery.detail.descriptionEyebrow')}</a>}
            <a href={`#${metadataTitleId}`}>{t('discovery.detail.metadataTitle')}</a>
            <a href={`#${availabilityTitleId}`}>{t('discovery.detail.availabilityTitle')}</a>
          </nav>

          {item.abstractDescription && (
            <section className="item-detail-section">
              <span>{t('discovery.detail.descriptionEyebrow')}</span>
              <h2 id={descriptionTitleId} tabIndex={-1}>{t('discovery.detail.descriptionTitle')}</h2>
              <p dir="auto">{item.abstractDescription}</p>
            </section>
          )}

          <section className="item-detail-section">
            <span>{t('discovery.detail.metadataEyebrow')}</span>
            <h2 id={metadataTitleId} tabIndex={-1}>{t('discovery.detail.metadataTitle')}</h2>

            <dl className="detail-grid">
              {fields.map(([key, value]) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd dir="auto">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="availability-panel" aria-labelledby={availabilityTitleId}>
          <span>{t('discovery.detail.availabilityEyebrow')}</span>
          <h2 id={availabilityTitleId} tabIndex={-1}>{t('discovery.detail.availabilityTitle')}</h2>
          <AvailabilityBadge availability={item.availability} />

          <InventoryNotice descriptionId={inventoryDescriptionId} />

          <div className="availability-summary">
            <div>
              <strong>{item.availability?.availableCopies || 0}</strong>
              <small>{t('discovery.detail.availableCopies')}</small>
            </div>

            <div>
              <strong>{item.availability?.totalCopies || 0}</strong>
              <small>{t('discovery.detail.totalCopies')}</small>
            </div>
          </div>

          <div className="branch-list">
            {item.availability?.branches?.length ? (
              item.availability.branches.map((entry) => (
                <div key={entry.branch.id}>
                  <span>
                    <strong dir="auto">{entry.branch.name}</strong>
                    {entry.branch.location && (
                      <small dir="auto">{entry.branch.location}</small>
                    )}
                  </span>

                  <b data-available={entry.available}>
                    <span aria-hidden="true">{entry.availableCopies}/{entry.totalCopies}</span>
                    <span className="sr-only">
                      {entry.availableCopies} {t('discovery.detail.availableCopies')}, {' '}
                      {entry.totalCopies} {t('discovery.detail.totalCopies')}
                    </span>
                  </b>
                </div>
              ))
            ) : (
              <p>{t('discovery.detail.noBranchCopies')}</p>
            )}
          </div>

          {refreshError && <div className="item-detail-refresh-error">
            <InlineAlert title={t('discovery.detail.refreshError')} message={refreshError.message} requestId={refreshError.requestId} />
            <button type="button" onClick={() => { backRef.current?.focus(); refreshItem(); }}>{t('discovery.catalog.retry')}</button>
          </div>}

          {canReserve && <ReservationPanel key={item.id}
            item={item}
            onReservationCreated={refreshItem}
            inventoryDescriptionId={inventoryDescriptionId}
          />}
        </aside>
      </div>
    </article>
  );
}
