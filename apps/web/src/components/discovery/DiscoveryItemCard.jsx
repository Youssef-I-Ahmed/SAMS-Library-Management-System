import { Link } from 'react-router-dom';

import { AvailabilityBadge } from './AvailabilityBadge';
import { BookCover } from './BookCover';
import {
  getCategoryLabel,
  getContributorRoleLabel,
  getItemTypeLabelKey,
  getLanguageLabel
} from '../../features/discovery/discovery-format';
import { useLanguage } from '../../hooks/useLanguage';

export function DiscoveryItemCard({ item, catalogReturn }) {
  const { t, language: uiLanguage } = useLanguage();
  const academic = item.type && item.type !== 'BOOK';
  const typeLabel = item.type === 'ACADEMIC_WORK'
    ? t('catalogRefinement.academicWork') : t(getItemTypeLabelKey(item.type));
  const creators = academic ? ['RESEARCHER', 'PROJECT_MEMBER', 'AUTHOR'] : ['AUTHOR'];
  const contributors = (item.itemContributors || []).filter((entry) => entry.contributor?.fullName)
    .slice().sort((a, b) => Number(creators.includes(b.role)) - Number(creators.includes(a.role)));
  const contributorLine = (entry, index) => (
    <li key={`${entry.contributor.id || entry.contributor.fullName}:${entry.role}:${index}`}>
      <bdi>{entry.contributor.fullName}</bdi>
      {entry.role && <span> · {getContributorRoleLabel(entry.role, t)}</span>}
    </li>
  );
  const academicDetails = academic ? item.academicWorkDetails : null;

  return (
    <article className="discovery-item-card">
      <BookCover item={item} typeLabel={typeLabel} />
      <div className="discovery-item-card__top">
        <span className={`item-type-mark item-type-mark--${(item.type || 'BOOK').toLowerCase()}`}>
          {typeLabel}
        </span>
      </div>

      <div className="discovery-item-card__body">
        <h3 dir="auto">{item.title}</h3>

        <div className="discovery-item-card__contributors">
          {contributors.length ? <ul>{contributors.slice(0, 2).map(contributorLine)}</ul>
            : <p>{t('discovery.card.noContributor')}</p>}
          {contributors.length > 2 && (
            <details>
              <summary>{t('catalogRefinement.moreContributors')} ({contributors.length - 2})</summary>
              <ul>{contributors.slice(2).map(contributorLine)}</ul>
            </details>
          )}
        </div>
        {item.category?.name && (
          <p className="discovery-item-card__category" dir="auto">{getCategoryLabel(item.category.name, t)}</p>
        )}

        <dl className="discovery-item-card__meta">
          {[
            ['academicYear', academicDetails?.academicYear],
            ['faculty', academicDetails?.faculty?.name],
            ['department', academicDetails?.department?.name]
          ].filter(([, value]) => value).map(([key, value]) => (
            <div key={key}>
              <dt>{t(`discovery.detail.${key}`)}</dt>
              <dd><bdi>{value}</bdi></dd>
            </div>
          ))}
          {item.publicationYear && (
            <div>
              <dt>{t('discovery.card.year')}</dt>
              <dd>{item.publicationYear}</dd>
            </div>
          )}

          {item.language && (
            <div>
              <dt>{t('discovery.card.language')}</dt>
              <dd dir="auto">{getLanguageLabel(item.language, t, uiLanguage)}</dd>
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

      <div className="discovery-item-card__availability">
        <AvailabilityBadge availability={item.availability} />
      </div>
      <div className="discovery-item-card__footer">
        <span>
          {item.availability?.branches?.length || 0}
          {' '}
          {t('discovery.card.branches')}
        </span>

        <Link to={`/student/items/${item.id}`} state={catalogReturn ? { catalogReturn } : undefined}
          aria-label={`${t('discovery.card.details')}: ${item.title}`}>
          <span>{t('discovery.card.details')}</span>
          <span className="details-link-arrow" aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
