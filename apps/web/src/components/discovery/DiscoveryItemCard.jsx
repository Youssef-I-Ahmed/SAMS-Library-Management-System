import { Link } from 'react-router-dom';

import { AvailabilityBadge } from './AvailabilityBadge';
import {
  getItemTypeLabelKey,
  getLanguageLabel,
  getPrimaryContributor
} from '../../features/discovery/discovery-format';
import { useLanguage } from '../../hooks/useLanguage';

export function DiscoveryItemCard({ item }) {
  const { t } = useLanguage();
  const contributor = getPrimaryContributor(item);

  return (
    <article className="discovery-item-card">
      <div className="discovery-item-card__top">
        <span className={`item-type-mark item-type-mark--${item.type.toLowerCase()}`}>
          {t(getItemTypeLabelKey(item.type))}
        </span>

        <AvailabilityBadge availability={item.availability} />
      </div>

      <div className="discovery-item-card__body">
        <h3 dir="auto">{item.title}</h3>

        {contributor && (
          <p className="discovery-item-card__contributor" dir="auto">
            {contributor}
          </p>
        )}

        <dl className="discovery-item-card__meta">
          {item.publicationYear && (
            <div>
              <dt>{t('discovery.card.year')}</dt>
              <dd>{item.publicationYear}</dd>
            </div>
          )}

          {item.language && (
            <div>
              <dt>{t('discovery.card.language')}</dt>
              <dd dir="auto">{getLanguageLabel(item.language, t)}</dd>
            </div>
          )}

          {(item.deweyClassification?.code || item.deweyCodeRaw) && (
            <div>
              <dt>{t('discovery.card.dewey')}</dt>
              <dd dir="ltr">
                {item.deweyClassification?.code || item.deweyCodeRaw}
              </dd>
            </div>
          )}

          {item.callNumber && (
            <div>
              <dt>{t('discovery.card.callNumber')}</dt>
              <dd dir="auto">{item.callNumber}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="discovery-item-card__footer">
        <span>
          {item.availability?.branches?.length || 0}
          {' '}
          {t('discovery.card.branches')}
        </span>

        <Link to={`/student/items/${item.id}`}>
          <span>{t('discovery.card.details')}</span>
          <span className="details-link-arrow" aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
