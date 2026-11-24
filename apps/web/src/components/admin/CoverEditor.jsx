import { useRef, useState } from 'react';
import { BookCover } from '../discovery/BookCover';
import { InlineAlert } from '../ui/InlineAlert';
import { removeCover, uploadCover } from '../../features/admin/admin-api';
import { useLanguage } from '../../hooks/useLanguage';

const MAX_BYTES = 3 * 1024 * 1024;

/** Upload, replace or remove an item's cover. Changes save immediately. */
export function CoverEditor({ token, item, onChange }) {
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
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError({ message: t('admin.cover.badType') }); return; }
    if (file.size > MAX_BYTES) { setError({ message: t('admin.cover.tooLarge') }); return; }
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
