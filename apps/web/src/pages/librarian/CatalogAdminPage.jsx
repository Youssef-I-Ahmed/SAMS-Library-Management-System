import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { AdminReadState, AdminPagination } from '../../components/admin/AdminReadState';
import { CatalogRecovery } from '../../components/admin/CatalogRecovery';
import { CopyItemLookup } from '../../components/admin/CopyItemLookup';
import { AiCatalogSuggestions } from '../../components/admin/AiCatalogSuggestions';
import { useCatalogWorkflow } from '../../features/admin/use-catalog-workflow';
import { useStaffRead } from '../../features/staff/use-staff-circulation';
import '../../styles/admin-operations.css';
import { AdminModal } from '../../components/admin/AdminModal';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import {
  getCatalogItem, listBranches, listCatalogItems,
  listCategories, listCopies, listDepartments, listDewey, listFaculties, listSubjects
} from '../../features/admin/admin-api';
import {
  adminItemTypeLabel, COPY_CONDITIONS, COPY_STATUSES, ITEM_TYPES, copyStatusTone, copyToDraft,
  emptyCopyDraft, emptyItemDraft, itemStatusTone, itemToDraft
} from '../../features/admin/admin-format';
import { getCategoryLabel } from '../../features/discovery/discovery-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

const loadLookups = async (token, filters, signal) => {
  const [categories, dewey, faculties, departments, branches] = await Promise.all([
    listCategories(token, signal), listDewey(token, signal), listFaculties(token, signal), listDepartments(token, signal), listBranches(token, signal)
  ]);
  return { data: [{ categories: categories.data, dewey: dewey.data, faculties: faculties.data, departments: departments.data, branches: branches.data }] };
};
const loadSubjects = (token, filters, signal) => listSubjects(token, signal);

export function CatalogAdminPage() {
  const auth = useAuth(); const { t } = useLanguage();
  const [tab, setTab] = useState('items');
  const [itemSearch, setItemSearch] = useState(''); const [copySearch, setCopySearch] = useState('');
  const [itemFilters, setItemFilters] = useState({ search: '', type: '', includeInactive: true, page: 1, pageSize: 20 });
  const [copyFilters, setCopyFilters] = useState({ search: '', branchId: '', status: '', page: 1, pageSize: 20 });
  const itemType = itemFilters.type, copyStatus = copyFilters.status, copyBranch = copyFilters.branchId;
  const itemRead = useStaffRead(listCatalogItems, auth.token, itemFilters, tab === 'items', false);
  const copyRead = useStaffRead(listCopies, auth.token, copyFilters, tab === 'copies', false);
  const read = tab === 'items' ? itemRead : copyRead;
  const items = itemRead.result?.data || [], copies = copyRead.result?.data || [];
  const loading = read.loading;
  const lookups = useStaffRead(loadLookups, auth.token, {}, true, false);
  const { categories = [], dewey = [], faculties = [], departments = [], branches = [] } = lookups.result?.data[0] || {};
  const [itemDraft, setItemDraft] = useState(null); const [copyDraft, setCopyDraft] = useState(null);
  const [lookupValid, setLookupValid] = useState(false);
  const [modal, setModal] = useState(null); const [toggleTarget, setToggleTarget] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false); const [editorError, setEditorError] = useState(null);
  const editRequest = useRef(null);
  const flow = useCatalogWorkflow(auth.user.id, auth.token);
  const saving = flow.busy;
  const editsSubjects = itemDraft?.type === 'ACADEMIC_WORK';
  const subjectRead = useStaffRead(loadSubjects, auth.token, {}, modal === 'item' && editsSubjects, false);
  const subjects = subjectRead.result?.data;
  const filteredDepartments = useMemo(() => itemDraft?.facultyId ? departments.filter(d => d.facultyId === itemDraft.facultyId) : departments, [departments, itemDraft?.facultyId]);
  const journal = flow.journal;
  const lockedRecovery = journal && ['uncertain', 'conflict'].includes(journal.state);
  const baseLocked = Boolean(journal?.base);
  const blocked = saving || Boolean(journal) || read.loading || Boolean(read.error);
  const cannotSave = saving || lockedRecovery || editorLoading || Boolean(editorError) || lookups.loading || Boolean(lookups.error) || (editsSubjects && (subjectRead.loading || subjectRead.error));
  const lastOutcome = useRef(null);
  useEffect(() => {
    if (!flow.outcome || lastOutcome.current === flow.outcome) return;
    lastOutcome.current = flow.outcome;
    setModal(null); setItemDraft(null); setCopyDraft(null); setToggleTarget(null);
    read.reload();
    const frame = requestAnimationFrame(() => document.querySelector('.catalog-admin h1')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [flow.outcome]);
  useEffect(() => () => editRequest.current?.abort(), []);
  useEffect(() => {
    if (journal?.base && journal.kind === 'item') setItemDraft(current => current && ({ ...current, id: journal.base.id, version: journal.base.version }));
  }, [journal?.base]);
  useEffect(() => { if (journal && journal.state !== 'pending' && read.result) read.reload(); }, [journal?.state]);
  function closeEditor() {
    if (flow.isBusy()) return;
    editRequest.current?.abort(); setEditorLoading(false); setModal(null); if (journal) read.reload();
  }
  function resume() {
    if (!journal || saving) return;
    if (journal.kind === 'item') setItemDraft(journal.draft);
    else if (journal.kind === 'copy') setCopyDraft(journal.draft);
    else setToggleTarget(journal.draft);
    setEditorError(null); setModal(journal.kind);
  }
  async function editItem(id) {
    if (saving || journal) return;
    editRequest.current?.abort(); const controller = new AbortController(); editRequest.current = controller;
    setModal('item'); setItemDraft({ ...emptyItemDraft(), id }); setEditorLoading(true); setEditorError(null);
    try { const response = await getCatalogItem(auth.token, id, controller.signal); if (!controller.signal.aborted) setItemDraft(itemToDraft(response.data)); }
    catch (error) { if (!controller.signal.aborted) setEditorError(error); }
    finally { if (!controller.signal.aborted) setEditorLoading(false); }
  }
  function setItem(key, value) { setItemDraft(v => ({ ...v, [key]: value })); }
  function setCopy(key, value) { setCopyDraft(v => ({ ...v, [key]: value })); }
  function saveItem(event) {
    event.preventDefault(); if (!itemDraft || cannotSave) return;
    flow.save('item', itemDraft);
  }
  function saveCopy(event) {
    event.preventDefault(); if (!copyDraft || cannotSave || !copyDraft.itemId || !copyDraft.branchId || !copyDraft.id && !lookupValid) return;
    flow.save('copy', copyDraft);
  }
  function acceptServer() {
    const record = flow.acceptServer(); if (!record) return;
    if (modal === 'item') setItemDraft(itemToDraft(record));
    else if (modal === 'copy') setCopyDraft({ ...copyToDraft(record), itemTitle: record.item.title });
    else { setToggleTarget(null); setModal(null); }
    read.reload();
  }
  const recovery = <CatalogRecovery flow={flow} onAccept={acceptServer} canVerify={!read.loading && !read.error && Boolean(read.result)} onClear={() => { flow.clearVerified(); closeEditor(); read.reload(); }} />;
  const copyCirculationManaged = Boolean(
    copyDraft?.id &&
    ['RESERVED', 'BORROWED'].includes(copyDraft.originalStatus)
  );

  return <section className="admin-page admin-operations catalog-admin">
    <header className="admin-page__header"><span>{t('admin.catalog.eyebrow')}</span><h1 tabIndex={-1}>{t('admin.catalog.title')}</h1><p>{t('admin.catalog.subtitle')}</p></header>
    {flow.outcome && <div className="admin-notice" role="status"><strong>{t('admin.workflows.confirmed')}: <bdi>{flow.outcome.record.id}</bdi> · {t('admin.workflows.version')} <bdi>{flow.outcome.record.version}</bdi>{flow.outcome.kind === 'copy' && ` · ${t(`admin.copyStatus.${flow.outcome.record.status}`)}`}{flow.outcome.kind === 'toggle' && ` · ${t(flow.outcome.record.isActive ? 'admin.common.active' : 'admin.common.archived')}`}</strong><button type="button" aria-label={t('admin.workflows.dismiss')} onClick={flow.dismissOutcome}>×</button></div>}
    {journal && !modal && <div className="catalog-recovery-banner" role="status"><p>{t('admin.workflows.unfinished')}</p><button type="button" className="admin-secondary-button" disabled={saving} onClick={resume}>{t('admin.workflows.resume')}</button></div>}
    {!modal && lookups.error && <AdminReadState read={lookups} compact label={t('admin.workflows.formOptions')} />}
    <div className="admin-tabs"><button type="button" disabled={saving} aria-pressed={tab === 'items'} className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')}>{t('admin.catalog.items')}</button><button type="button" disabled={saving} aria-pressed={tab === 'copies'} className={tab === 'copies' ? 'is-active' : ''} onClick={() => setTab('copies')}>{t('admin.catalog.copies')}</button></div>

    {tab === 'items' ? <section className="admin-card">
      <div className="admin-toolbar"><form onSubmit={e => { e.preventDefault(); if (tab === 'items') { if (itemFilters.page === 1 && itemFilters.search === itemSearch.trim()) itemRead.reload(); else setItemFilters(v => ({ ...v, search: itemSearch.trim(), page: 1 })); } else { if (copyFilters.page === 1 && copyFilters.search === copySearch.trim()) copyRead.reload(); else setCopyFilters(v => ({ ...v, search: copySearch.trim(), page: 1 })); } }}><input aria-label={t('admin.catalog.searchItems')} maxLength={300} value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder={t('admin.catalog.searchItems')} /><select aria-label={t('admin.catalog.type')} value={itemType} onChange={e => setItemFilters(v => ({ ...v, type: e.target.value, page: 1 }))}><option value="">{t('admin.common.allTypes')}</option>{ITEM_TYPES.map(v => <option key={v} value={v}>{adminItemTypeLabel(v, t)}</option>)}</select><button>{t('admin.common.search')}</button></form><button className="admin-primary-button" disabled={saving || Boolean(journal)} onClick={() => { setEditorError(null); setItemDraft(emptyItemDraft()); setModal('item'); }}>+ {t('admin.catalog.addItem')}</button><Link className="admin-secondary-button" to="/librarian/catalog/transfer">{t('admin.transfer.open')}</Link></div>
      <AdminReadState read={read} hintId="catalog-table-hint" />
      {loading && !read.result ? <div className="admin-empty">{t('admin.common.loading')}</div> : !read.result || read.error && !read.result.data.length ? null : !read.result.data.length ? <div className="admin-empty">{t(tab === 'items' ? 'admin.workflows.emptyItems' : 'admin.workflows.emptyCopies')}</div> : <div className="admin-table-wrap" aria-describedby="catalog-table-hint" tabIndex={0} role="region" aria-label={t(tab === 'items' ? 'admin.catalog.items' : 'admin.catalog.copies')}><table className="admin-table" aria-label={t(tab === 'items' ? 'admin.catalog.items' : 'admin.catalog.copies')}><thead><tr><th scope="col">{t('admin.catalog.item')}</th><th scope="col">{t('admin.catalog.type')}</th><th scope="col">{t('admin.catalog.callNumber')}</th><th scope="col">{t('admin.common.status')}</th><th scope="col">{t('admin.common.actions')}</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong dir="auto">{item.title}</strong></td><td>{adminItemTypeLabel(item.type, t)}</td><td><bdi>{item.callNumber || '—'}</bdi></td><td><AdminStatusBadge tone={itemStatusTone(item)}>{item.isActive ? t('admin.common.active') : t('admin.common.archived')}</AdminStatusBadge></td><td><div className="admin-row-actions"><button disabled={blocked} onClick={() => editItem(item.id)}>{t('admin.common.edit')}</button><button className={item.isActive ? 'is-danger' : ''} disabled={blocked} onClick={() => { setToggleTarget(item); setModal('toggle'); }}>{item.isActive ? t('admin.common.archive') : t('admin.common.restore')}</button></div></td></tr>)}</tbody></table></div>}
      <AdminPagination read={read} disabled={saving} onPage={page => setItemFilters(v => ({ ...v, page }))} />
    </section> : <section className="admin-card">
      <div className="admin-toolbar"><form onSubmit={e => { e.preventDefault(); if (tab === 'items') { if (itemFilters.page === 1 && itemFilters.search === itemSearch.trim()) itemRead.reload(); else setItemFilters(v => ({ ...v, search: itemSearch.trim(), page: 1 })); } else { if (copyFilters.page === 1 && copyFilters.search === copySearch.trim()) copyRead.reload(); else setCopyFilters(v => ({ ...v, search: copySearch.trim(), page: 1 })); } }}><input aria-label={t('admin.copies.search')} maxLength={300} value={copySearch} onChange={e => setCopySearch(e.target.value)} placeholder={t('admin.copies.search')} /><select aria-label={t('admin.common.branch')} value={copyBranch} onChange={e => setCopyFilters(v => ({ ...v, branchId: e.target.value, page: 1 }))}><option value="">{t('admin.common.allBranches')}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select aria-label={t('admin.copies.status')} value={copyStatus} onChange={e => setCopyFilters(v => ({ ...v, status: e.target.value, page: 1 }))}><option value="">{t('admin.common.allStatuses')}</option>{['AVAILABLE','RESERVED','BORROWED','UNAVAILABLE','DAMAGED','LOST','ARCHIVED'].map(v => <option key={v} value={v}>{t(`admin.copyStatus.${v}`)}</option>)}</select><button>{t('admin.common.search')}</button></form><button className="admin-primary-button" disabled={saving || Boolean(journal)} onClick={() => { setEditorError(null); setCopyDraft(emptyCopyDraft()); setModal('copy'); }}>+ {t('admin.copies.add')}</button></div>
      <AdminReadState read={read} hintId="catalog-table-hint" />
      {loading && !read.result ? <div className="admin-empty">{t('admin.common.loading')}</div> : !read.result || read.error && !read.result.data.length ? null : !read.result.data.length ? <div className="admin-empty">{t(tab === 'items' ? 'admin.workflows.emptyItems' : 'admin.workflows.emptyCopies')}</div> : <div className="admin-table-wrap" aria-describedby="catalog-table-hint" tabIndex={0} role="region" aria-label={t(tab === 'items' ? 'admin.catalog.items' : 'admin.catalog.copies')}><table className="admin-table" aria-label={t(tab === 'items' ? 'admin.catalog.items' : 'admin.catalog.copies')}><thead><tr><th scope="col">{t('admin.catalog.item')}</th><th scope="col">{t('admin.copies.identifiers')}</th><th scope="col">{t('admin.common.branch')}</th><th scope="col">{t('admin.copies.shelf')}</th><th scope="col">{t('admin.common.status')}</th><th scope="col">{t('admin.common.actions')}</th></tr></thead><tbody>{copies.map(copy => <tr key={copy.id}><td><strong dir="auto">{copy.item.title}</strong></td><td><bdi>{copy.barcode || copy.copyCode || '—'}</bdi></td><td>{copy.branch.name}</td><td>{copy.shelfLocation || '—'}</td><td><AdminStatusBadge tone={copyStatusTone(copy.status)}>{t(`admin.copyStatus.${copy.status}`)}</AdminStatusBadge></td><td><button disabled={blocked} onClick={() => { setEditorError(null); setCopyDraft({ ...copyToDraft(copy), itemTitle: copy.item.title }); setModal('copy'); }}>{t('admin.common.edit')}</button></td></tr>)}</tbody></table></div>}
      <AdminPagination read={read} disabled={saving} onPage={page => setCopyFilters(v => ({ ...v, page }))} />
    </section>}

    {modal === 'item' && itemDraft && <AdminModal title={itemDraft.id ? t('admin.catalog.editItem') : t('admin.catalog.addItem')} canClose={!saving} onClose={closeEditor} actions={<><button className="admin-secondary-button" disabled={saving} onClick={closeEditor}>{t('admin.common.cancel')}</button><button className="admin-primary-button" form="item-form" type="submit" disabled={cannotSave}>{saving ? t(flow.checking ? 'admin.common.loading' : 'admin.common.saving') : t(baseLocked && modal === 'item' ? 'admin.workflows.saveRemaining' : 'admin.common.save')}</button></>}>
      {recovery}
      <AdminReadState read={lookups} compact label={t('admin.workflows.formOptions')} />
      {editsSubjects && <AdminReadState read={subjectRead} compact label={t('discovery.detail.subjects')} />}
      {editorLoading && <p role="status">{t('admin.common.loading')}</p>}
      {editorError && <><InlineAlert title={t('admin.workflows.readFailed')} message={editorError.message} requestId={editorError.requestId} /><button type="button" className="admin-secondary-button" onClick={() => editItem(itemDraft.id)}>{t('admin.workflows.retry')}</button></>}
      <form id="item-form" onSubmit={saveItem}><fieldset disabled={saving || lockedRecovery || editorLoading || Boolean(editorError)} className="admin-form-grid">
      <fieldset disabled={baseLocked} className="admin-form-grid admin-form-grid__wide catalog-base-fields"><legend>{t('admin.workflows.baseFields')}</legend>
        <label><span>{t('admin.catalog.type')}</span><select disabled={!!itemDraft.id} value={itemDraft.type} onChange={e => setItem('type', e.target.value)}>{[...new Set([...ITEM_TYPES, itemDraft.type])].map(v => <option key={v} value={v}>{adminItemTypeLabel(v, t)}</option>)}</select></label>
        <label className="admin-form-grid__wide"><span>{t('admin.catalog.titleField')}</span><input required value={itemDraft.title} onChange={e => setItem('title', e.target.value)} /></label>
        <AiCatalogSuggestions token={auth.token} title={itemDraft.title} subjects={editsSubjects ? subjects : null}
          onSelectSubject={(id) => setItem('subjectIds', [...new Set([...(itemDraft.subjectIds || []), id])])} />
        <label><span>{t('admin.catalog.category')}</span><select value={itemDraft.categoryId} onChange={e => setItem('categoryId', e.target.value)}><option value="">—</option>{categories.map(x => <option key={x.id} value={x.id}>{getCategoryLabel(x.name, t)}</option>)}</select></label>
        <label><span>{t('admin.catalog.dewey')}</span><select value={itemDraft.deweyClassificationId} onChange={e => setItem('deweyClassificationId', e.target.value)}><option value="">—</option>{dewey.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
        <label><span>{t('admin.catalog.callNumber')}</span><input value={itemDraft.callNumber} onChange={e => setItem('callNumber', e.target.value)} /></label>
        <label><span>{t('admin.catalog.language')}</span><input value={itemDraft.language} onChange={e => setItem('language', e.target.value)} /></label>
        <label><span>{t('admin.catalog.publicationYear')}</span><input type="number" min="1000" max="2100" value={itemDraft.publicationYear} onChange={e => setItem('publicationYear', e.target.value)} /></label>
        <label><span>{t('admin.catalog.deweyRaw')}</span><input value={itemDraft.deweyCodeRaw} onChange={e => setItem('deweyCodeRaw', e.target.value)} /></label>
        <label className="admin-form-grid__wide"><span>{t('admin.catalog.abstract')}</span><textarea value={itemDraft.abstract} onChange={e => setItem('abstract', e.target.value)} /></label>
        </fieldset>
        {itemDraft.type === 'BOOK' ? <><label><span>ISBN</span><input value={itemDraft.isbn} onChange={e => setItem('isbn', e.target.value)} /></label><label><span>{t('admin.catalog.publisher')}</span><input value={itemDraft.publisher} onChange={e => setItem('publisher', e.target.value)} /></label><label><span>{t('admin.catalog.edition')}</span><input value={itemDraft.edition} onChange={e => setItem('edition', e.target.value)} /></label></> : <><label><span>{t('admin.catalog.faculty')}</span><select value={itemDraft.facultyId} onChange={e => { setItem('facultyId', e.target.value); setItem('departmentId', ''); }}><option value="">—</option>{faculties.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>{t('admin.catalog.department')}</span><select value={itemDraft.departmentId} onChange={e => setItem('departmentId', e.target.value)}><option value="">—</option>{filteredDepartments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>{t('admin.catalog.academicYear')}</span><input value={itemDraft.academicYear} onChange={e => setItem('academicYear', e.target.value)} /></label></>}
        {editsSubjects && subjects && <label className="admin-form-grid__wide">
          <span>{t('discovery.detail.subjects')}</span>
          <select multiple size={Math.min(5, Math.max(2, subjects.length))} value={itemDraft.subjectIds}
            onChange={(event) => setItem('subjectIds', Array.from(event.target.selectedOptions, (option) => option.value))}>
            {subjects.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>}
      </fieldset></form>
    </AdminModal>}

    {modal === 'copy' && copyDraft && <AdminModal title={copyDraft.id ? t('admin.copies.edit') : t('admin.copies.add')} canClose={!saving} onClose={closeEditor} actions={<><button className="admin-secondary-button" disabled={saving} onClick={closeEditor}>{t('admin.common.cancel')}</button><button className="admin-primary-button" form="copy-form" type="submit" disabled={cannotSave || !copyDraft.itemId || !copyDraft.id && !lookupValid}>{saving ? t(flow.checking ? 'admin.common.loading' : 'admin.common.saving') : t(baseLocked && modal === 'item' ? 'admin.workflows.saveRemaining' : 'admin.common.save')}</button></>}>
      {recovery}
      <AdminReadState read={lookups} compact label={t('admin.workflows.formOptions')} />
      {!copyDraft.id && <CopyItemLookup selectedId={copyDraft.itemId} disabled={saving || Boolean(lockedRecovery)} onValidityChange={setLookupValid} onSelect={item => { setCopy('itemId', item?.id || ''); setCopy('itemTitle', item?.title || ''); }} />}
      <form id="copy-form" onSubmit={saveCopy}><fieldset disabled={saving || lockedRecovery} className="admin-form-grid">
        <div className="admin-form-grid__wide catalog-selected-item"><strong>{t('admin.catalog.item')}</strong><span dir="auto">{copyDraft.itemTitle || '—'}</span><small><bdi>{copyDraft.itemId || t('admin.workflows.selectItem')}</bdi></small></div>
        <label><span>{t('admin.common.branch')}</span><select required disabled={copyCirculationManaged} value={copyDraft.branchId} onChange={e => setCopy('branchId', e.target.value)}><option value="">—</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label><span>{t('admin.copies.status')}</span><select disabled={copyCirculationManaged} value={copyDraft.status} onChange={e => setCopy('status', e.target.value)}>{copyCirculationManaged ? <option value={copyDraft.status}>{t(`admin.copyStatus.${copyDraft.status}`)}</option> : COPY_STATUSES.map(v => <option key={v} value={v}>{t(`admin.copyStatus.${v}`)}</option>)}</select></label>
        {copyCirculationManaged && <p className="admin-form-grid__wide admin-managed-copy-note">{t('release.copyCirculationManaged')}</p>}
        <label><span>{t('admin.copies.copyCode')}</span><input value={copyDraft.copyCode} onChange={e => setCopy('copyCode', e.target.value)} /></label>
        <label><span>{t('admin.copies.barcode')}</span><input value={copyDraft.barcode} onChange={e => setCopy('barcode', e.target.value)} /></label>
        <label><span>{t('admin.copies.shelf')}</span><input value={copyDraft.shelfLocation} onChange={e => setCopy('shelfLocation', e.target.value)} /></label>
        <label><span>{t('admin.copies.condition')}</span><select value={copyDraft.condition} onChange={e => setCopy('condition', e.target.value)}>{COPY_CONDITIONS.map(v => <option key={v} value={v}>{t(`admin.copyCondition.${v}`)}</option>)}</select></label>
      </fieldset></form>
    </AdminModal>}
    {modal === 'toggle' && toggleTarget && <AdminModal title={t(toggleTarget.isActive ? 'admin.workflows.confirmArchive' : 'admin.workflows.confirmRestore')} canClose={!saving} onClose={closeEditor} actions={<><button type="button" className="admin-secondary-button" disabled={saving} onClick={closeEditor}>{t('admin.common.cancel')}</button><button type="button" className="admin-primary-button" disabled={saving || Boolean(lockedRecovery)} onClick={() => flow.save('toggle', toggleTarget)}>{t(saving ? 'admin.common.saving' : toggleTarget.isActive ? 'admin.common.archive' : 'admin.common.restore')}</button></>}>
      {recovery}<p dir="auto">{toggleTarget.title}</p><p>{t('admin.workflows.archiveHelp')}</p>
    </AdminModal>}
  </section>;
}
