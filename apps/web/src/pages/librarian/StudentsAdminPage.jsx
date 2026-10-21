import { useEffect, useState } from 'react';

import { AdminModal } from '../../components/admin/AdminModal';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { listStudents } from '../../features/admin/admin-api';
import { ACADEMIC_STATUSES, studentStatusTone } from '../../features/admin/admin-format';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function StudentsAdminPage() {
  const auth = useAuth();
  const { t } = useLanguage();

  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [academicStatus, setAcademicStatus] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load(signal) {
    setLoading(true);
    setError(null);

    try {
      const response = await listStudents(auth.token, {
        search: search.trim() || undefined,
        academicStatus: academicStatus || undefined,
        includeInactive,
        page,
        pageSize: 20
      }, signal);

      setStudents(response.data || []);
      setTotal(response.pagination?.total || 0);
    } catch (nextError) {
      if (nextError.name !== 'AbortError') setError(nextError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [auth.token, academicStatus, includeInactive, page]);

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <span>{t('studentDirectory.eyebrow')}</span>
        <h1>{t('studentDirectory.title')}</h1>
        <p>{t('studentDirectory.subtitle')}</p>
      </header>

      <div className="admin-source-notice" role="note">
        <strong>{t('studentDirectory.sourceTitle')}</strong>
        <span>{t('studentDirectory.sourceBody')}</span>
      </div>

      {error && (
        <InlineAlert
          title={t('admin.common.operationFailed')}
          message={error.message}
          requestId={error.requestId}
        />
      )}

      <section className="admin-card">
        <div className="admin-toolbar">
          <form onSubmit={(event) => { event.preventDefault(); setPage(1); load(); }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('studentDirectory.search')}
            />

            <select
              value={academicStatus}
              onChange={(event) => { setAcademicStatus(event.target.value); setPage(1); }}
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
                onChange={(event) => { setIncludeInactive(event.target.checked); setPage(1); }}
              />
              <span>{t('studentDirectory.includeInactive')}</span>
            </label>

            <button type="submit">{t('admin.common.search')}</button>
          </form>
        </div>

        <div className="admin-results-count">
          {total} {t('studentDirectory.records')}
        </div>

        {loading ? (
          <div className="admin-empty">{t('admin.common.loading')}</div>
        ) : students.length === 0 ? (
          <div className="admin-empty">{t('studentDirectory.empty')}</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('studentDirectory.student')}</th>
                  <th>{t('studentDirectory.email')}</th>
                  <th>{t('studentDirectory.academic')}</th>
                  <th>{t('admin.common.status')}</th>
                  <th>{t('admin.common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.studentId}>
                    <td>
                      <span className="admin-stack">
                        <strong>{student.user.displayName}</strong>
                        <small>{student.studentId}</small>
                      </span>
                    </td>
                    <td>{student.user.universityEmail}</td>
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

        <nav className="admin-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            ← {t('discovery.pagination.previous')}
          </button>
          <span>{t('discovery.pagination.page')} {page}</span>
          <button type="button" disabled={students.length < 20} onClick={() => setPage((value) => value + 1)}>
            {t('discovery.pagination.next')} →
          </button>
        </nav>
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
            <div><dt>{t('studentDirectory.studentId')}</dt><dd>{selectedStudent.studentId}</dd></div>
            <div><dt>{t('studentDirectory.email')}</dt><dd>{selectedStudent.user.universityEmail}</dd></div>
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
