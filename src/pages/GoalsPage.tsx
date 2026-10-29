import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, Minus, Pencil, PiggyBank, Plus, Trash } from 'lucide-react';
import { useAction, useGoals } from '../lib/queries';
import { COMMON_CURRENCIES, formatDate, formatMoney, formatPercent } from '../lib/format';
import type { SavingsGoal } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, FormError, IconButton, Modal, PageHeader, ProgressBar, SelectField, Spinner, TextField, Segmented
} from '../components/ui';

export default function GoalsPage() {
  const q = useGoals();
  const [editing, setEditing] = useState<SavingsGoal | null | 'new'>(null);
  const [contrib, setContrib] = useState<SavingsGoal | null>(null);
  const [deleting, setDeleting] = useState<SavingsGoal | null>(null);
  const update = useAction('updateSavingsGoal');
  const del = useAction('deleteSavingsGoal');
  const delContribution = useAction('deleteGoalContribution');

  return (
    <div className="space-y-6">
      <PageHeader title="Savings goals" subtitle="Set money aside for what matters" actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New goal</Button>} />
      <Alert tone="info">Goals are earmarks on money already in your accounts. Contributions don’t move cash and aren’t added to net worth again.</Alert>
      <FormError error={update.error ?? delContribution.error} />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data.length ? (
        <Card><EmptyState icon={<PiggyBank className="size-6" />} title="No savings goals yet" description="Create a goal for a holiday, emergency fund, car or school fees and track your progress." action={<Button onClick={() => setEditing('new')}>Create a goal</Button>} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.map((g) => (
            <Card key={g.id} className={`p-5 ${g.archived ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{g.name}</p>
                  <p className="text-xs text-ink-3">
                    {g.targetDate ? `Target ${formatDate(g.targetDate)}` : 'No target date'}{g.accountName ? ` · held in ${g.accountName}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {g.progress >= 1 && <Badge tone="positive">Reached</Badge>}
                  {g.overdue && <Badge tone="warning">Past target date</Badge>}
                  {g.archived && <Badge>Archived</Badge>}
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <p className="text-2xl font-semibold tabular">{formatMoney(g.saved, g.currency)}</p>
                <p className="text-sm text-ink-3 tabular">of {formatMoney(g.targetAmount, g.currency)}</p>
              </div>
              <div className="mt-2"><ProgressBar value={g.progress} tone="positive" label={`${g.name} progress`} /></div>
              <div className="mt-2 flex justify-between text-xs text-ink-3">
                <span>{formatPercent(g.progress, 0)} · {formatMoney(g.remaining, g.currency)} to go</span>
                {g.monthlyNeeded !== null && g.remaining > 0 && <span>{formatMoney(g.monthlyNeeded, g.currency)}/month for {g.monthsLeft} months</span>}
              </div>
              {g.accountBalance !== null && g.saved > g.accountBalance && (
                <p className="mt-2 text-xs text-warning">Saved amount exceeds the linked account’s balance ({formatMoney(g.accountBalance, g.currency)}).</p>
              )}
              {g.contributions.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-ink-2">History ({g.contributions.length})</summary>
                  <ul className="mt-2 divide-y divide-line">
                    {g.contributions.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="w-24 text-ink-3">{formatDate(c.date)}</span>
                        <span className="flex-1 truncate text-ink-2">{c.note || (c.amount >= 0 ? 'Contribution' : 'Withdrawal')}</span>
                        <span className={`tabular ${c.amount < 0 ? 'text-negative' : 'text-positive'}`}>{formatMoney(c.amount, g.currency, { sign: true })}</span>
                        <IconButton label="Delete entry" onClick={() => delContribution.mutate({ id: c.id })}><Trash className="size-3.5" /></IconButton>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {!g.archived && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setContrib(g)}>Add / withdraw</Button>}
                <span className="flex-1" />
                <IconButton label="Edit goal" onClick={() => setEditing(g)}><Pencil className="size-4" /></IconButton>
                <IconButton label={g.archived ? 'Restore goal' : 'Archive goal'} onClick={() => update.mutate({ id: g.id, archived: !g.archived })}>{g.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</IconButton>
                <IconButton label="Delete goal" onClick={() => { del.reset(); setDeleting(g); }}><Trash className="size-4" /></IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New savings goal' : 'Edit goal'}>
        {editing !== null && <GoalForm goal={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!contrib} onClose={() => setContrib(null)} title={`Update “${contrib?.name ?? ''}”`}>
        {contrib && <ContributionForm goal={contrib} onDone={() => setContrib(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting} title="Delete goal?" loading={del.isPending} error={del.error}
        message={<>Delete <strong>{deleting?.name}</strong> and its contribution history? Your account balances are not affected.</>}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

function GoalForm({ goal, onDone }: { goal: SavingsGoal | null; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('addSavingsGoal');
  const update = useAction('updateSavingsGoal');
  const m = goal ? update : add;
  const [name, setName] = useState(goal?.name ?? '');
  const [targetAmount, setTarget] = useState(goal ? String(goal.targetAmount) : '');
  const [initialAmount, setInitial] = useState(goal ? String(goal.initialAmount) : '0');
  const [currency, setCurrency] = useState(goal?.currency ?? f.base);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name, targetAmount: Number(targetAmount), initialAmount: Number(initialAmount || 0), currency, targetDate, accountId };
    if (goal) payload.id = goal.id;
    m.mutate(payload, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField label="Goal name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Target amount" type="number" min="0.01" step="0.01" required value={targetAmount} onChange={(e) => setTarget(e.target.value)} />
        <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <TextField label="Already saved" type="number" min="0" step="0.01" value={initialAmount} onChange={(e) => setInitial(e.target.value)} hint="Amount set aside before tracking here" />
        <TextField label="Target date (optional)" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </div>
      <SelectField label="Held in account (optional)" value={accountId} onChange={(e) => setAccountId(e.target.value)} hint="For reference only — no money is moved.">
        <option value="">Not linked</option>
        {f.accounts.filter((a) => !a.archived || a.id === accountId).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
      </SelectField>
      <FormError error={m.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>{goal ? 'Save' : 'Create goal'}</Button>
      </div>
    </form>
  );
}

function ContributionForm({ goal, onDone }: { goal: SavingsGoal; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('addGoalContribution');
  const [kind, setKind] = useState<'contribution' | 'withdrawal'>('contribution');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(f.today);
  const [note, setNote] = useState('');
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate({ goalId: goal.id, kind, amount: Number(amount), date, note }, { onSuccess: onDone }); }}>
      <Segmented label="Direction" value={kind} onChange={setKind} options={[{ value: 'contribution', label: 'Add to goal' }, { value: 'withdrawal', label: 'Withdraw' }]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={`Amount (${goal.currency})`} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <TextField label="Note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="flex items-center gap-1 text-xs text-ink-3">{kind === 'withdrawal' ? <Minus className="size-3" /> : <Plus className="size-3" />} Currently saved: {formatMoney(goal.saved, goal.currency)}</p>
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={add.isPending}>Save</Button>
      </div>
    </form>
  );
}
