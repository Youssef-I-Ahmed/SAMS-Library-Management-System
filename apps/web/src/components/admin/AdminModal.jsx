import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef
} from 'react';

import { useLanguage } from '../../hooks/useLanguage';

function getTabStops(dialog) {
  return Array.from(dialog.querySelectorAll(
    'a[href], area[href], button, input, select, textarea, iframe, '
    + '[contenteditable="true"], [tabindex]'
  )).filter((element) => (
    element.tabIndex >= 0
    && !element.matches(':disabled')
    && !element.closest('[hidden], [inert]')
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden'
  )).sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
}

export function AdminModal({
  eyebrow,
  title,
  children,
  onClose,
  canClose = true,
  actions
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeHandlerRef = useRef(null);

  // Callers pass inline callbacks; updating them must not reset keyboard focus.
  useLayoutEffect(() => {
    closeHandlerRef.current = canClose ? onClose : null;
  }, [canClose, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const focusInside = () => {
      const target = getTabStops(dialog)[0] || dialog;
      target.focus({ preventScroll: true });
    };

    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;

      if (event.key === 'Escape' && closeHandlerRef.current) {
        event.preventDefault();
        closeHandlerRef.current();
      }

      if (event.key === 'Tab') {
        const tabStops = getTabStops(dialog);
        const first = tabStops[0];
        const last = tabStops[tabStops.length - 1];

        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (!tabStops.includes(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (event) => {
      if (!dialog.contains(event.target)) focusInside();
    };

    document.addEventListener(
      'keydown',
      handleKeyDown
    );
    document.addEventListener('focusin', handleFocusIn);

    focusInside();

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
      document.removeEventListener('focusin', handleFocusIn);

      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          // Do not let the backdrop's default mouse focus override restoration.
          event.preventDefault();
          closeHandlerRef.current?.();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="admin-modal__heading">
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>

          <button
            type="button"
            className="admin-modal__close"
            onClick={() => closeHandlerRef.current?.()}
            disabled={!canClose || !onClose}
            aria-label={t('common.closeDialog')}
          >
            ×
          </button>
        </div>

        <div className="admin-modal__body">
          {children}
        </div>

        {actions && (
          <div className="admin-modal__actions">
            {actions}
          </div>
        )}
      </section>
    </div>
  );
}
