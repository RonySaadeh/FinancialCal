import { useState, type FormEvent } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useAction, useAdminUsers } from '../lib/queries';
import { formatDateTime } from '../lib/format';
import { useUser } from '../features/auth/AuthProvider';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, ErrorState, FormError, PageHeader, Select, SelectField, Spinner, TextField } from '../components/ui';

/** Admins manage who can sign in. They cannot see anyone else's financial data. */
export default function AdminPage() {
  const me = useUser();
  const q = useAdminUsers(true);
  const invite = useAction('adminInviteUser');
  const update = useAction('adminUpdateUser');
  const reg = useAction('adminSetRegistration');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    invite.mutate({ email, displayName: name, role }, { onSuccess: () => { setEmail(''); setName(''); } });
  };

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Invite family members and control access" />
      <Alert tone="info">Each person’s financial records are private to them. Administrators manage access only — they cannot view other users’ finances.</Alert>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="People" />
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Last sign-in</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2.5"><p className="font-medium">{u.displayName}</p><p className="text-xs text-ink-3">{u.email}</p></td>
                    <td className="px-3 py-2.5">
                      {u.status === 'invited' ? <Badge tone="warning">Invited</Badge> : (
                        <Select aria-label={`Status of ${u.email}`} className="h-8 w-32 text-xs" value={u.status} disabled={u.id === me.id || update.isPending}
                          onChange={(e) => update.mutate({ id: u.id, status: e.target.value })}>
                          <option value="active">Active</option>
                          <option value="disabled">Disabled</option>
                        </Select>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Select aria-label={`Role of ${u.email}`} className="h-8 w-32 text-xs" value={u.role} disabled={u.id === me.id || update.isPending}
                        onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-3">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-5"><FormError error={update.error} /></div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Invite someone" subtitle="They sign in with this Google account" />
            <form onSubmit={submit} className="space-y-4 p-5">
              <TextField label="Google account email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <TextField label="Display name (optional)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </SelectField>
              <FormError error={invite.error} />
              {invite.isSuccess && <Alert tone="success">Invitation saved. They can now sign in with Google.</Alert>}
              <Button type="submit" icon={<UserPlus className="size-4" />} loading={invite.isPending}>Invite</Button>
            </form>
          </Card>
          <Card>
            <CardHeader title="Self-registration" />
            <div className="space-y-3 p-5">
              <Checkbox
                label="Allow anyone with a Google account to create an account"
                hint="Keep this off for a private family app; invite people instead."
                checked={q.data.registrationEnabled}
                onChange={(v) => reg.mutate({ enabled: v })}
              />
              <FormError error={reg.error} />
              <p className="flex items-center gap-2 text-xs text-ink-3"><ShieldCheck className="size-4" /> Currently {q.data.registrationEnabled ? 'open' : 'invite-only'}.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
