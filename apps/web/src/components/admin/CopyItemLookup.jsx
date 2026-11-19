import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { adminItemTypeLabel } from '../../features/admin/admin-format';
import { listCatalogItems } from '../../features/admin/admin-api';
import { useStaffRead } from '../../features/staff/use-staff-circulation';
import { useLanguage } from '../../hooks/useLanguage';
import { AdminReadState, AdminPagination } from './AdminReadState';

export function CopyItemLookup({ selectedId, onSelect, onValidityChange, disabled }) {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', includeInactive: false, page: 1, pageSize: 20 });
  const read = useStaffRead(listCatalogItems, token, filters, true, false);
  const valid = !read.loading && !read.error && Boolean(read.result?.data.some(item => item.id === selectedId && item.isActive));
  useEffect(() => { onValidityChange(valid); }, [onValidityChange, valid]);
  return <section className="copy-item-lookup" aria-label={t('admin.workflows.findItem')}>
    <form className="admin-lookup-search" onSubmit={(event) => {
      event.preventDefault(); if (disabled) return;
      onSelect(null);
      if (filters.page === 1 && filters.search === search.trim()) read.reload();
      else setFilters(current => ({ ...current, search: search.trim(), page: 1 }));
    }}>
      <label><span>{t('admin.workflows.findItem')}</span><input disabled={disabled} value={search} maxLength={300} onChange={event => setSearch(event.target.value)} /></label>
      <button type="submit" className="admin-secondary-button" disabled={disabled}>{t('admin.common.search')}</button>
    </form>
    <AdminReadState read={read} />
    {read.result && !read.error && !read.result.data.length && <p>{t('admin.workflows.emptyItems')}</p>}
    <div className="copy-item-options">
      {read.result?.data.map(item => <label key={item.id}>
        <input type="radio" name="copy-item-selection" disabled={disabled || read.loading || Boolean(read.error) || !item.isActive} checked={selectedId === item.id} onChange={() => onSelect(item)} />
        <span><strong dir="auto">{item.title}</strong><small>{adminItemTypeLabel(item.type, t)} · <bdi>{item.callNumber || item.id}</bdi></small></span>
      </label>)}
    </div>
    <AdminPagination read={read} disabled={disabled} onPage={page => { onSelect(null); setFilters(current => ({ ...current, page })); }} />
  </section>;
}
