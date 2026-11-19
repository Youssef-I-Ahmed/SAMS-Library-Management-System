import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { BrandLogo } from '../components/brand/BrandLogo';
import { ShellControls } from '../components/layout/ShellControls';
import { useLanguage } from '../hooks/useLanguage';
import { AI_ASSISTANT_ENABLED } from '../features/ai/ai-config.js';
const navigation = {
  librarian: [['/librarian','nav.dashboard'],['/librarian/borrow','nav.borrow'],['/librarian/return','nav.return'],['/librarian/reservations','nav.reservations'],['/librarian/visits','nav.visits'],['/librarian/catalog','nav.catalog'],['/librarian/students','admin.nav.students'],['/librarian/analytics','admin.nav.analytics']],
  management: [['/management','nav.overview'],['/management/borrowings','nav.borrowings'],['/management/visits','nav.visits']]
};
export function StaffShell({ mode }) {
  const { t, language } = useLanguage();
  const homePath = mode === 'management' ? '/management' : '/librarian';
  const isAssistant = useMatch(`${homePath}/ai`);
  const circulationRoute = useMatch('/librarian/:workflow');
  const librarianHome = useMatch('/librarian');
  const managementHome = useMatch('/management');
  const managementRoute = useMatch('/management/:workflow');
  const managementAnalyticsAlias = Boolean(useMatch('/management/analytics'));
  const isCirculation = mode === 'librarian'
    ? Boolean(librarianHome) || ['borrow', 'return', 'reservations', 'visits', 'catalog', 'students', 'analytics'].includes(circulationRoute?.params.workflow)
    : Boolean(managementHome) || ['analytics', 'borrowings', 'visits'].includes(managementRoute?.params.workflow);
  const navRef = useRef(null);
  useEffect(() => {
    if (!isCirculation) return;
    const nav = navRef.current;
    const revealActive = () => {
      const active = nav?.querySelector('[aria-current="page"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const bounds = nav.getBoundingClientRect(), link = active.getBoundingClientRect();
      const offset = link.left < bounds.left ? link.left - bounds.left : link.right > bounds.right ? link.right - bounds.right : 0;
      nav.scrollBy({ left: offset, behavior: 'instant' });
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [isCirculation, circulationRoute?.params.workflow, managementRoute?.params.workflow, language]);
  const baseLinks = navigation[mode] || navigation.librarian;
  const links = AI_ASSISTANT_ENABLED ? [baseLinks[0], [`${homePath}/ai`, 'ai.nav'], ...baseLinks.slice(1)] : baseLinks;
  return <div className={`staff-shell${isAssistant && AI_ASSISTANT_ENABLED ? ' staff-shell--assistant' : ''}${isCirculation ? ' staff-shell--circulation' : ''}`}>{isCirculation && <a className="staff-skip-link" href="#staff-main" onClick={(event) => { event.preventDefault(); document.getElementById('staff-main')?.focus(); }}>{t('common.skipToContent')}</a>}<aside className="staff-sidebar"><NavLink to={homePath} className="staff-sidebar__brand"><BrandLogo variant="full" surface="dark" className="staff-sidebar__logo" /></NavLink><span className="staff-sidebar__eyebrow">{mode==='management'?t('roles.MANAGEMENT'):t('roles.LIBRARIAN')}</span><nav ref={navRef} className="staff-sidebar__nav" aria-label={t(mode === 'librarian' ? 'staff.ux.navigation' : 'admin.reporting.managementNavigation')}>{links.map(([to,key])=><NavLink key={to} to={to} end={to===homePath && !managementAnalyticsAlias} className={({isActive})=>isActive?'is-active':undefined}><span className="staff-sidebar__dot" aria-hidden="true"/>{t(key)}</NavLink>)}</nav></aside><div className="staff-workspace"><header className="staff-topbar"><div><span>{t('common.academy')}</span><strong>{mode==='management'?t('shell.managementWorkspace'):t('shell.librarianWorkspace')}</strong></div><ShellControls/></header><main className="staff-content" id={isCirculation ? 'staff-main' : undefined} tabIndex={isCirculation ? -1 : undefined}><Outlet/></main></div></div>;
}
