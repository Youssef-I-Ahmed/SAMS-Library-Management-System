import { useEffect, useId, useRef, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';

export function DiscoveryFilters({
  facets,
  filters,
  onChange,
  onClear
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(() =>
    window.matchMedia('(max-width: 1000px)').matches
  );
  // A URL navigation may be deferred by the router. Keep the native control's
  // response synchronous, then reconcile browser Back/Forward and Clear.
  const [availableOnly, setAvailableOnly] = useState(filters.availableOnly);

  useEffect(() => {
    setAvailableOnly(filters.availableOnly);
  }, [filters.availableOnly]);
  const fieldsId = useId();
  const fieldsRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1000px)');
    function updateViewport(event) {
      // Hide only after focus has left the fields. CSS-only hiding can blur
      // the active input before a matchMedia callback gets to inspect it.
      if (event.matches && !expanded && fieldsRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
      setMobile(event.matches);
    }
    updateViewport(query);
    query.addEventListener('change', updateViewport);
    return () => query.removeEventListener('change', updateViewport);
  }, [expanded]);

  function update(key, value) {
    onChange({
      ...filters,
      [key]: value,
      page: 1
    });
  }

  return (
    <aside className="discovery-filters" data-expanded={expanded}>
      <div className="discovery-filters__heading">
        <div>
          <span>{t('discovery.filters.eyebrow')}</span>
          <h2>{t('discovery.filters.title')}</h2>
        </div>

        <button className="discovery-filters__toggle" type="button" ref={toggleRef}
          aria-expanded={expanded} aria-controls={fieldsId} onClick={() => setExpanded(!expanded)}>
          {t(expanded ? 'discovery.filters.hide' : 'discovery.filters.show')}
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
        <button type="button" onClick={onClear}>
          {t('discovery.filters.clear')}
        </button>
      </div>

      <div className="discovery-filters__fields" id={fieldsId} ref={fieldsRef}
        hidden={mobile && !expanded}>
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
            checked={availableOnly}
            onChange={(event) => {
              const checked = event.target.checked;
              setAvailableOnly(checked);
              update('availableOnly', checked);
            }}
          />

          <span>
            <strong>{t('discovery.filters.availableOnly')}</strong>
            <small>{t('discovery.filters.availableOnlyHint')}</small>
          </span>
        </label>
      </div>
    </aside>
  );
}
