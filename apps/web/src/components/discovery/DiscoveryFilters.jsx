import { useLanguage } from '../../hooks/useLanguage';

export function DiscoveryFilters({
  facets,
  filters,
  onChange,
  onClear
}) {
  const { t } = useLanguage();

  function update(key, value) {
    onChange({
      ...filters,
      [key]: value,
      page: 1
    });
  }

  return (
    <aside className="discovery-filters">
      <div className="discovery-filters__heading">
        <div>
          <span>{t('discovery.filters.eyebrow')}</span>
          <h2>{t('discovery.filters.title')}</h2>
        </div>

        <button type="button" onClick={onClear}>
          {t('discovery.filters.clear')}
        </button>
      </div>

      {[
        [
          'type',
          'discovery.filters.type',
          facets.types?.map((item) => ({
            value: item.value,
            label: `${t(`itemTypes.${item.value}`)} (${item.count})`
          }))
        ],
        [
          'categoryId',
          'discovery.filters.category',
          facets.categories?.map((item) => ({
            value: item.id,
            label: `${item.name} (${item.count})`
          }))
        ],
        [
          'deweyClassificationId',
          'discovery.filters.dewey',
          facets.deweyClassifications?.map((item) => ({
            value: item.id,
            label: `${item.code} · ${item.name} (${item.count})`
          }))
        ],
        [
          'language',
          'discovery.filters.language',
          facets.languages?.map((item) => ({
            value: item.value,
            label: `${item.value} (${item.count})`
          }))
        ],
        [
          'publicationYear',
          'discovery.filters.year',
          facets.publicationYears?.map((item) => ({
            value: item.value,
            label: `${item.value} (${item.count})`
          }))
        ],
        [
          'branchId',
          'discovery.filters.branch',
          facets.branches?.map((item) => ({
            value: item.id,
            label: `${item.name} (${item.availableItems}/${item.totalItems})`
          }))
        ]
      ].map(([key, labelKey, options]) => (
        <label className="filter-field" key={key}>
          <span>{t(labelKey)}</span>
          <select
            value={filters[key]}
            onChange={(event) => update(key, event.target.value)}
          >
            <option value="">{t('discovery.filters.all')}</option>
            {(options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <label className="availability-toggle">
        <input
          type="checkbox"
          checked={filters.availableOnly}
          onChange={(event) =>
            update('availableOnly', event.target.checked)
          }
        />

        <span>
          <strong>{t('discovery.filters.availableOnly')}</strong>
          <small>{t('discovery.filters.availableOnlyHint')}</small>
        </span>
      </label>
    </aside>
  );
}
