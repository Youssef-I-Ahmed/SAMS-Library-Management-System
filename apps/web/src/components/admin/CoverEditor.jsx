import { useEffect, useRef, useState } from 'react';
import { BookCover } from '../discovery/BookCover';
import { InlineAlert } from '../ui/InlineAlert';
import { removeCover, uploadCover } from '../../features/admin/admin-api';
import { useLanguage } from '../../hooks/useLanguage';

const MAX_BYTES = 3 * 1024 * 1024;

/** A cover chosen for an item that is not saved yet; it is uploaded right after the item is created. */
function PendingCover({ file, onPick }) {
  const { t } = useLanguage();
  const input = useRef(null);
  const [error, setError] = useState(null);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) { setUrl(null); return undefined; }
    const next = URL.createObjectURL(file); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  function pick(event) {
    const next = event.target.files?.[0];
    if (input.current) input.current.value = '';
    if (!next) return;
    const problem = checkFile(next, t);
    setError(problem ? { message: problem } : null);
    if (!problem) onPick(next);
  }
  return (
    <div className="admin-form-grid__wide cover-editor">
      <div className="discovery-cover discovery-cover--book cover-editor__pending">
        {url ? <img src={url} width="180" height="240" alt="" /> : <span aria-hidden="true">📖</span>}
      </div>
      <div className="cover-editor__body">
        <strong>{t('admin.cover.title')}</strong>
        <small>{file ? t('admin.cover.pending') : t('admin.cover.none')}</small>
        <div className="cover-editor__actions">
          <label className="admin-secondary-button cover-editor__upload">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} />
            {file ? t('admin.cover.replace') : t('admin.cover.upload')}
          </label>
          {file && <button type="button" className="admin-secondary-button" onClick={() => onPick(null)}>{t('admin.cover.remove')}</button>}
        </div>
        <small>{t('admin.cover.pendingHint')}</small>
        {error && <InlineAlert title={t('admin.cover.failed')} message={error.message} />}
      </div>
    </div>
  );
}

function checkFile(file, t) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return t('admin.cover.badType');
  if (file.size > MAX_BYTES) return t('admin.cover.tooLarge');
  return null;
}

/**
 * Upload, replace or remove an item's cover. For a saved item changes save
 * immediately; for a new item the file is kept until the item is created.
 */
export function CoverEditor({ token, item, onChange, pendingFile, onPendingChange }) {
  if (!item.id) return <PendingCover file={pendingFile} onPick={onPendingChange} />;
  return <SavedCover token={token} item={item} onChange={onChange} />;
}

function SavedCover({ token, item, onChange }) {
  const { t } = useLanguage();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(work) {
    setBusy(true); setError(null);
    try { const { data } = await work(); onChange(data.cover); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  function pick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const problem = checkFile(file, t);
    if (problem) { setError({ message: problem }); return; }
    run(() => uploadCover(token, item.id, file));
  }

  const source = item.cover?.source;
  return (
    <div className="admin-form-grid__wide cover-editor">
      <BookCover item={item} />
      <div className="cover-editor__body">
        <strong>{t('admin.cover.title')}</strong>
        <small>{source === 'UPLOAD' ? t('admin.cover.uploaded') : source === 'OPEN_LIBRARY' ? t('admin.cover.openLibrary') : t('admin.cover.none')}</small>
        <div className="cover-editor__actions">
          <label className="admin-secondary-button cover-editor__upload">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={pick} />
            {busy ? t('admin.cover.saving') : source === 'UPLOAD' ? t('admin.cover.replace') : t('admin.cover.upload')}
          </label>
          {source === 'UPLOAD' && <button type="button" className="admin-secondary-button" disabled={busy}
            onClick={() => run(() => removeCover(token, item.id))}>{t('admin.cover.remove')}</button>}
        </div>
        <small>{t('admin.cover.hint')}</small>
        {error && <InlineAlert title={t('admin.cover.failed')} message={error.message} requestId={error.requestId} />}
      </div>
    </div>
  );
}
