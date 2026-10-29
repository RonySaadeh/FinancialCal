import { useEffect, useState, type FormEvent } from 'react';
import { BarChart3, Eye, EyeOff, Lock, ShieldCheck, Users } from 'lucide-react';
import { isConfigured } from '../config';
import { errorMessage, health } from '../lib/api';
import { useAuth } from '../features/auth/AuthProvider';
import { Alert, Button, TextField } from '../components/ui';

export function LoginPage() {
  const { signIn, signUp, notice } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    health().then((h) => setRegistrationOpen(h.registrationEnabled)).catch(() => setRegistrationOpen(false));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(username, password);
      else await signUp(username, password, displayName);
    } catch (err) {
      setError(errorMessage(err));
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
            <li className="flex items-center gap-3"><ShieldCheck className="size-5 text-indigo-300" aria-hidden /> Passwords checked on the server, stored only as hashes</li>
            <li className="flex items-center gap-3"><Users className="size-5 text-indigo-300" aria-hidden /> Separate, private records for each person</li>
            <li className="flex items-center gap-3"><Lock className="size-5 text-indigo-300" aria-hidden /> Accounts lock after repeated wrong passwords</li>
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
            <h2 className="text-2xl font-semibold tracking-tight">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="text-sm text-ink-3">{mode === 'signin' ? 'Sign in with your username and password.' : 'Choose a username and a password of at least 8 characters.'}</p>
          </div>

          {!isConfigured ? (
            <Alert tone="error">
              This copy of Financial Cal is not configured yet. Set <code>VITE_API_URL</code> (see README) and rebuild.
            </Alert>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <TextField label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(e) => setUsername(e.target.value)} />
              {mode === 'register' && (
                <TextField label="Your name" autoComplete="name" maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              )}
              <div className="relative">
                <TextField
                  label="Password"
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 8 : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="[&_input]:pr-10"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute bottom-2.5 right-3 text-ink-3 hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button type="submit" className="w-full" loading={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
            </form>
          )}
          {notice && !error && <Alert tone="info">{notice}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="space-y-2 text-center text-xs text-ink-3">
            {registrationOpen && (
              <p>
                {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
                <button type="button" className="font-medium text-brand" onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); setError(null); }}>
                  {mode === 'signin' ? 'Create an account' : 'Sign in'}
                </button>
              </p>
            )}
            <p>Forgot your password? Ask the family administrator to reset it.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
