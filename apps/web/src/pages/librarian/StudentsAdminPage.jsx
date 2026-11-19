import { useState } from 'react';

import { AdminModal } from '../../components/admin/AdminModal';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { AdminReadState, AdminPagination } from '../../components/admin/AdminReadState';
import { useStaffRead } from '../../features/staff/use-staff-circulation';
import '../../styles/admin-operations.css';
import { listStudents } from '../../features/admin/admin-api';
import { ACADEMIC_STATUSES, studentStatusTone } from '../../features/admin/admin-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function StudentsAdminPage() {
  const auth = useAuth();
  const { t } = useLanguage();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', academicStatus: '', includeInactive: true, page: 1, pageSize: 20 });
  const { academicStatus, includeInactive } = filters;
  const [selectedStudent, setSelectedStudent] = useState(null);
  const read = useStaffRead(listStudents, auth.token, filters, true, false);
  const students = read.result?.data || [];
  const loading = read.loading;

  return (
    <section className="admin-page admin-operations student-directory">
      <header className="admin-page__header">
        <span>{t('studentDirectory.eyebrow')}</span>
        <h1 tabIndex={-1}>{t('studentDirectory.title')}</h1>
        <p>{t('studentDirectory.subtitle')}</p>
      </header>

      <div className="admin-source-notice" role="note">
        <strong>{t('studentDirectory.sourceTitle')}</strong>
        <span>{t('studentDirectory.sourceBody')}</span>
      </div>

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
          onClose={() => setSelectedStudent(null)}
          actions={(
            <button type="button" className="admin-secondary-button" onClick={() => setSelectedStudent(null)}>
              {t('studentDirectory.close')}
            </button>
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

          <p className="student-directory-readonly">{t('studentDirectory.readOnlyHint')}</p>
        </AdminModal>
      )}
    </section>
  );
}
