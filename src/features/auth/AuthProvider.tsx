import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, login as apiLogin, onAuthExpired, sessionStore, setSessionToken } from '../../lib/api';
import type { User } from '../../lib/types';

type Status = 'checking' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  notice: string | null;
  signIn: (googleIdToken: string) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the signed-in state. Identity is always established by the backend:
 * the browser only ever holds the opaque session token it was given.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (sessionStore.get() ? 'checking' : 'signedOut'));
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = useCallback((message: string | null) => {
    sessionStore.clear();
    setSessionToken(null);
    qc.clear();
    setUser(null);
    setNotice(message);
    setStatus('signedOut');
  }, [qc]);

  // Restore a stored session and confirm it with the server.
  useEffect(() => {
    const stored = sessionStore.get();
    if (!stored) return;
    setSessionToken(stored.token);
    api<{ user: User }>('getProfile', {}, { read: true })
      .then((p) => {
        setUser(p.user);
        setStatus('signedIn');
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'AUTH') reset('Your session has ended. Please sign in again.');
        else reset(err instanceof Error ? err.message : 'Could not restore your session.');
      });
  }, [reset]);

  useEffect(() => onAuthExpired(() => reset('Your session has ended. Please sign in again.')), [reset]);

  const signIn = useCallback(async (googleIdToken: string) => {
    setNotice(null);
    const res = await apiLogin(googleIdToken);
    sessionStore.set({ token: res.token, expiresAt: res.expiresAt });
    setSessionToken(res.token);
    qc.clear();
    setUser(res.user);
    setStatus('signedIn');
  }, [qc]);

  const signOut = useCallback(async (everywhere = false) => {
    try {
      await api(everywhere ? 'logoutAll' : 'logout');
    } catch {
      /* the local session is cleared regardless */
    }
    reset(everywhere ? 'You have been signed out on all devices.' : null);
  }, [reset]);

  const value = useMemo(() => ({ status, user, notice, signIn, signOut, setUser }), [status, user, notice, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user (only valid inside authenticated routes). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('No signed-in user');
  return user;
}
