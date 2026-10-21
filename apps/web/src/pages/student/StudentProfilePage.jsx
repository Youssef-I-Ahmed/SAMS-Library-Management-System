import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

export function StudentProfilePage() {
  const auth = useAuth();
  const { t } = useLanguage();

  const student = auth.user?.student;

  const rows = [
    [t('profile.fields.name'), auth.user?.displayName],
    [t('profile.fields.email'), auth.user?.universityEmail],
    [t('profile.fields.studentId'), student?.studentId],
    [
      t('profile.fields.academicStatus'),
      student?.academicStatus
        ? t(`profile.academicStatus.${student.academicStatus}`)
        : null
    ],
    [t('profile.fields.faculty'), student?.faculty?.name],
    [t('profile.fields.department'), student?.department?.name]
  ].filter(([, value]) => value);

  return (
    <section className="profile-page">
      <header className="circulation-page__header">
        <span>{t('profile.eyebrow')}</span>
        <h1>{t('profile.title')}</h1>
        <p>{t('profile.subtitle')}</p>
      </header>

      <div className="profile-card">
        <div className="profile-card__avatar" aria-hidden="true">
          {String(auth.user?.displayName || 'S')
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase()}
        </div>

        <div className="profile-card__identity">
          <h2>{auth.user?.displayName}</h2>
          <span>{t('roles.STUDENT')}</span>
        </div>

        <dl className="profile-grid">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd dir="auto">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
