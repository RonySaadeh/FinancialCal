import { config } from '../config';

/**
 * Client for the Apps Script Web App.
 *
 * Every call is a POST with Content-Type text/plain and a JSON body
 * { action, token, payload }. That is a CORS "simple request": the browser
 * sends it without a preflight (Apps Script cannot answer OPTIONS) and
 * follows Google's redirect to the script output, which is served with
 * Access-Control-Allow-Origin: *. Custom headers such as Authorization would
 * force a preflight, so the session token travels in the body.
 */

export type ApiErrorCode =
  | 'AUTH' | 'LOCKED' | 'FORBIDDEN' | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'BUSY'
  | 'CONFIG' | 'BAD_REQUEST' | 'UNKNOWN_ACTION' | 'INTERNAL' | 'NETWORK' | 'BAD_RESPONSE';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

interface StoredSession {
  token: string;
  expiresAt: string;
}

const SESSION_KEY = 'financial-cal.session';

/**
 * The session token is an opaque, revocable bearer token (not a password).
 * It is kept in localStorage so the family does not have to sign in on every
 * visit; signing out deletes it server-side as well.
 */
export const sessionStore = {
  get(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as StoredSession;
      if (!s.token || !s.expiresAt || new Date(s.expiresAt).getTime() < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  },
  set(s: StoredSession) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
  },
  clear() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
};

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

/** Notified when the backend rejects the session (expired, revoked, disabled). */
export function onAuthExpired(listener: AuthListener) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

let memoryToken: string | null = null;

export function setSessionToken(token: string | null) {
  memoryToken = token;
}


async function send<T>(action: string, payload: unknown, token: string | null): Promise<T> {
  if (!config.apiUrl) {
    throw new ApiError('CONFIG', 'The app is not configured: VITE_API_URL is missing.');
  }
  let res: Response;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, payload }),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the server. Check your internet connection and try again.');
  }
  const text = await res.text();
  let body: { ok: boolean; data?: T; error?: { code: ApiErrorCode; message: string } };
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(
      'BAD_RESPONSE',
      'The server returned an unexpected response. Make sure the Apps Script web app is deployed with access set to "Anyone".'
    );
  }
  if (!body.ok) {
    const err = new ApiError(body.error?.code ?? 'INTERNAL', body.error?.message ?? 'Request failed.');
    if (err.code === 'AUTH' && token) authListeners.forEach((l) => l());
    throw err;
  }
  return body.data as T;
}

/**
 * Calls an API action with the current session. Retries once when the server
 * was busy (the write was not applied). Reads also retry once after a network
 * error; writes do not, because the first attempt may have been applied.
 */
export async function api<T>(action: string, payload: Record<string, unknown> = {}, opts: { read?: boolean } = {}): Promise<T> {
  const token = memoryToken;
  const retryable: ApiErrorCode[] = opts.read ? ['NETWORK', 'BUSY'] : ['BUSY'];
  try {
    return await send<T>(action, payload, token);
  } catch (err) {
    if (err instanceof ApiError && retryable.includes(err.code)) {
      await new Promise((r) => setTimeout(r, 800));
      return send<T>(action, payload, token);
    }
    throw err;
  }
}

type LoginResult = { token: string; expiresAt: string; user: import('./types').User };

/** Public login call (no session yet). */
export function login(username: string, password: string) {
  return send<LoginResult>('login', { username, password, userAgent: navigator.userAgent.slice(0, 300) }, null);
}

/** Public self-registration (only accepted when the administrator enabled it). */
export function register(username: string, password: string, displayName: string) {
  return send<LoginResult>('register', { username, password, displayName, userAgent: navigator.userAgent.slice(0, 300) }, null);
}

/** Public health check; tells the login screen whether registration is open. */
export function health() {
  return send<{ name: string; version: string; registrationEnabled: boolean }>('health', {}, null);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
