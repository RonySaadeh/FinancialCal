import { useEffect, useRef, useState } from 'react';
import { config } from '../../config';
import { useTheme } from '../theme/ThemeProvider';

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean; itp_support?: boolean }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Google Sign-In. Check your connection or content blockers.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Renders Google's official Sign-In button (Google Identity Services).
 * Google returns an ID token (JWT) which we pass to the backend for
 * verification; the frontend never decides who the user is.
 */
export function GoogleSignInButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolved } = useTheme();
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: (r) => cb.current(r.credential),
          ux_mode: 'popup',
          itp_support: true
        });
        ref.current.innerHTML = '';
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: resolved === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          width: 300
        });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} className="flex min-h-11 justify-center" />
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}
