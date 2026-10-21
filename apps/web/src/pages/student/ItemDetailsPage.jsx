import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AvailabilityBadge } from '../../components/discovery/AvailabilityBadge';
import { ReservationPanel } from '../../components/circulation/ReservationPanel';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { getDiscoveryItem } from '../../features/discovery/discovery-api';
import {
  getContributorRoleLabel,
  getItemTypeLabelKey,
  getLanguageLabel
} from '../../features/discovery/discovery-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function ItemDetailsPage() {
  const { itemId } = useParams();
  const auth = useAuth();
  const { t } = useLanguage();

  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refreshItem() {
    const response = await getDiscoveryItem(
      auth.token,
      itemId
    );

    setItem(response?.data || null);
  }

  useEffect(() => {
    const controller = new AbortController();

    getDiscoveryItem(auth.token, itemId, controller.signal)
      .then((response) => setItem(response?.data || null))
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
  }, [auth.token, itemId]);

  if (loading) {
    return (
      <div className="catalog-state">
        <span className="catalog-spinner" aria-hidden="true" />
        <p>{t('discovery.detail.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="item-detail-error">
        <InlineAlert
          title={t('discovery.errors.detailTitle')}
          message={error.message}
          requestId={error.requestId}
        />

        <Link to="/student/catalog">
          {t('discovery.detail.back')}
        </Link>
      </div>
    );
  }

  if (!item) return null;

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
        ? `${item.deweyClassification.code} · ${item.deweyClassification.name}`
        : item.deweyCodeRaw
    ],
    ['discovery.detail.category', item.category?.name],
    ['discovery.detail.isbn', item.bookDetails?.isbn],
    ['discovery.detail.publisher', item.bookDetails?.publisher],
    ['discovery.detail.edition', item.bookDetails?.edition],
    ['discovery.detail.academicYear', item.academicWorkDetails?.academicYear],
    ['discovery.detail.faculty', item.academicWorkDetails?.faculty?.name],
    ['discovery.detail.department', item.academicWorkDetails?.department?.name]
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <article className="item-detail-page">
      <Link className="item-detail-back" to="/student/catalog">
        ← {t('discovery.detail.back')}
      </Link>

      <section className="item-detail-hero">
        <div>
          <span className="item-type-mark">
            {t(getItemTypeLabelKey(item.type))}
          </span>

          <h1 dir="auto">{item.title}</h1>

          <div className="item-contributors">
            {item.itemContributors?.map((entry) => (
              <span key={`${entry.role}-${entry.contributor.id}`} dir="auto">
                <strong>{entry.contributor.fullName}</strong>
                <small>{getContributorRoleLabel(entry.role, t)}</small>
              </span>
            ))}
          </div>
        </div>

        <AvailabilityBadge availability={item.availability} />
      </section>

      <div className="item-detail-layout">
        <div className="item-detail-main">
          <section className="item-detail-section">
            <span>{t('discovery.detail.metadataEyebrow')}</span>
            <h2>{t('discovery.detail.metadataTitle')}</h2>

            <dl className="detail-grid">
              {fields.map(([key, value]) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd dir="auto">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {item.abstractDescription && (
            <section className="item-detail-section">
              <span>{t('discovery.detail.descriptionEyebrow')}</span>
              <h2>{t('discovery.detail.descriptionTitle')}</h2>
              <p dir="auto">{item.abstractDescription}</p>
            </section>
          )}
        </div>

        <aside className="availability-panel">
          <span>{t('discovery.detail.availabilityEyebrow')}</span>
          <h2>{t('discovery.detail.availabilityTitle')}</h2>

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
                    {entry.availableCopies}/{entry.totalCopies}
                  </b>
                </div>
              ))
            ) : (
              <p>{t('discovery.detail.noBranchCopies')}</p>
            )}
          </div>

          <ReservationPanel
            item={item}
            onReservationCreated={refreshItem}
          />
        </aside>
      </div>
    </article>
  );
}
