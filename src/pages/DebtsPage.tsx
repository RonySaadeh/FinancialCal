import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, CreditCard, Landmark, Pencil, Plus, Trash } from 'lucide-react';
import { useAction, useDebts } from '../lib/queries';
import { COMMON_CURRENCIES, DEBT_TYPE_LABELS, formatDate, formatMoney, formatPercent } from '../lib/format';
import type { Debt, DebtType } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import { TrendChart } from '../components/charts';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, FormError, IconButton, MissingRatesNotice, Modal, PageHeader, ProgressBar, SelectField, Spinner, TextField
} from '../components/ui';

export default function DebtsPage() {
  const q = useDebts();
  const [editing, setEditing] = useState<Debt | null | 'new'>(null);
  const [paying, setPaying] = useState<Debt | null>(null);
  const [deleting, setDeleting] = useState<Debt | null>(null);
  const update = useAction('updateDebt');
  const del = useAction('deleteDebt');
  const delPayment = useAction('deleteDebtPayment');

  return (
    <div className="space-y-6">
      <PageHeader title="Debts" subtitle="Loans and other liabilities, with every repayment recorded" actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add debt</Button>} />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <MissingRatesNotice currencies={q.data.missingRates} base={q.data.currency} />
          <FormError error={update.error ?? delPayment.error} />
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5"><p className="text-xs text-ink-3">Loans outstanding</p><p className="mt-2 text-xl font-semibold tabular">{formatMoney(q.data.totalOutstanding, q.data.currency)}</p></Card>
            <Card className="p-5"><p className="text-xs text-ink-3">Credit cards owed</p><p className="mt-2 text-xl font-semibold tabular">{formatMoney(q.data.totalCreditCardOwed, q.data.currency)}</p><p className="mt-1 text-xs text-ink-3">From your credit-card accounts</p></Card>
            <Card className="p-5">
              <p className="text-xs text-ink-3">Next payment</p>
              {q.data.upcoming[0] ? (
                <>
                  <p className="mt-2 text-xl font-semibold">{formatDate(q.data.upcoming[0].dueDate)}</p>
                  <p className="mt-1 text-xs text-ink-3">{q.data.upcoming[0].name}{q.data.upcoming[0].minimumPayment ? ` · ${formatMoney(q.data.upcoming[0].minimumPayment, q.data.upcoming[0].currency)}` : ''}</p>
                </>
              ) : <p className="mt-2 text-sm text-ink-3">Nothing scheduled</p>}
            </Card>
          </div>

          {q.data.debts.length === 0 && q.data.creditCards.length === 0 ? (
            <Card><EmptyState icon={<Landmark className="size-6" />} title="No debts tracked" description="Add personal, car or home loans to track balances, interest and payoff progress. Credit cards are tracked as accounts and appear here automatically." action={<Button onClick={() => setEditing('new')}>Add debt</Button>} /></Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-4 xl:col-span-2">
                {q.data.debts.map((d) => (
                  <Card key={d.id} className={`p-5 ${d.archived ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold">{d.name}</p>
                        <p className="text-xs text-ink-3">{DEBT_TYPE_LABELS[d.type]}{d.lender ? ` · ${d.lender}` : ''} · {d.interestRate}% APR{d.dueDay ? ` · due day ${d.dueDay}` : ''}</p>
                      </div>
                      <div className="flex gap-1">
                        {d.outstanding === 0 && <Badge tone="positive">Paid off</Badge>}
                        {d.archived && <Badge>Archived</Badge>}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-4">
                      <Metric label="Outstanding" value={formatMoney(d.outstanding, d.currency)} />
                      <Metric label="Original principal" value={formatMoney(d.originalPrincipal, d.currency)} />
                      <Metric label="Principal repaid" value={formatMoney(d.paidPrincipal, d.currency)} />
                      <Metric label="Interest paid" value={formatMoney(d.paidInterest, d.currency)} />
                    </div>
                    <div className="mt-4"><ProgressBar value={d.progress} tone="positive" label={`${d.name} payoff progress`} /></div>
                    <p className="mt-1 text-xs text-ink-3">
                      {formatPercent(d.progress, 0)} paid off{d.nextDueDate ? ` · next due ${formatDate(d.nextDueDate)}` : ''}{d.minimumPayment ? ` · minimum ${formatMoney(d.minimumPayment, d.currency)}` : ''}
                      {d.outstanding > 0 && d.interestRate > 0 ? ` · ≈${formatMoney(d.monthlyInterestEstimate, d.currency)} interest/month` : ''}
                    </p>
                    {d.payments.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-ink-2">Repayments ({d.payments.length})</summary>
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full min-w-[480px] text-xs">
                            <thead className="text-left text-ink-3"><tr><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">Paid</th><th className="py-1 text-right font-medium">Principal</th><th className="py-1 text-right font-medium">Interest</th><th className="py-1 font-medium pl-3">From</th><th /></tr></thead>
                            <tbody className="divide-y divide-line">
                              {d.payments.map((p) => (
                                <tr key={p.id}>
                                  <td className="py-1.5">{formatDate(p.date)}</td>
                                  <td className="py-1.5 text-right tabular">{formatMoney(p.amount, d.currency)}</td>
                                  <td className="py-1.5 text-right tabular">{formatMoney(p.principal, d.currency)}</td>
                                  <td className="py-1.5 text-right tabular">{formatMoney(p.interest, d.currency)}</td>
                                  <td className="py-1.5 pl-3 text-ink-3"><AccountName id={p.accountId} /></td>
                                  <td className="text-right"><IconButton label="Delete repayment" disabled={delPayment.isPending} onClick={() => delPayment.mutate({ id: p.id })}><Trash className="size-3.5" /></IconButton></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      {d.outstanding > 0 && !d.archived && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setPaying(d)}>Record repayment</Button>}
                      <span className="flex-1" />
                      <IconButton label="Edit debt" onClick={() => setEditing(d)}><Pencil className="size-4" /></IconButton>
                      <IconButton label={d.archived ? 'Restore debt' : 'Archive debt'} onClick={() => update.mutate({ id: d.id, archived: !d.archived })}>{d.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</IconButton>
                      <IconButton label="Delete debt" onClick={() => { del.reset(); setDeleting(d); }}><Trash className="size-4" /></IconButton>
                    </div>
                  </Card>
                ))}
                {q.data.creditCards.length > 0 && (
                  <Card>
                    <CardHeader title="Credit cards" subtitle="Balances come from your credit-card accounts (purchases are expenses; repayments are transfers)" />
                    <ul className="divide-y divide-line p-2">
                      {q.data.creditCards.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                          <CreditCard className="size-4 text-ink-3" aria-hidden />
                          <a href={`#/transactions?account=${c.id}`} className="flex-1 font-medium text-ink hover:text-brand">{c.name}</a>
                          <span className="tabular">{c.owed > 0 ? `${formatMoney(c.owed, c.currency)} owed` : 'Nothing owed'}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
              <div className="space-y-4">
                <Card>
                  <CardHeader title="Debt reduction" subtitle="Loans outstanding at each month end" />
                  <div className="p-5"><TrendChart data={q.data.history} xKey="month" yKey="outstanding" currency={q.data.currency} name="Outstanding" height={220} kind="line" /></div>
                </Card>
                <Card>
                  <CardHeader title="Upcoming payments" />
                  <ul className="space-y-2 p-5 text-sm">
                    {q.data.upcoming.length ? q.data.upcoming.map((u) => (
                      <li key={u.debtId} className="flex justify-between gap-3"><span className="truncate">{u.name}</span><span className="text-ink-3">{formatDate(u.dueDate)}</span></li>
                    )) : <li className="text-ink-3">Set a due day on a loan to see upcoming payments.</li>}
                  </ul>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add debt' : 'Edit debt'}>
        {editing !== null && <DebtForm debt={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!paying} onClose={() => setPaying(null)} title={`Repayment · ${paying?.name ?? ''}`}>
        {paying && <PaymentForm debt={paying} onDone={() => setPaying(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting} title="Delete debt?" loading={del.isPending} error={del.error}
        message={<>Delete <strong>{deleting?.name}</strong>, all its repayments and their linked account transactions? To keep history, archive it instead.</>}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-ink-3">{label}</p><p className="mt-0.5 font-semibold tabular">{value}</p></div>;
}

function AccountName({ id }: { id: string }) {
  const f = useFinance();
  return <>{id ? f.accountById.get(id)?.name ?? '—' : 'Not linked'}</>;
}

function DebtForm({ debt, onDone }: { debt: Debt | null; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('addDebt');
  const update = useAction('updateDebt');
  const m = debt ? update : add;
  const [s, setS] = useState({
    name: debt?.name ?? '', type: (debt?.type ?? 'personal_loan') as DebtType, lender: debt?.lender ?? '', currency: debt?.currency ?? f.base,
    originalPrincipal: debt ? String(debt.originalPrincipal) : '', openingBalance: debt ? String(debt.openingBalance) : '',
    interestRate: debt ? String(debt.interestRate) : '0', minimumPayment: debt ? String(debt.minimumPayment) : '',
    dueDay: debt?.dueDay ? String(debt.dueDay) : '', startDate: debt?.startDate ?? f.today, notes: debt?.notes ?? ''
  });
  const set = (k: keyof typeof s) => (e: { target: { value: string } }) => setS((p) => ({ ...p, [k]: e.target.value }));
  const locked = !!debt && debt.payments.length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: s.name, type: s.type, lender: s.lender, originalPrincipal: Number(s.originalPrincipal),
      openingBalance: s.openingBalance === '' ? Number(s.originalPrincipal) : Number(s.openingBalance),
      interestRate: Number(s.interestRate || 0), minimumPayment: Number(s.minimumPayment || 0), dueDay: s.dueDay === '' ? '' : Number(s.dueDay),
      startDate: s.startDate, notes: s.notes
    };
    if (!locked) payload.currency = s.currency;
    if (debt) payload.id = debt.id;
    m.mutate(payload, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField label="Name" required maxLength={80} value={s.name} onChange={set('name')} placeholder="e.g. Car loan" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" value={s.type} onChange={set('type')} hint={s.type === 'credit_card' ? 'If you track this card as an account, don’t add it here too.' : undefined}>
          {Object.entries(DEBT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        <TextField label="Lender (optional)" maxLength={80} value={s.lender} onChange={set('lender')} />
        <TextField label="Original principal" type="number" min="0.01" step="0.01" required value={s.originalPrincipal} onChange={set('originalPrincipal')} />
        <TextField label="Balance when you start tracking" type="number" min="0" step="0.01" value={s.openingBalance} onChange={set('openingBalance')} hint="Defaults to the original principal" />
        <SelectField label="Currency" value={s.currency} disabled={locked} onChange={set('currency')}>
          {[...new Set([s.currency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <TextField label="Interest rate (% per year)" type="number" min="0" max="100" step="0.01" value={s.interestRate} onChange={set('interestRate')} />
        <TextField label="Minimum monthly payment" type="number" min="0" step="0.01" value={s.minimumPayment} onChange={set('minimumPayment')} />
        <TextField label="Due day of month" type="number" min="1" max="31" step="1" value={s.dueDay} onChange={set('dueDay')} />
        <TextField label="Tracking start date" type="date" value={s.startDate} onChange={set('startDate')} />
      </div>
      <TextField label="Notes" maxLength={500} value={s.notes} onChange={set('notes')} />
      <FormError error={m.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>{debt ? 'Save' : 'Add debt'}</Button>
      </div>
    </form>
  );
}

function PaymentForm({ debt, onDone }: { debt: Debt; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('addDebtPayment');
  const accounts = f.openAccounts.filter((a) => a.currency === debt.currency);
  const [amount, setAmount] = useState(debt.minimumPayment ? String(debt.minimumPayment) : '');
  const [interest, setInterest] = useState(debt.monthlyInterestEstimate ? String(debt.monthlyInterestEstimate) : '0');
  const [date, setDate] = useState(f.today);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(f.expenseCategories.find((c) => c.name === 'Other')?.id ?? f.expenseCategories[0]?.id ?? '');
  const [note, setNote] = useState('');
  const principal = Math.max(0, Number(amount || 0) - Number(interest || 0));

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      add.mutate({ debtId: debt.id, amount: Number(amount), interest: Number(interest || 0), date, accountId, interestCategoryId: accountId && Number(interest) > 0 ? categoryId : '', note }, { onSuccess: onDone });
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={`Total paid (${debt.currency})`} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Of which interest" type="number" min="0" step="0.01" value={interest} onChange={(e) => setInterest(e.target.value)} hint="From your statement; estimate shown by default" />
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField label="Paid from account" value={accountId} onChange={(e) => setAccountId(e.target.value)} hint={accounts.length ? undefined : `No open ${debt.currency} accounts`}>
          <option value="">Don’t link (already recorded elsewhere)</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectField>
        {accountId && Number(interest) > 0 && (
          <SelectField label="Interest expense category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {f.expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
        )}
      </div>
      <TextField label="Note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
        Principal {formatMoney(principal, debt.currency)} reduces the balance ({formatMoney(debt.outstanding, debt.currency)} now).
        {accountId ? ' The account is debited by the full payment: principal as a transfer, interest as an expense.' : ' No account transaction is created.'}
      </p>
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={add.isPending}>Record repayment</Button>
      </div>
    </form>
  );
}
