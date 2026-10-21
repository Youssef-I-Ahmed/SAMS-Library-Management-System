import { NavLink, Outlet } from 'react-router-dom';
import { BrandLogo } from '../components/brand/BrandLogo';
import { ShellControls } from '../components/layout/ShellControls';
import { useLanguage } from '../hooks/useLanguage';
const navigation = {
  librarian: [['/librarian','nav.dashboard'],['/librarian/borrow','nav.borrow'],['/librarian/return','nav.return'],['/librarian/reservations','nav.reservations'],['/librarian/visits','nav.visits'],['/librarian/catalog','nav.catalog'],['/librarian/students','admin.nav.students'],['/librarian/analytics','admin.nav.analytics']],
  management: [['/management','nav.overview'],['/management/analytics','nav.analytics'],['/management/borrowings','nav.borrowings'],['/management/visits','nav.visits']]
};
export function StaffShell({ mode }) {
  const { t } = useLanguage(); const links = navigation[mode] || navigation.librarian; const homePath = mode === 'management' ? '/management' : '/librarian';
  return <div className="staff-shell"><aside className="staff-sidebar"><NavLink to={homePath} className="staff-sidebar__brand"><BrandLogo variant="full" surface="dark" className="staff-sidebar__logo" /></NavLink><span className="staff-sidebar__eyebrow">{mode==='management'?t('roles.MANAGEMENT'):t('roles.LIBRARIAN')}</span><nav className="staff-sidebar__nav">{links.map(([to,key])=><NavLink key={to} to={to} end={to===homePath} className={({isActive})=>isActive?'is-active':undefined}><span className="staff-sidebar__dot" aria-hidden="true"/>{t(key)}</NavLink>)}</nav></aside><div className="staff-workspace"><header className="staff-topbar"><div><span>{t('common.academy')}</span><strong>{mode==='management'?t('shell.managementWorkspace'):t('shell.librarianWorkspace')}</strong></div><ShellControls/></header><main className="staff-content"><Outlet/></main></div></div>;
}
