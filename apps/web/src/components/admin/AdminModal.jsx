import {
  useEffect,
  useRef
} from 'react';

export function AdminModal({
  eyebrow,
  title,
  children,
  onClose,
  actions
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener(
      'keydown',
      handleKeyDown
    );

    closeRef.current?.focus();

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [onClose]);

  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <section
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div className="admin-modal__heading">
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            <h2 id="admin-modal-title">{title}</h2>
          </div>

          <button
            ref={closeRef}
            type="button"
            className="admin-modal__close"
            onClick={onClose}
            aria-label="Close dialog"
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
