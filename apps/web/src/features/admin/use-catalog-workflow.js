import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { createCatalogItem, updateCatalogItem, putBookDetails, putAcademicWorkDetails,
  createCopy, updateCopy, getCatalogItem, getCopy } from './admin-api';

const stores = new Map();
const uncertain = (error) => !error.status || error.status >= 500 || error.status === 408;
const errorData = (error) => ({ message: error.message, status: error.status, code: error.code, requestId: error.requestId });
function getStore(userId) {
  if (!stores.has(userId)) {
    const key = `sams.catalog-recovery.v1:${userId}`;
    let journal = null, storageAvailable = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved && ['item', 'copy', 'toggle'].includes(saved.kind) && saved.draft && saved.stage) {
        journal = { ...saved, state: saved.state === 'pending' ? 'uncertain' : saved.state };
      }
    } catch { storageAvailable = false; }
    stores.set(userId, { key, listeners: new Set(), snapshot: { journal, busy: false, outcome: null, storageAvailable } });
  }
  return stores.get(userId);
}
function publish(store, patch) {
  store.snapshot = { ...store.snapshot, ...patch };
  try {
    if (store.snapshot.journal) sessionStorage.setItem(store.key, JSON.stringify(store.snapshot.journal));
    else sessionStorage.removeItem(store.key);
  } catch { store.snapshot = { ...store.snapshot, storageAvailable: false }; }
  store.listeners.forEach((listener) => listener());
}
function confirmed(response) {
  if (!response?.data?.id || !Number.isInteger(response.data.version)) {
    const error = new Error('Unconfirmed save response');
    error.observedId = response?.data?.id;
    throw error;
  }
  return response.data;
}
export function itemBasePayload(draft) {
  return { title: draft.title.trim(), categoryId: draft.categoryId || null,
    deweyClassificationId: draft.deweyClassificationId || null, deweyCodeRaw: draft.deweyCodeRaw.trim() || null,
    callNumber: draft.callNumber.trim() || null, language: draft.language.trim() || null,
    publicationYear: draft.publicationYear === '' ? null : Number(draft.publicationYear), abstract: draft.abstract.trim() || null };
}
function itemDetailsPayload(draft, version) {
  return draft.type === 'BOOK'
    ? { version, isbn: draft.isbn.trim() || null, publisher: draft.publisher.trim() || null, edition: draft.edition.trim() || null }
    : { version, facultyId: draft.facultyId || null, departmentId: draft.departmentId || null,
      academicYear: draft.academicYear.trim() || null, ...(draft.type === 'ACADEMIC_WORK' ? { subjectIds: draft.subjectIds } : {}) };
}
function copyPayload(draft) {
  const editable = { copyCode: draft.copyCode.trim() || null, barcode: draft.barcode.trim() || null,
    shelfLocation: draft.shelfLocation.trim() || null, condition: draft.condition || null };
  return draft.id ? { version: draft.version, ...editable,
    ...(draft.branchId !== draft.originalBranchId ? { branchId: draft.branchId } : {}),
    ...(draft.status !== draft.originalStatus ? { status: draft.status } : {}) }
    : { itemId: draft.itemId, branchId: draft.branchId, status: draft.status, ...editable };
}

// Retain each confirmed step. This is recovery bookkeeping, not an atomic save.
// A write is never retried automatically. Pending journals survive a tab refresh.
export function useCatalogWorkflow(userId, token) {
  const store = getStore(userId);
  const subscribe = useCallback((listener) => { store.listeners.add(listener); return () => store.listeners.delete(listener); }, [store]);
  const snapshot = useSyncExternalStore(subscribe, () => store.snapshot);
  useEffect(() => {
    if (!snapshot.journal) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [snapshot.journal]);

  async function save(kind, draft) {
    const previous = store.snapshot.journal;
    if (store.snapshot.busy || previous && (previous.kind !== kind || ['uncertain', 'conflict'].includes(previous.state))) return;
    let journal = { ...(previous || { kind, stage: kind === 'item' ? 'base' : kind }), draft: { ...draft }, state: 'pending', error: null, serverRecord: null, readError: null };
    publish(store, { busy: true, journal, outcome: null });
    try {
      let record;
      if (kind === 'item') {
        if (journal.stage === 'base') {
          const base = itemBasePayload(draft);
          record = confirmed(await (draft.id
            ? updateCatalogItem(token, draft.id, { version: draft.version, ...base, isActive: draft.isActive })
            : createCatalogItem(token, { type: draft.type, ...base })));
          journal = { ...journal, base: record, stage: 'details', draft: { ...draft, id: record.id, version: record.version } };
          publish(store, { journal });
        }
        const payload = itemDetailsPayload(draft, journal.base.version);
        record = confirmed(await (draft.type === 'BOOK'
          ? putBookDetails(token, journal.base.id, payload)
          : putAcademicWorkDetails(token, journal.base.id, payload)));
      } else if (kind === 'copy') {
        record = confirmed(await (draft.id ? updateCopy(token, draft.id, copyPayload(draft)) : createCopy(token, copyPayload(draft))));
      } else {
        record = confirmed(await updateCatalogItem(token, draft.id, { version: draft.version, isActive: !draft.isActive }));
      }
      publish(store, { journal: null, outcome: { kind, record }, busy: false });
    } catch (error) {
      publish(store, { busy: false, journal: { ...journal, observedId: error.observedId,
        state: uncertain(error) ? 'uncertain' : error.status === 409 && (journal.base || journal.draft.id) ? 'conflict' : 'failed', error: errorData(error) } });
    }
  }
  async function reconcile() {
    const journal = store.snapshot.journal;
    const id = journal?.base?.id || journal?.draft.id || journal?.observedId;
    if (!id || store.snapshot.busy) return;
    publish(store, { busy: true });
    try {
      const record = confirmed(await (journal.kind === 'copy' ? getCopy(token, id) : getCatalogItem(token, id)));
      publish(store, { journal: { ...journal, serverRecord: record, readError: null }, busy: false });
    } catch (error) {
      publish(store, { journal: { ...journal, readError: errorData(error) }, busy: false });
    }
  }
  return { ...snapshot, save, reconcile, isBusy: () => store.snapshot.busy,
    checking: snapshot.busy && snapshot.journal?.state !== 'pending',
    // These are explicit review/discard actions, never a mutation retry.
    acceptServer: () => { const record = store.snapshot.journal?.serverRecord; if (record && !store.snapshot.busy) { publish(store, { journal: null }); return record; } },
    clearVerified: () => { if (!store.snapshot.busy) publish(store, { journal: null }); },
    dismissOutcome: () => publish(store, { outcome: null })
  };
}
