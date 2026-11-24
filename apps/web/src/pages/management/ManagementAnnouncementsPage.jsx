import { useState } from 'react';
import { AdminModal } from '../../components/admin/AdminModal';
import { InlineAlert } from '../../components/ui/InlineAlert';
import { sendAnnouncement } from '../../features/notifications/notifications-api';
import { notificationText } from '../../features/notifications/notification-text';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import '../../styles/admin-operations.css';
import '../../styles/notifications.css';

const AUDIENCES = ['STUDENT', 'LIBRARIAN', 'STAFF', 'ALL'];
const LINKS = ['/student/catalog', '/student/reservations', '/student/borrowings', '/librarian'];
const empty = { audience: 'STUDENT', title: '', body: '', link: '' };

export function ManagementAnnouncementsPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const [draft, setDraft] = useState(empty);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const set = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }));
  const audienceName = t(`notifications.announce.audiences.${draft.audience}`);
  const preview = notificationText({ type: 'ANNOUNCEMENT', data: { title: draft.title || t('notifications.announce.heading'), body: draft.body } }, t, language);

  const send = async () => {
    setSending(true); setError(null); setNotice('');
    try {
      const { data } = await sendAnnouncement(auth.token, {
        audience: draft.audience, title: draft.title.trim(), body: draft.body.trim(), ...(draft.link ? { link: draft.link } : {})
      });
      setNotice(t('notifications.announce.sent').replace('{count}', data.sent));
      setDraft(empty);
    } catch (failure) { setError(failure); } finally { setSending(false); setConfirming(false); }
  };

  return <section className="admin-page admin-operations announce-page">
    <header className="admin-page__header">
      <span>{t('notifications.announce.eyebrow')}</span>
      <h1 tabIndex={-1}>{t('notifications.announce.title')}</h1>
      <p>{t('notifications.announce.lead')}</p>
    </header>
    {notice && <div className="admin-notice" role="status"><span>{notice}</span>
      <button type="button" aria-label={t('staffAdmin.close')} onClick={() => setNotice('')}>×</button></div>}
    {error && <InlineAlert title={t('notifications.error')} message={error.message} requestId={error.requestId} />}
    <div className="admin-card">
      <form className="announce-form" onSubmit={(event) => { event.preventDefault(); setConfirming(true); }}>
        <label><span>{t('notifications.announce.audience')}</span>
          <select value={draft.audience} onChange={set('audience')}>{AUDIENCES.map((a) => <option key={a} value={a}>{t(`notifications.announce.audiences.${a}`)}</option>)}</select></label>
        <label><span>{t('notifications.announce.heading')}</span>
          <input required minLength={2} maxLength={120} value={draft.title} onChange={set('title')} dir="auto" /></label>
        <label><span>{t('notifications.announce.body')}</span>
          <textarea maxLength={1000} value={draft.body} onChange={set('body')} dir="auto" /></label>
        <label><span>{t('notifications.announce.link')}</span>
          <select value={draft.link} onChange={set('link')}>
            <option value="">{t('notifications.announce.linkNone')}</option>
            {LINKS.map((link) => <option key={link} value={link}>{t(`notifications.announce.links.${link}`)}</option>)}
          </select></label>
        <div>
          <span className="announce-form__preview-label">{t('notifications.announce.preview')}</span>
          <div className="announce-preview"><div className="notification-item is-unread"><span className="notification-item__dot" aria-hidden="true" />
            <span className="notification-item__text"><strong dir="auto">{preview.title}</strong>{preview.body && <span dir="auto">{preview.body}</span>}
              <small>{t('notifications.from').replace('{name}', auth.user?.displayName ?? '')}</small></span></div></div>
        </div>
        <div className="announce-form__actions">
          <button className="admin-primary-button" type="submit" disabled={sending || draft.title.trim().length < 2}>{sending ? t('notifications.announce.sending') : t('notifications.announce.send')}</button>
        </div>
      </form>
    </div>
    {confirming && <AdminModal title={t('notifications.announce.title')} canClose={!sending} onClose={() => setConfirming(false)}
      actions={<><button type="button" className="admin-secondary-button" disabled={sending} onClick={() => setConfirming(false)}>{t('admin.common.cancel')}</button>
        <button type="button" className="admin-primary-button" disabled={sending} onClick={send}>{sending ? t('notifications.announce.sending') : t('notifications.announce.send')}</button></>}>
      <p>{t('notifications.announce.confirm').replace('{audience}', audienceName)}</p>
    </AdminModal>}
  </section>;
}
