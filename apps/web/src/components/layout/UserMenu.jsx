import {
  useEffect,
  useRef,
  useState
} from 'react';

import { Link } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';

function getInitials(name) {
  return String(name || 'SAMS')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function UserMenu() {
  const auth = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const isStudent =
    auth.roles.includes('STUDENT');

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener(
      'pointerdown',
      handlePointerDown
    );

    document.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        'pointerdown',
        handlePointerDown
      );

      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [open]);

  return (
    <div
      className="user-menu"
      ref={menuRef}
    >
      <button
        type="button"
        className="user-menu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('auth.accountMenu')}
        onClick={() =>
          setOpen((value) => !value)
        }
      >
        <span
          className="user-avatar"
          aria-hidden="true"
        >
          {getInitials(auth.user?.displayName)}
        </span>

        <span className="user-menu__identity">
          <strong>
            {auth.user?.displayName}
          </strong>

          <small>
            {auth.roles
              .map((role) => t(`roles.${role}`))
              .join(' · ')}
          </small>
        </span>
      </button>

      {open && (
        <div
          className="user-menu__popover"
          role="menu"
        >
          <div className="user-menu__email">
            {auth.user?.universityEmail}
          </div>

          {isStudent && (
            <Link
              role="menuitem"
              className="user-menu__profile-link"
              to="/student/profile"
              onClick={() => setOpen(false)}
            >
              {t('profile.menu')}
            </Link>
          )}

          <button
            type="button"
            role="menuitem"
            className="user-menu__logout"
            onClick={auth.logout}
          >
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
