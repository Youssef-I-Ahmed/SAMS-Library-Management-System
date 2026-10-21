export function StaffStatusBadge({
  tone = 'neutral',
  children
}) {
  return (
    <span className={`staff-status staff-status--${tone}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
