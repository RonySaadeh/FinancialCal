import { useState, type FormEvent } from 'react';
import { ExternalLink, KeyRound, LogOut, Monitor, Moon, Sun, Trash } from 'lucide-react';
import { useAction, useProfile } from '../lib/queries';
import { COMMON_CURRENCIES, formatDateTime } from '../lib/format';
import type { Theme, User } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { useTheme } from '../features/theme/ThemeProvider';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, FormError, IconButton, PageHeader, SelectField, Spinner, TextField, Segmented } from '../components/ui';

export default function ProfilePage() {
  const q = useProfile();
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your details, preferences and security" />
      <div className="grid gap-6 xl:grid-cols-2">
        <ProfileForm user={p.user} />
        <Security sessions={p.sessions} />
        <Rates base={p.user.preferredCurrency} rates={p.exchangeRates} />
        <Appearance />
      </div>
    </div>
  );
}

function ProfileForm({ user }: { user: User }) {
  const { setUser } = useAuth();
  const update = useAction<Record<string, unknown>, User>('updateProfile');
  const [displayName, setName] = useState(user.displayName);
  const [currency, setCurrency] = useState(user.preferredCurrency);
  const [saved, setSaved] = useState(false);
  const currencyChanged = currency !== user.preferredCurrency;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    update.mutate({ displayName, preferredCurrency: currency }, { onSuccess: (u) => { setUser(u); setSaved(true); } });
  };
  return (
    <Card>
      <CardHeader title="Personal details" />
      <form onSubmit={submit} className="space-y-4 p-5">
        <TextField label="Display name" required maxLength={80} value={displayName} onChange={(e) => setName(e.target.value)} />
        <TextField label="Email (Google account)" value={user.email} disabled readOnly />
        <SelectField label="Preferred currency" value={currency} onChange={(e) => setCurrency(e.target.value)} hint="Dashboards, budgets and reports are shown in this currency.">
          {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        {currencyChanged && <Alert>Changing your preferred currency removes your saved exchange rates (they are relative to it), and existing budget amounts will be read in the new currency.</Alert>}
        <div className="flex flex-wrap gap-2 text-xs text-ink-3">
          <Badge tone={user.role === 'admin' ? 'brand' : 'neutral'}>{user.role}</Badge>
          <span>Member since {formatDateTime(user.createdAt)}</span>
        </div>
        <FormError error={update.error} />
        {saved && <Alert tone="success">Saved.</Alert>}
        <div className="flex justify-end"><Button type="submit" loading={update.isPending}>Save</Button></div>
      </form>
    </Card>
  );
}

function Security({ sessions }: { sessions: { id: string; createdAt: string; expiresAt: string; userAgent: string; current: boolean }[] }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Sign-in & security" />
      <div className="space-y-5 p-5 text-sm">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div className="space-y-2">
            <p className="text-ink-2">
              You sign in with Google. Financial Cal never sees or stores a password; your identity is verified by Google and checked on the server for every request.
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2" href="https://myaccount.google.com/signinoptions/password" target="_blank" rel="noreferrer">
                Change Google password <ExternalLink className="size-3" aria-hidden />
              </a>
              <a className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2" href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer">
                Reset / recover account <ExternalLink className="size-3" aria-hidden />
              </a>
              <a className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">
                Google security checkup <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-ink-2">Active sessions ({sessions.length})</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink-2" title={s.userAgent}>{describeAgent(s.userAgent)}</span>
                <span className="text-ink-3">since {formatDateTime(s.createdAt)}</span>
                {s.current && <Badge tone="positive">This device</Badge>}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="secondary" icon={<LogOut className="size-4" />} loading={busy} onClick={async () => { setBusy(true); await signOut(true); }}>
          Sign out on all devices
        </Button>
      </div>
    </Card>
  );
}

function describeAgent(ua: string) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

function Rates({ base, rates }: { base: string; rates: Record<string, number> }) {
  const set = useAction('setExchangeRate');
  const del = useAction('deleteExchangeRate');
  const [currency, setCurrency] = useState(COMMON_CURRENCIES.find((c) => c !== base && !(c in rates)) ?? 'USD');
  const [rate, setRate] = useState('');
  return (
    <Card>
      <CardHeader title="Exchange rates" subtitle={`Used to convert other currencies into ${base}. Amounts without a rate are shown separately, never mixed.`} />
      <div className="space-y-4 p-5">
        {Object.keys(rates).length ? (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {Object.entries(rates).map(([cur, r]) => (
              <li key={cur} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 tabular">1 {cur} = {r} {base}</span>
                <IconButton label={`Remove ${cur} rate`} onClick={() => del.mutate({ currency: cur })}><Trash className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-3">No rates yet.</p>}
        <form className="grid items-end gap-3 sm:grid-cols-[8rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); set.mutate({ currency, rate: Number(rate) }, { onSuccess: () => setRate('') }); }}>
          <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {COMMON_CURRENCIES.filter((c) => c !== base).map((c) => <option key={c} value={c}>{c}</option>)}
          </SelectField>
          <TextField label={`1 ${currency} in ${base}`} type="number" min="0" step="any" required value={rate} onChange={(e) => setRate(e.target.value)} placeholder={currency === 'USD' && base === 'AED' ? '3.6725' : ''} />
          <Button type="submit" loading={set.isPending}>Save rate</Button>
        </form>
        <FormError error={set.error ?? del.error} />
      </div>
    </Card>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const { setUser, user } = useAuth();
  const update = useAction<Record<string, unknown>, User>('updateProfile');
  const choose = (t: Theme) => {
    setTheme(t);
    update.mutate({ theme: t }, { onSuccess: (u) => user && setUser(u) });
  };
  return (
    <Card>
      <CardHeader title="Appearance" />
      <div className="space-y-3 p-5">
        <Segmented label="Theme" value={theme} onChange={choose} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
        <p className="flex items-center gap-2 text-xs text-ink-3"><Sun className="size-3.5" /><Moon className="size-3.5" /><Monitor className="size-3.5" /> “System” follows your device setting.</p>
        <FormError error={update.error} />
      </div>
    </Card>
  );
}
