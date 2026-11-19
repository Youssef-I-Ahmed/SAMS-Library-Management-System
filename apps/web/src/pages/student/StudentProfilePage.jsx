import { useId } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/student-profile.css';

export function StudentProfilePage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const personalId = useId();
  const academicId = useId();
  const student = auth.user?.student;
  const personal = [
    ['name', auth.user?.displayName],
    ['email', auth.user?.universityEmail, 'ltr']
  ];
  const academic = [
    ['studentId', student?.studentId, 'ltr'],
    [
      'academicStatus',
      student?.academicStatus
        ? t(`profile.academicStatus.${student.academicStatus}`, student.academicStatus)
        : null
    ],
    ['faculty', student?.faculty?.name],
    ['department', student?.department?.name]
  ];
  const supplied = (value) => value !== null && value !== undefined && String(value).trim() !== '';
  const initials = String(auth.user?.displayName || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase();

  function fields(rows) {
    return <dl className="profile-fields">
      {rows.map(([key, value, direction = 'auto']) => (
        <div key={key}>
          <dt>{t(`profile.fields.${key}`)}</dt>
          <dd data-missing={!supplied(value)}>
            {supplied(value) ? <bdi dir={direction}>{value}</bdi> : t('profile.notProvided')}
          </dd>
        </div>
      ))}
    </dl>;
  }

  return (
    <section className="profile-page profile-page--student">
      <header className="circulation-page__header">
        <span>{t('profile.eyebrow')}</span>
        <h1>{t('profile.title')}</h1>
        <p>{t('profile.subtitle')}</p>
      </header>

      <div className="profile-sheet">
        <section className="profile-section" aria-labelledby={personalId}>
          <header className="profile-section__identity">
            <div className="profile-avatar" aria-hidden="true">
              {initials || <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" />
              </svg>}
            </div>
            <div>
              <h2 id={personalId}>{t('profile.personalTitle')}</h2>
              <p>{t('roles.STUDENT')} · {t('profile.readOnly')}</p>
            </div>
          </header>
          {fields(personal)}
        </section>
        <section className="profile-section" aria-labelledby={academicId}>
          <h2 id={academicId}>{t('profile.academicTitle')}</h2>
          {!academic.some(([, value]) => supplied(value)) && <p className="profile-missing-note">{t('profile.academicMissing')}</p>}
          {fields(academic)}
        </section>
      </div>
    </section>
  );
}
