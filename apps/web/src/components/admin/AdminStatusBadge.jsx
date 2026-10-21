export function AdminStatusBadge({ tone = 'neutral', children }) {
  return <span className={`admin-status admin-status--${tone}`}><span aria-hidden="true" />{children}</span>;
}
