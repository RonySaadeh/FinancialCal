import { useState, type FormEvent } from 'react';
import { BarChart3, Lock, ShieldCheck, Users } from 'lucide-react';
import { config, isConfigured } from '../config';
import { errorMessage } from '../lib/api';
import { useAuth } from '../features/auth/AuthProvider';
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton';
import { Alert, Button, TextField } from '../components/ui';

export function LoginPage() {
  const { signIn, notice } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (idToken: string) => {
    setBusy(true);
    setError(null);
    try {
      await signIn(idToken);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-indigo-600/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-600/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600">
            <BarChart3 className="size-5" aria-hidden />
          </div>
          <span className="text-lg font-semibold">Financial Cal</span>
        </div>
        <div className="relative max-w-md space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Your family’s money, clearly organised.</h1>
          <p className="text-base text-indigo-100/80">Track spending, budgets, savings goals, debts and investments — stored in your own Google Sheet.</p>
          <ul className="space-y-3 text-sm text-indigo-100/90">
            <li className="flex items-center gap-3"><ShieldCheck className="size-5 text-indigo-300" aria-hidden /> Google sign-in, verified on the server</li>
            <li className="flex items-center gap-3"><Users className="size-5 text-indigo-300" aria-hidden /> Separate, private records for each person</li>
            <li className="flex items-center gap-3"><Lock className="size-5 text-indigo-300" aria-hidden /> No passwords stored anywhere</li>
          </ul>
        </div>
        <p className="relative text-xs text-indigo-200/60">Data lives in a Google Sheet owned by your family administrator.</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand lg:hidden">
              <BarChart3 className="size-6" aria-hidden />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-ink-3">Sign in with the Google account your administrator invited.</p>
          </div>

          {!isConfigured ? (
            <Alert tone="error">
              This copy of Financial Cal is not configured yet. Set <code>VITE_API_URL</code> and <code>VITE_GOOGLE_CLIENT_ID</code> (see README) and rebuild.
            </Alert>
          ) : (
            <div className="space-y-4">
              {import.meta.env.DEV && config.devAuth ? <DevSignIn onToken={handle} busy={busy} /> : <GoogleSignInButton onCredential={handle} />}
              {busy && <p className="text-center text-sm text-ink-3" role="status">Verifying your account…</p>}
            </div>
          )}
          {notice && !error && <Alert tone="info">{notice}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <p className="text-center text-xs text-ink-3">
            Passwords are handled by Google. Forgot yours?{' '}
            <a className="font-medium text-brand" href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer">Recover your Google account</a>.
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * Local development only (VITE_DEV_AUTH=true with `npm run dev`). The token
 * it produces is only accepted by scripts/dev-backend.mjs; the real Apps
 * Script backend verifies every token with Google and rejects these.
 */
function DevSignIn({ onToken, busy }: { onToken: (t: string) => void; busy: boolean }) {
  const [email, setEmail] = useState('rony@example.com');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onToken(`dev|${email.trim().toLowerCase()}`);
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-dashed border-warning/50 p-4">
      <p className="text-xs font-medium text-warning">Development sign-in (local dev backend only)</p>
      <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
    </form>
  );
}
