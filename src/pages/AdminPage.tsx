import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { useAction, useAdminUsers } from '../lib/queries';
import { formatDateTime } from '../lib/format';
import { useUser } from '../features/auth/AuthProvider';
import { Alert, Button, Card, CardHeader, Checkbox, ErrorState, FormError, IconButton, Modal, PageHeader, Select, SelectField, Spinner, TextField } from '../components/ui';
import type { User } from '../lib/types';

/** Admins manage who can sign in. They cannot see anyone else's financial data. */
export default function AdminPage() {
  const me = useUser();
  const q = useAdminUsers(true);
  const create = useAction('adminCreateUser');
  const [resetting, setResetting] = useState<User | null>(null);
  const update = useAction('adminUpdateUser');
  const reg = useAction('adminSetRegistration');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ username, password, displayName: name, role }, { onSuccess: () => { setUsername(''); setPassword(''); setName(''); } });
  };

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Create family accounts, reset passwords and control access" />
      <Alert tone="info">Each person’s financial records are private to them. Administrators manage accounts and passwords only — they cannot view other users’ finances in the app.</Alert>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="People" />
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Last sign-in</th><th className="px-3 py-2"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2.5"><p className="font-medium">{u.displayName}</p><p className="text-xs text-ink-3">@{u.username}</p></td>
                    <td className="px-3 py-2.5">
                      <Select aria-label={`Status of ${u.username}`} className="h-8 w-32 text-xs" value={u.status} disabled={u.id === me.id || update.isPending}
                        onChange={(e) => update.mutate({ id: u.id, status: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5">
                      <Select aria-label={`Role of ${u.username}`} className="h-8 w-32 text-xs" value={u.role} disabled={u.id === me.id || update.isPending}
                        onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-3">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <IconButton label={`Reset password for ${u.username}`} onClick={() => setResetting(u)}><KeyRound className="size-4" /></IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-5"><FormError error={update.error} /></div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Add a person" subtitle="Share the username and password with them" />
            <form onSubmit={submit} className="space-y-4 p-5">
              <TextField label="Username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} pattern="[A-Za-z0-9._\-]+" value={username} onChange={(e) => setUsername(e.target.value)} hint="Letters, numbers, dot, dash, underscore" />
              <TextField label="Password" type="text" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters. They can change it in Profile." />
              <TextField label="Display name (optional)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </SelectField>
              <FormError error={create.error} />
              {create.isSuccess && <Alert tone="success">Account created. They can sign in now.</Alert>}
              <Button type="submit" icon={<UserPlus className="size-4" />} loading={create.isPending}>Create account</Button>
            </form>
          </Card>
          <Card>
            <CardHeader title="Self-registration" />
            <div className="space-y-3 p-5">
              <Checkbox
                label="Allow anyone with the link to create an account"
                hint="Keep this off for a private family app; create accounts here instead."
                checked={q.data.registrationEnabled}
                onChange={(v) => reg.mutate({ enabled: v })}
              />
              <FormError error={reg.error} />
              <p className="flex items-center gap-2 text-xs text-ink-3"><ShieldCheck className="size-4" /> Currently {q.data.registrationEnabled ? 'open' : 'invite-only'}.</p>
            </div>
          </Card>
        </div>
      </div>
      <Modal open={!!resetting} onClose={() => setResetting(null)} title={`Reset password · ${resetting?.username ?? ''}`}>
        {resetting && <ResetPassword user={resetting} onDone={() => setResetting(null)} />}
      </Modal>
    </div>
  );
}

function ResetPassword({ user, onDone }: { user: User; onDone: () => void }) {
  const reset = useAction('adminResetPassword');
  const [password, setPassword] = useState('');
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); reset.mutate({ id: user.id, password }, { onSuccess: onDone }); }}>
      <p className="text-sm text-ink-2">Set a new password for <strong>{user.displayName}</strong>. They will be signed out on all devices and can change it later in Profile.</p>
      <TextField label="New password" type="text" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      <FormError error={reset.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={reset.isPending}>Reset password</Button>
      </div>
    </form>
  );
}
