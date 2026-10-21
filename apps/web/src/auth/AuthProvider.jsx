import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import { apiRequest } from '../lib/api';
import { AUTH_SESSION_KEY } from './auth-config';

export const AuthContext = createContext(null);

function readSessionToken() {
  if (typeof window === 'undefined') return null;

  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(AUTH_SESSION_KEY, token);
    } else {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    }
  } catch {
    // The active tab can continue in memory.
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readSessionToken);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(
    token ? 'loading' : 'anonymous'
  );

  const clearSession = useCallback(() => {
    writeSessionToken(null);
    setToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;
    setStatus('loading');

    apiRequest('/auth/me', { token })
      .then((response) => {
        if (cancelled) return;

        if (!response?.user) {
          throw new Error('The authentication profile is missing.');
        }

        setUser(response.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });

    return () => {
      cancelled = true;
    };
  }, [token, clearSession]);

  const devLogin = useCallback(
    async (universityEmail) => {
      setStatus('loading');

      try {
        const response = await apiRequest('/auth/dev-login', {
          method: 'POST',
          body: { universityEmail }
        });

        if (!response?.accessToken || !response?.user) {
          throw new Error('The authentication response is incomplete.');
        }

        writeSessionToken(response.accessToken);
        setToken(response.accessToken);
        setUser(response.user);
        setStatus('authenticated');

        return response.user;
      } catch (error) {
        clearSession();
        throw error;
      }
    },
    [clearSession]
  );

  const value = useMemo(
    () => ({
      token,
      user,
      roles: user?.roles || [],
      status,
      isAuthenticated: status === 'authenticated',
      devLogin,
      logout: clearSession
    }),
    [token, user, status, devLogin, clearSession]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
