import {
  useEffect,
  useId,
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
  const triggerRef = useRef(null);
  const openAtEndRef = useRef(false);
  const menuId = useId();

  const isStudent =
    auth.roles.includes('STUDENT');

  useEffect(() => {
    if (!open) return undefined;

    const items = menuRef.current.querySelectorAll('[role="menuitem"]');
    items[openAtEndRef.current ? items.length - 1 : 0]?.focus();
    openAtEndRef.current = false;

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
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
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
        ref={triggerRef}
        type="button"
        className="user-menu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={t('auth.accountMenu')}
        onClick={() =>
          setOpen((value) => !value)
        }
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            openAtEndRef.current = event.key === 'ArrowUp';
            setOpen(true);
          }
        }}
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
          id={menuId}
          role="menu"
          aria-label={t('auth.accountMenu')}
          onBlur={(event) => {
            if (!menuRef.current?.contains(event.relatedTarget)) setOpen(false);
          }}
          onKeyDown={(event) => {
            const items = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]'));
            const index = items.indexOf(document.activeElement);
            const next = {
              ArrowDown: (index + 1) % items.length,
              ArrowUp: (index - 1 + items.length) % items.length,
              Home: 0,
              End: items.length - 1
            }[event.key];
            if (next !== undefined) {
              event.preventDefault();
              items[next]?.focus();
            }
          }}
        >
          <div className="user-menu__email">
            {auth.user?.universityEmail}
          </div>

          {isStudent && (
            <Link
              role="menuitem"
              tabIndex={-1}
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
            tabIndex={-1}
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
