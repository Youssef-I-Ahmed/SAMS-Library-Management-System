import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AdminModal } from '../../components/admin/AdminModal';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { AdminReadState, AdminPagination } from '../../components/admin/AdminReadState';
import { useStaffRead } from '../../features/staff/use-staff-circulation';
import '../../styles/admin-operations.css';
import { createStudent, listDepartments, listFaculties, listStudents, updateStudent } from '../../features/admin/admin-api';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { ACADEMIC_STATUSES, studentStatusTone } from '../../features/admin/admin-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

const emptyDraft = () => ({ studentId: '', displayName: '', universityEmail: '', facultyId: '', departmentId: '',
  academicStatus: 'ACTIVE', isActive: true });

function draftFrom(student, faculties, departments) {
  const faculty = faculties.find((row) => row.name === student.faculty?.name);
  const department = departments.find((row) => row.name === student.department?.name && row.facultyId === faculty?.id);
  return { studentId: student.studentId, displayName: student.user.displayName, universityEmail: student.user.universityEmail,
    facultyId: faculty?.id || '', departmentId: department?.id || '', academicStatus: student.academicStatus,
    isActive: student.user.isActive };
}

function StudentForm({ draft, setDraft, faculties, departments, editing }) {
  const { t } = useLanguage();
  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const facultyDepartments = departments.filter((row) => row.facultyId === draft.facultyId);
  return (
    <div className="admin-form-grid">
      <label><span>{t('studentDirectory.studentId')} *</span>
        <input required maxLength={80} value={draft.studentId} onChange={set('studentId')} disabled={editing} dir="ltr" /></label>
      <label><span>{t('studentDirectory.name')} *</span>
        <input required minLength={2} maxLength={180} value={draft.displayName} onChange={set('displayName')} dir="auto" /></label>
      <label className="admin-form-grid__wide"><span>{t('studentDirectory.email')} *</span>
        <input required type="email" maxLength={254} value={draft.universityEmail} onChange={set('universityEmail')} dir="ltr" /></label>
      <label><span>{t('admin.catalog.faculty')}</span>
        <select value={draft.facultyId} onChange={(event) => setDraft((current) => ({ ...current, facultyId: event.target.value, departmentId: '' }))}>
          <option value="">—</option>
          {faculties.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
      <label><span>{t('admin.catalog.department')}</span>
        <select value={draft.departmentId} onChange={set('departmentId')} disabled={!draft.facultyId}>
          <option value="">—</option>
          {facultyDepartments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
      <label><span>{t('studentDirectory.academicStatus')}</span>
        <select value={draft.academicStatus} onChange={set('academicStatus')}>
          {ACADEMIC_STATUSES.map((value) => <option key={value} value={value}>{t(`profile.academicStatus.${value}`)}</option>)}
        </select></label>
      <label className="admin-check"><input type="checkbox" checked={draft.isActive} onChange={set('isActive')} />
        <span>{t('studentDirectory.accountActive')}</span></label>
    </div>
  );
}

export function StudentsAdminPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const codeMessage = (error) => {
    const key = `studentDirectory.errors.${error.code}`;
    const text = t(key);
    return text && text !== key ? text : error.message;
  };

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', academicStatus: '', includeInactive: true, page: 1, pageSize: 20 });
  const { academicStatus, includeInactive } = filters;
  const [selectedStudent, setSelectedStudent] = useState(null);
  const read = useStaffRead(listStudents, auth.token, filters, true, false);
  const students = read.result?.data || [];
  const loading = read.loading;

  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editor, setEditor] = useState(null); // { mode: 'create' | 'edit', original? }
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [notice, setNotice] = useState('');
  const [confirmToggle, setConfirmToggle] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listFaculties(auth.token, controller.signal), listDepartments(auth.token, controller.signal)])
      .then(([f, d]) => { setFaculties(f.data || []); setDepartments(d.data || []); })
      .catch(() => {});
    return () => controller.abort();
  }, [auth.token]);

  function openCreate() { setDraft(emptyDraft()); setSaveError(null); setEditor({ mode: 'create' }); }
  function openEdit(student) {
    setDraft(draftFrom(student, faculties, departments)); setSaveError(null); setSelectedStudent(null);
    setEditor({ mode: 'edit', original: student });
  }

  function bodyFrom(value) {
    const faculty = faculties.find((row) => row.id === value.facultyId);
    const department = departments.find((row) => row.id === value.departmentId);
    return { displayName: value.displayName.trim(), universityEmail: value.universityEmail.trim(),
      facultyName: faculty?.name ?? null, departmentName: department?.name ?? null,
      academicStatus: value.academicStatus, isActive: value.isActive };
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      if (editor.mode === 'create') await createStudent(auth.token, { studentId: draft.studentId.trim(), ...bodyFrom(draft) });
      else await updateStudent(auth.token, editor.original.studentId, bodyFrom(draft));
      setNotice(t(editor.mode === 'create' ? 'studentDirectory.created' : 'studentDirectory.saved'));
      setEditor(null); read.reload();
    } catch (error) { setSaveError(error); }
    finally { setSaving(false); }
  }

  async function toggleActive(student) {
    setSaving(true); setSaveError(null);
    try {
      const { data } = await updateStudent(auth.token, student.studentId, { isActive: !student.user.isActive });
      setSelectedStudent(data); setConfirmToggle(false);
      setNotice(t(data.user.isActive ? 'studentDirectory.activated' : 'studentDirectory.deactivated'));
      read.reload();
    } catch (error) { setSaveError(error); }
    finally { setSaving(false); }
  }

  return (
    <section className="admin-page admin-operations student-directory">
      <header className="admin-page__header">
        <span>{t('studentDirectory.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('studentDirectory.title')}</h1>
        <p>{t('studentDirectory.subtitle')}</p>
      </header>

      {notice && <div className="admin-notice" role="status"><span>{notice}</span>
        <button type="button" aria-label={t('studentDirectory.close')} onClick={() => setNotice('')}>×</button></div>}

      <section className="admin-card">
        <div className="admin-toolbar">
          <form onSubmit={(event) => { event.preventDefault(); if (filters.page === 1 && filters.search === search.trim()) read.reload(); else setFilters(current => ({ ...current, search: search.trim(), page: 1 })); }}>
            <input
              aria-label={t('studentDirectory.search')}
              maxLength={180}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('studentDirectory.search')}
            />

            <select
              aria-label={t('studentDirectory.academicStatus')}
              value={academicStatus}
              onChange={(event) => { setFilters(current => ({ ...current, academicStatus: event.target.value, page: 1 })); }}
            >
              <option value="">{t('admin.common.allStatuses')}</option>
              {ACADEMIC_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`profile.academicStatus.${value}`)}
                </option>
              ))}
            </select>

            <label className="admin-check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => { setFilters(current => ({ ...current, includeInactive: event.target.checked, page: 1 })); }}
              />
              <span>{t('studentDirectory.includeInactive')}</span>
            </label>

            <button type="submit">{t('admin.common.search')}</button>
          </form>
          <div className="student-directory__actions">
            <button type="button" className="admin-primary-button" onClick={openCreate}>+ {t('studentDirectory.add')}</button>
            <Link className="admin-secondary-button" to="/librarian/students/transfer">{t('studentDirectory.transfer')}</Link>
          </div>
        </div>

        <AdminReadState read={read} hintId="directory-table-hint" />

        {loading && !read.result ? (
          <div className="admin-empty">{t('admin.common.loading')}</div>
        ) : !read.result || read.error && !students.length ? null : students.length === 0 ? (
          <div className="admin-empty">{t('studentDirectory.empty')}</div>
        ) : (
          <div className="admin-table-wrap" aria-describedby="directory-table-hint" role="region" tabIndex={0} aria-label={t('studentDirectory.title')}>
            <table className="admin-table" aria-label={t('studentDirectory.title')}>
              <thead>
                <tr>
                  <th scope="col">{t('studentDirectory.student')}</th>
                  <th scope="col">{t('studentDirectory.email')}</th>
                  <th scope="col">{t('studentDirectory.academic')}</th>
                  <th scope="col">{t('admin.common.status')}</th>
                  <th scope="col">{t('admin.common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.studentId}>
                    <td>
                      <span className="admin-stack">
                        <strong>{student.user.displayName}</strong>
                        <small><bdi>{student.studentId}</bdi></small>
                      </span>
                    </td>
                    <td><bdi>{student.user.universityEmail}</bdi></td>
                    <td>
                      <span className="admin-stack">
                        <strong>{student.faculty?.name || '—'}</strong>
                        <small>{student.department?.name || '—'}</small>
                      </span>
                    </td>
                    <td>
                      <AdminStatusBadge tone={studentStatusTone(student)}>
                        {student.user.isActive
                          ? t(`profile.academicStatus.${student.academicStatus}`)
                          : t('admin.common.inactive')}
                      </AdminStatusBadge>
                    </td>
                    <td>
                      <button type="button" onClick={() => setSelectedStudent(student)}>
                        {t('studentDirectory.view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AdminPagination read={read} onPage={(page) => setFilters(current => ({ ...current, page }))} />
      </section>

      {selectedStudent && (
        <AdminModal
          eyebrow={t('studentDirectory.profileEyebrow')}
          title={selectedStudent.user.displayName}
          onClose={() => { setSelectedStudent(null); setConfirmToggle(false); setSaveError(null); }}
          actions={confirmToggle ? (
            <>
              <span>{t(selectedStudent.user.isActive ? 'studentDirectory.confirmDeactivate' : 'studentDirectory.confirmActivate')}</span>
              <button type="button" className={selectedStudent.user.isActive ? 'admin-danger-button' : 'admin-primary-button'} disabled={saving}
                onClick={() => toggleActive(selectedStudent)}>{t('studentDirectory.yes')}</button>
              <button type="button" className="admin-secondary-button" onClick={() => setConfirmToggle(false)}>{t('studentDirectory.cancel')}</button>
            </>
          ) : (
            <>
              <button type="button" className="admin-secondary-button" onClick={() => setConfirmToggle(true)}>
                {t(selectedStudent.user.isActive ? 'studentDirectory.deactivate' : 'studentDirectory.activate')}
              </button>
              <button type="button" className="admin-primary-button" onClick={() => openEdit(selectedStudent)}>{t('studentDirectory.edit')}</button>
              <button type="button" className="admin-secondary-button" onClick={() => setSelectedStudent(null)}>
                {t('studentDirectory.close')}
              </button>
            </>
          )}
        >
          <dl className="student-directory-details">
            <div><dt>{t('studentDirectory.studentId')}</dt><dd><bdi>{selectedStudent.studentId}</bdi></dd></div>
            <div><dt>{t('studentDirectory.email')}</dt><dd><bdi>{selectedStudent.user.universityEmail}</bdi></dd></div>
            <div><dt>{t('studentDirectory.name')}</dt><dd dir="auto">{selectedStudent.user.displayName}</dd></div>
            <div><dt>{t('studentDirectory.academicStatus')}</dt><dd>{t(`profile.academicStatus.${selectedStudent.academicStatus}`)}</dd></div>
            <div><dt>{t('admin.catalog.faculty')}</dt><dd dir="auto">{selectedStudent.faculty?.name || '—'}</dd></div>
            <div><dt>{t('admin.catalog.department')}</dt><dd dir="auto">{selectedStudent.department?.name || '—'}</dd></div>
            <div><dt>{t('studentDirectory.accountStatus')}</dt><dd>{selectedStudent.user.isActive ? t('admin.common.active') : t('admin.common.inactive')}</dd></div>
          </dl>

          {saveError && <InlineAlert title={t('studentDirectory.saveFailed')} message={codeMessage(saveError)} requestId={saveError.requestId} />}
        </AdminModal>
      )}

      {editor && (
        <AdminModal
          eyebrow={t('studentDirectory.eyebrow')}
          title={t(editor.mode === 'create' ? 'studentDirectory.addTitle' : 'studentDirectory.editTitle')}
          canClose={!saving}
          onClose={() => setEditor(null)}
          actions={(
            <>
              <button type="button" className="admin-secondary-button" disabled={saving} onClick={() => setEditor(null)}>{t('studentDirectory.cancel')}</button>
              <button type="submit" form="student-account-form" className="admin-primary-button" disabled={saving}>
                {saving ? t('studentDirectory.saving') : t('studentDirectory.save')}
              </button>
            </>
          )}
        >
          <form id="student-account-form" onSubmit={save}>
            <StudentForm draft={draft} setDraft={setDraft} faculties={faculties} departments={departments} editing={editor.mode === 'edit'} />
          </form>
          {editor.mode === 'edit' && editor.original.user.isActive && !draft.isActive &&
            <p className="catalog-transfer__warning">{t('studentDirectory.deactivateHint')}</p>}
          {saveError && <InlineAlert title={t('studentDirectory.saveFailed')} message={codeMessage(saveError)} requestId={saveError.requestId} />}
        </AdminModal>
      )}
    </section>
  );
}
