import { useEffect, useMemo, useState } from 'react';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { AdminModal } from '../../components/admin/AdminModal';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import {
  createCatalogItem, createCopy, getCatalogItem, listBranches, listCatalogItems,
  listCategories, listCopies, listDepartments, listDewey, listFaculties,
  putAcademicWorkDetails, putBookDetails, updateCatalogItem, updateCopy
} from '../../features/admin/admin-api';
import {
  COPY_CONDITIONS, COPY_STATUSES, ITEM_TYPES, copyStatusTone, copyToDraft,
  emptyCopyDraft, emptyItemDraft, itemStatusTone, itemToDraft
} from '../../features/admin/admin-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function CatalogAdminPage() {
  const auth = useAuth(); const { t } = useLanguage();
  const [tab, setTab] = useState('items'); const [items, setItems] = useState([]); const [copies, setCopies] = useState([]);
  const [itemSearch, setItemSearch] = useState(''); const [copySearch, setCopySearch] = useState('');
  const [itemType, setItemType] = useState(''); const [copyStatus, setCopyStatus] = useState(''); const [copyBranch, setCopyBranch] = useState('');
  const [categories, setCategories] = useState([]); const [dewey, setDewey] = useState([]); const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]); const [branches, setBranches] = useState([]);
  const [itemDraft, setItemDraft] = useState(null); const [copyDraft, setCopyDraft] = useState(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(null); const [notice, setNotice] = useState('');

  const filteredDepartments = useMemo(() => itemDraft?.facultyId ? departments.filter((d) => d.facultyId === itemDraft.facultyId) : departments, [departments, itemDraft?.facultyId]);

  async function loadLookups(signal) {
    const [c, d, f, dep, b] = await Promise.all([listCategories(auth.token, signal), listDewey(auth.token, signal), listFaculties(auth.token, signal), listDepartments(auth.token, signal), listBranches(auth.token, signal)]);
    setCategories(c.data || []); setDewey(d.data || []); setFaculties(f.data || []); setDepartments(dep.data || []); setBranches(b.data || []);
  }
  async function loadItems(signal) {
    const r = await listCatalogItems(auth.token, { search: itemSearch.trim() || undefined, type: itemType || undefined, includeInactive: true, page: 1, pageSize: 100 }, signal);
    setItems(r.data || []);
  }
  async function loadCopies(signal) {
    const r = await listCopies(auth.token, { search: copySearch.trim() || undefined, branchId: copyBranch || undefined, status: copyStatus || undefined, page: 1, pageSize: 100 }, signal);
    setCopies(r.data || []);
  }
  async function reload() { setLoading(true); setError(null); try { if (tab === 'items') await loadItems(); else await loadCopies(); } catch (e) { setError(e); } finally { setLoading(false); } }

  useEffect(() => { const c = new AbortController(); loadLookups(c.signal).catch(e => e.name !== 'AbortError' && setError(e)); return () => c.abort(); }, [auth.token]);
  useEffect(() => { const c = new AbortController(); setLoading(true); (tab === 'items' ? loadItems(c.signal) : loadCopies(c.signal)).catch(e => e.name !== 'AbortError' && setError(e)).finally(() => !c.signal.aborted && setLoading(false)); return () => c.abort(); }, [auth.token, tab, itemType, copyStatus, copyBranch]);

  async function editItem(id) { try { const r = await getCatalogItem(auth.token, id); setItemDraft(itemToDraft(r.data)); } catch (e) { setError(e); } }
  function setItem(key, value) { setItemDraft(v => ({ ...v, [key]: value })); }
  async function saveItem(e) {
    e.preventDefault(); if (!itemDraft || saving) return; setSaving(true); setError(null);
    try {
      const base = { title: itemDraft.title.trim(), categoryId: itemDraft.categoryId || null, deweyClassificationId: itemDraft.deweyClassificationId || null, deweyCodeRaw: itemDraft.deweyCodeRaw.trim() || null, callNumber: itemDraft.callNumber.trim() || null, language: itemDraft.language.trim() || null, publicationYear: itemDraft.publicationYear === '' ? null : Number(itemDraft.publicationYear), abstract: itemDraft.abstract.trim() || null };
      let item;
      if (itemDraft.id) item = (await updateCatalogItem(auth.token, itemDraft.id, { version: itemDraft.version, ...base, isActive: itemDraft.isActive })).data;
      else item = (await createCatalogItem(auth.token, { type: itemDraft.type, ...base })).data;
      if (itemDraft.type === 'BOOK') item = (await putBookDetails(auth.token, item.id, { version: item.version, isbn: itemDraft.isbn.trim() || null, publisher: itemDraft.publisher.trim() || null, edition: itemDraft.edition.trim() || null })).data;
      else item = (await putAcademicWorkDetails(auth.token, item.id, { version: item.version, facultyId: itemDraft.facultyId || null, departmentId: itemDraft.departmentId || null, academicYear: itemDraft.academicYear.trim() || null })).data;
      setNotice(itemDraft.id ? t('admin.catalog.updated') : t('admin.catalog.created')); setItemDraft(null); await loadItems();
    } catch (e2) { setError(e2); } finally { setSaving(false); }
  }
  async function toggleItem(item) { try { await updateCatalogItem(auth.token, item.id, { version: item.version, isActive: !item.isActive }); setNotice(item.isActive ? t('admin.catalog.archived') : t('admin.catalog.restored')); await loadItems(); } catch (e) { setError(e); } }

  function setCopy(key, value) { setCopyDraft(v => ({ ...v, [key]: value })); }
  async function saveCopy(e) {
    e.preventDefault(); if (!copyDraft || saving) return; setSaving(true); setError(null);
    try {
      const editable = {
        copyCode: copyDraft.copyCode.trim() || null,
        barcode: copyDraft.barcode.trim() || null,
        shelfLocation: copyDraft.shelfLocation.trim() || null,
        condition: copyDraft.condition || null
      };

      if (copyDraft.id) {
        const patch = {
          version: copyDraft.version,
          ...editable
        };

        if (copyDraft.branchId !== copyDraft.originalBranchId) {
          patch.branchId = copyDraft.branchId;
        }

        if (copyDraft.status !== copyDraft.originalStatus) {
          patch.status = copyDraft.status;
        }

        await updateCopy(auth.token, copyDraft.id, patch);
        setNotice(t('admin.copies.updated'));
      } else {
        await createCopy(auth.token, {
          itemId: copyDraft.itemId,
          branchId: copyDraft.branchId,
          status: copyDraft.status,
          ...editable
        });
        setNotice(t('admin.copies.created'));
      }

      setCopyDraft(null); await loadCopies();
    } catch (e2) { setError(e2); } finally { setSaving(false); }
  }

  const copyCirculationManaged = Boolean(
    copyDraft?.id &&
    ['RESERVED', 'BORROWED'].includes(copyDraft.originalStatus)
  );

  return <section className="admin-page">
    <header className="admin-page__header"><span>{t('admin.catalog.eyebrow')}</span><h1>{t('admin.catalog.title')}</h1><p>{t('admin.catalog.subtitle')}</p></header>
    {notice && <div className="admin-notice"><strong>{notice}</strong><button onClick={() => setNotice('')}>×</button></div>}
    {error && <InlineAlert title={t('admin.common.operationFailed')} message={error.message} requestId={error.requestId} />}
    <div className="admin-tabs"><button className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')}>{t('admin.catalog.items')}</button><button className={tab === 'copies' ? 'is-active' : ''} onClick={() => setTab('copies')}>{t('admin.catalog.copies')}</button></div>

    {tab === 'items' ? <section className="admin-card">
      <div className="admin-toolbar"><form onSubmit={e => { e.preventDefault(); reload(); }}><input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder={t('admin.catalog.searchItems')} /><select value={itemType} onChange={e => setItemType(e.target.value)}><option value="">{t('admin.common.allTypes')}</option>{ITEM_TYPES.map(v => <option key={v} value={v}>{t(`itemTypes.${v}`)}</option>)}</select><button>{t('admin.common.search')}</button></form><button className="admin-primary-button" onClick={() => setItemDraft(emptyItemDraft())}>+ {t('admin.catalog.addItem')}</button></div>
      {loading ? <div className="admin-empty">{t('admin.common.loading')}</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('admin.catalog.item')}</th><th>{t('admin.catalog.type')}</th><th>{t('admin.catalog.callNumber')}</th><th>{t('admin.common.status')}</th><th>{t('admin.common.actions')}</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong dir="auto">{item.title}</strong></td><td>{t(`itemTypes.${item.type}`)}</td><td>{item.callNumber || '—'}</td><td><AdminStatusBadge tone={itemStatusTone(item)}>{item.isActive ? t('admin.common.active') : t('admin.common.archived')}</AdminStatusBadge></td><td><div className="admin-row-actions"><button onClick={() => editItem(item.id)}>{t('admin.common.edit')}</button><button className={item.isActive ? 'is-danger' : ''} onClick={() => toggleItem(item)}>{item.isActive ? t('admin.common.archive') : t('admin.common.restore')}</button></div></td></tr>)}</tbody></table></div>}
    </section> : <section className="admin-card">
      <div className="admin-toolbar"><form onSubmit={e => { e.preventDefault(); reload(); }}><input value={copySearch} onChange={e => setCopySearch(e.target.value)} placeholder={t('admin.copies.search')} /><select value={copyBranch} onChange={e => setCopyBranch(e.target.value)}><option value="">{t('admin.common.allBranches')}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select value={copyStatus} onChange={e => setCopyStatus(e.target.value)}><option value="">{t('admin.common.allStatuses')}</option>{['AVAILABLE','RESERVED','BORROWED','UNAVAILABLE','DAMAGED','LOST','ARCHIVED'].map(v => <option key={v} value={v}>{t(`admin.copyStatus.${v}`)}</option>)}</select><button>{t('admin.common.search')}</button></form><button className="admin-primary-button" onClick={() => setCopyDraft(emptyCopyDraft())}>+ {t('admin.copies.add')}</button></div>
      {loading ? <div className="admin-empty">{t('admin.common.loading')}</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('admin.catalog.item')}</th><th>{t('admin.copies.identifiers')}</th><th>{t('admin.common.branch')}</th><th>{t('admin.copies.shelf')}</th><th>{t('admin.common.status')}</th><th>{t('admin.common.actions')}</th></tr></thead><tbody>{copies.map(copy => <tr key={copy.id}><td><strong dir="auto">{copy.item.title}</strong></td><td>{copy.barcode || copy.copyCode || '—'}</td><td>{copy.branch.name}</td><td>{copy.shelfLocation || '—'}</td><td><AdminStatusBadge tone={copyStatusTone(copy.status)}>{t(`admin.copyStatus.${copy.status}`)}</AdminStatusBadge></td><td><button onClick={() => setCopyDraft(copyToDraft(copy))}>{t('admin.common.edit')}</button></td></tr>)}</tbody></table></div>}
    </section>}

    {itemDraft && <AdminModal title={itemDraft.id ? t('admin.catalog.editItem') : t('admin.catalog.addItem')} onClose={() => setItemDraft(null)} actions={<><button className="admin-secondary-button" onClick={() => setItemDraft(null)}>{t('admin.common.cancel')}</button><button className="admin-primary-button" form="item-form" type="submit" disabled={saving}>{saving ? t('admin.common.saving') : t('admin.common.save')}</button></>}>
      <form id="item-form" className="admin-form-grid" onSubmit={saveItem}>
        <label><span>{t('admin.catalog.type')}</span><select disabled={!!itemDraft.id} value={itemDraft.type} onChange={e => setItem('type', e.target.value)}>{ITEM_TYPES.map(v => <option key={v} value={v}>{t(`itemTypes.${v}`)}</option>)}</select></label>
        <label className="admin-form-grid__wide"><span>{t('admin.catalog.titleField')}</span><input required value={itemDraft.title} onChange={e => setItem('title', e.target.value)} /></label>
        <label><span>{t('admin.catalog.category')}</span><select value={itemDraft.categoryId} onChange={e => setItem('categoryId', e.target.value)}><option value="">—</option>{categories.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label><span>{t('admin.catalog.dewey')}</span><select value={itemDraft.deweyClassificationId} onChange={e => setItem('deweyClassificationId', e.target.value)}><option value="">—</option>{dewey.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
        <label><span>{t('admin.catalog.callNumber')}</span><input value={itemDraft.callNumber} onChange={e => setItem('callNumber', e.target.value)} /></label>
        <label><span>{t('admin.catalog.language')}</span><input value={itemDraft.language} onChange={e => setItem('language', e.target.value)} /></label>
        <label><span>{t('admin.catalog.publicationYear')}</span><input type="number" min="1000" max="2100" value={itemDraft.publicationYear} onChange={e => setItem('publicationYear', e.target.value)} /></label>
        <label><span>{t('admin.catalog.deweyRaw')}</span><input value={itemDraft.deweyCodeRaw} onChange={e => setItem('deweyCodeRaw', e.target.value)} /></label>
        <label className="admin-form-grid__wide"><span>{t('admin.catalog.abstract')}</span><textarea value={itemDraft.abstract} onChange={e => setItem('abstract', e.target.value)} /></label>
        {itemDraft.type === 'BOOK' ? <><label><span>ISBN</span><input value={itemDraft.isbn} onChange={e => setItem('isbn', e.target.value)} /></label><label><span>{t('admin.catalog.publisher')}</span><input value={itemDraft.publisher} onChange={e => setItem('publisher', e.target.value)} /></label><label><span>{t('admin.catalog.edition')}</span><input value={itemDraft.edition} onChange={e => setItem('edition', e.target.value)} /></label></> : <><label><span>{t('admin.catalog.faculty')}</span><select value={itemDraft.facultyId} onChange={e => { setItem('facultyId', e.target.value); setItem('departmentId', ''); }}><option value="">—</option>{faculties.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>{t('admin.catalog.department')}</span><select value={itemDraft.departmentId} onChange={e => setItem('departmentId', e.target.value)}><option value="">—</option>{filteredDepartments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>{t('admin.catalog.academicYear')}</span><input value={itemDraft.academicYear} onChange={e => setItem('academicYear', e.target.value)} /></label></>}
      </form>
    </AdminModal>}

    {copyDraft && <AdminModal title={copyDraft.id ? t('admin.copies.edit') : t('admin.copies.add')} onClose={() => setCopyDraft(null)} actions={<><button className="admin-secondary-button" onClick={() => setCopyDraft(null)}>{t('admin.common.cancel')}</button><button className="admin-primary-button" form="copy-form" type="submit" disabled={saving}>{saving ? t('admin.common.saving') : t('admin.common.save')}</button></>}>
      <form id="copy-form" className="admin-form-grid" onSubmit={saveCopy}>
        <label className="admin-form-grid__wide"><span>{t('admin.catalog.item')}</span><select required disabled={!!copyDraft.id} value={copyDraft.itemId} onChange={e => setCopy('itemId', e.target.value)}><option value="">—</option>{items.filter(i => i.isActive).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
        <label><span>{t('admin.common.branch')}</span><select required disabled={copyCirculationManaged} value={copyDraft.branchId} onChange={e => setCopy('branchId', e.target.value)}><option value="">—</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label><span>{t('admin.copies.status')}</span><select disabled={copyCirculationManaged} value={copyDraft.status} onChange={e => setCopy('status', e.target.value)}>{copyCirculationManaged ? <option value={copyDraft.status}>{t(`admin.copyStatus.${copyDraft.status}`)}</option> : COPY_STATUSES.map(v => <option key={v} value={v}>{t(`admin.copyStatus.${v}`)}</option>)}</select></label>
        {copyCirculationManaged && <p className="admin-form-grid__wide admin-managed-copy-note">{t('release.copyCirculationManaged')}</p>}
        <label><span>{t('admin.copies.copyCode')}</span><input value={copyDraft.copyCode} onChange={e => setCopy('copyCode', e.target.value)} /></label>
        <label><span>{t('admin.copies.barcode')}</span><input value={copyDraft.barcode} onChange={e => setCopy('barcode', e.target.value)} /></label>
        <label><span>{t('admin.copies.shelf')}</span><input value={copyDraft.shelfLocation} onChange={e => setCopy('shelfLocation', e.target.value)} /></label>
        <label><span>{t('admin.copies.condition')}</span><select value={copyDraft.condition} onChange={e => setCopy('condition', e.target.value)}>{COPY_CONDITIONS.map(v => <option key={v} value={v}>{t(`admin.copyCondition.${v}`)}</option>)}</select></label>
      </form>
    </AdminModal>}
  </section>;
}
