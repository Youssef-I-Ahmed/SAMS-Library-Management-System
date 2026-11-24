import { useCallback, useEffect, useState } from 'react';
import { AdminModal } from '../../components/admin/AdminModal';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { createLibrarian, listLibrarians, listPermissionGroups, updateLibrarian } from '../../features/admin/admin-api';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/admin-operations.css';

function PermissionChecklist({ groups, value, onChange, disabled }) {
  const { t } = useLanguage();
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <fieldset className="staff-permissions" disabled={disabled}>
      <legend>{t('staffAdmin.permissions')}</legend>
      <div className="staff-permissions__actions">
        <button type="button" onClick={() => onChange(groups.map((g) => g.id))}>{t('staffAdmin.selectAll')}</button>
        <button type="button" onClick={() => onChange([])}>{t('staffAdmin.selectNone')}</button>
      </div>
      {groups.map((group) => (
        <label key={group.id} className="staff-permissions__item">
          <input type="checkbox" checked={value.includes(group.id)} onChange={() => toggle(group.id)} />
          <span><strong>{t(`staffAdmin.groups.${group.id.replace(".", "_")}.title`)}</strong><small>{t(`staffAdmin.groups.${group.id.replace(".", "_")}.body`)}</small></span>
        </label>
      ))}
    </fieldset>
  );
}

export function ManagementStaffPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const [groups, setGroups] = useState([]);
  const [librarians, setLibrarians] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [editor, setEditor] = useState(null); // { mode: 'create' } | { mode: 'edit', librarian }
  const [draft, setDraft] = useState({ displayName: '', universityEmail: '', permissions: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal) => {
    setLoadError(null);
    try {
      const [g, l] = await Promise.all([listPermissionGroups(auth.token, signal), listLibrarians(auth.token, signal)]);
      setGroups(g.data); setLibrarians(l.data);
    } catch (error) { if (error.name !== 'AbortError') setLoadError(error); }
  }, [auth.token]);

  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort(); }, [load]);

  const errorText = (error) => {
    const key = `staffAdmin.errors.${error.code}`;
    const text = t(key);
    return text && text !== key ? text : error.message;
  };

  function openCreate() {
    setDraft({ displayName: '', universityEmail: '', permissions: groups.map((g) => g.id) });
    setSaveError(null); setConfirmToggle(false); setEditor({ mode: 'create' });
  }
  function openEdit(librarian) {
    setDraft({ displayName: librarian.displayName, universityEmail: librarian.universityEmail, permissions: librarian.permissions });
    setSaveError(null); setConfirmToggle(false); setEditor({ mode: 'edit', librarian });
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      if (editor.mode === 'create') {
        await createLibrarian(auth.token, { displayName: draft.displayName.trim(), universityEmail: draft.universityEmail.trim(), permissions: draft.permissions });
        setNotice(t('staffAdmin.created'));
      } else {
        await updateLibrarian(auth.token, editor.librarian.id, { displayName: draft.displayName.trim(), permissions: draft.permissions });
        setNotice(t('staffAdmin.saved'));
      }
      setEditor(null); load();
    } catch (error) { setSaveError(error); }
    finally { setSaving(false); }
  }

  async function toggleActive() {
    const { librarian } = editor;
    setSaving(true); setSaveError(null);
    try {
      await updateLibrarian(auth.token, librarian.id, { isActive: !librarian.isActive });
      setNotice(t(librarian.isActive ? 'staffAdmin.deactivated' : 'staffAdmin.activated'));
      setEditor(null); load();
    } catch (error) { setSaveError(error); }
    finally { setSaving(false); }
  }

  const editing = editor?.mode === 'edit' ? editor.librarian : null;

  return (
    <section className="admin-page admin-operations staff-admin">
      <header className="admin-page__header">
        <span>{t('staffAdmin.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('staffAdmin.title')}</h1>
        <p>{t('staffAdmin.subtitle')}</p>
      </header>

      {notice && <div className="admin-notice" role="status"><span>{notice}</span>
        <button type="button" aria-label={t('staffAdmin.close')} onClick={() => setNotice('')}>×</button></div>}
      {loadError && <InlineAlert title={t('admin.workflows.readFailed')} message={loadError.message} requestId={loadError.requestId} />}

      <section className="admin-card">
        <div className="admin-toolbar">
          <p className="staff-admin__hint">{t('staffAdmin.hint')}</p>
          <button type="button" className="admin-primary-button" onClick={openCreate} disabled={!groups.length}>+ {t('staffAdmin.add')}</button>
        </div>

        {!librarians ? <div className="admin-empty">{t('admin.common.loading')}</div>
          : librarians.length === 0 ? <div className="admin-empty">{t('staffAdmin.empty')}</div> : (
          <div className="admin-table-wrap" role="region" tabIndex={0} aria-label={t('staffAdmin.title')}>
            <table className="admin-table">
              <thead><tr>
                <th scope="col">{t('staffAdmin.name')}</th>
                <th scope="col">{t('staffAdmin.email')}</th>
                <th scope="col">{t('staffAdmin.permissions')}</th>
                <th scope="col">{t('admin.common.status')}</th>
                <th scope="col">{t('admin.common.actions')}</th>
              </tr></thead>
              <tbody>{librarians.map((librarian) => (
                <tr key={librarian.id}>
                  <td dir="auto"><strong>{librarian.displayName}</strong></td>
                  <td><bdi>{librarian.universityEmail}</bdi></td>
                  <td>{librarian.permissions.length === groups.length
                    ? t('staffAdmin.allPermissions')
                    : `${librarian.permissions.length} / ${groups.length}`}</td>
                  <td><AdminStatusBadge tone={librarian.isActive ? 'success' : 'neutral'}>
                    {librarian.isActive ? t('admin.common.active') : t('admin.common.inactive')}</AdminStatusBadge></td>
                  <td>{librarian.manageable
                    ? <button type="button" onClick={() => openEdit(librarian)}>{t('staffAdmin.manage')}</button>
                    : <small>{t('staffAdmin.protected')}</small>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {editor && (
        <AdminModal
          eyebrow={t('staffAdmin.eyebrow')}
          title={editing ? editing.displayName : t('staffAdmin.addTitle')}
          canClose={!saving}
          onClose={() => setEditor(null)}
          actions={confirmToggle ? (
            <>
              <span>{t(editing.isActive ? 'staffAdmin.confirmDeactivate' : 'staffAdmin.confirmActivate')}</span>
              <button type="button" className={editing.isActive ? 'admin-danger-button' : 'admin-primary-button'} disabled={saving} onClick={toggleActive}>{t('staffAdmin.yes')}</button>
              <button type="button" className="admin-secondary-button" onClick={() => setConfirmToggle(false)}>{t('staffAdmin.cancel')}</button>
            </>
          ) : (
            <>
              {editing && <button type="button" className="admin-secondary-button" disabled={saving} onClick={() => setConfirmToggle(true)}>
                {t(editing.isActive ? 'staffAdmin.deactivate' : 'staffAdmin.activate')}</button>}
              <button type="button" className="admin-secondary-button" disabled={saving} onClick={() => setEditor(null)}>{t('staffAdmin.cancel')}</button>
              <button type="submit" form="librarian-form" className="admin-primary-button" disabled={saving}>
                {saving ? t('staffAdmin.saving') : t(editing ? 'staffAdmin.save' : 'staffAdmin.create')}</button>
            </>
          )}
        >
          <form id="librarian-form" onSubmit={save} className="staff-admin__form">
            <div className="admin-form-grid">
              <label><span>{t('staffAdmin.name')} *</span>
                <input required minLength={2} maxLength={180} dir="auto" value={draft.displayName}
                  onChange={(event) => setDraft((d) => ({ ...d, displayName: event.target.value }))} /></label>
              <label><span>{t('staffAdmin.email')} *</span>
                <input required type="email" maxLength={254} dir="ltr" value={draft.universityEmail} disabled={Boolean(editing)}
                  onChange={(event) => setDraft((d) => ({ ...d, universityEmail: event.target.value }))} /></label>
            </div>
            <PermissionChecklist groups={groups} value={draft.permissions} disabled={saving}
              onChange={(permissions) => setDraft((d) => ({ ...d, permissions }))} />
            {editing && <p className="staff-admin__hint">{t('staffAdmin.sessionHint')}</p>}
            {!editing && <p className="staff-admin__hint">{t('staffAdmin.loginHint')}</p>}
          </form>
          {saveError && <InlineAlert title={t('staffAdmin.saveFailed')} message={errorText(saveError)} requestId={saveError.requestId} />}
        </AdminModal>
      )}
    </section>
  );
}
