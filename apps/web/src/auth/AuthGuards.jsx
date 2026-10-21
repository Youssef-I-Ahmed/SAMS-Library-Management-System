import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getDefaultRoute, hasAnyRole } from './auth-config';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/ui/LoadingScreen';

export function RootRedirect() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return <LoadingScreen />;
  }

  return (
    <Navigate
      to={
        auth.isAuthenticated
          ? getDefaultRoute(auth.roles)
          : '/login'
      }
      replace
    />
  );
}

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

export function RequireRole({ roles }) {
  const auth = useAuth();

  if (!hasAnyRole(auth.roles, roles)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
