import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowDown, ArrowLeftRight, ArrowUp, Download, Loader2, Lock, Pencil, Plus, Repeat, Search, Trash } from 'lucide-react';
import { useAction, useTransactions } from '../lib/queries';
import { downloadCsv } from '../lib/csv';
import { formatDate, formatMoney, RECURRENCE_LABELS } from '../lib/format';
import { recurringSeries } from '../lib/recurring';
import type { Transaction } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import { TransactionForm } from '../features/transactions/TransactionForm';
import { useQuickAdd } from '../components/layout/AppLayout';
import { isPendingTransaction, useDeleteTransaction } from '../features/transactions/useTransactionMutations';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, FormError, IconButton, Input, PageHeader, Segmented, Select, Signed, Spinner
} from '../components/ui';

type SortKey = 'date' | 'amount' | 'description';

export default function TransactionsPage() {
  const q = useTransactions();
  const [tab, setTab] = useState<'all' | 'recurring'>('all');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        subtitle="Income, expenses and transfers across all your accounts"
        actions={<Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All' }, { value: 'recurring', label: 'Recurring' }]} />}
      />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : tab === 'all' ? <AllTransactions data={q.data} /> : <Recurring data={q.data} />}
    </div>
  );
}

function AllTransactions({ data }: { data: Transaction[] }) {
  const f = useFinance();
  const quick = useQuickAdd();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [limit, setLimit] = useState(50);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const del = useDeleteTransaction();

  const type = params.get('type') ?? '';
  const accountId = params.get('account') ?? '';
  const categoryId = params.get('category') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setLimit(50);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = data.filter((t) => {
      if (type && t.type !== type) return false;
      if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
      if (categoryId && t.categoryId !== categoryId) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (s) {
        const cat = f.categoryById.get(t.categoryId)?.name ?? '';
        const acc = f.accountById.get(t.accountId)?.name ?? '';
        const hay = `${t.description} ${t.notes} ${cat} ${acc} ${t.amount}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      const cmp = sort.key === 'amount' ? a.amount - b.amount : sort.key === 'description' ? a.description.localeCompare(b.description) : a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      return cmp * sort.dir;
    });
  }, [data, type, accountId, categoryId, from, to, search, sort, f]);

  const totals = useMemo(() => {
    const c = f.newConverter();
    let income = 0, expense = 0;
    for (const t of filtered) {
      const v = c.convert(t.amount, t.currency);
      if (v === null) continue;
      if (t.type === 'income') income += v;
      if (t.type === 'expense') expense += v;
    }
    return { income, expense, missing: c.missing() };
  }, [filtered, f]);

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'description' ? 1 : -1 }));
  const anyFilter = type || accountId || categoryId || from || to || search;

  const exportCsv = () => {
    downloadCsv(
      `financial-cal-transactions-${f.today}.csv`,
      ['Date', 'Type', 'Description', 'Category', 'Account', 'To account', 'Amount', 'Currency', 'Amount received', 'Notes', 'Recurrence', 'Managed by'],
      filtered.map((t) => [
        t.date, t.type, t.description, f.categoryById.get(t.categoryId)?.name ?? '', f.accountById.get(t.accountId)?.name ?? '',
        f.accountById.get(t.toAccountId)?.name ?? '', t.type === 'expense' ? -t.amount : t.amount, t.currency,
        t.toAmount === '' || t.toAmount === null ? '' : t.toAmount, t.notes, RECURRENCE_LABELS[t.recurrence] ?? '', t.linkType
      ])
    );
  };

  return (
    <>
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <span className="sr-only">Search transactions</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input className="pl-9" placeholder="Search description, notes, category…" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(50); }} />
          </label>
          <Select aria-label="Type" value={type} onChange={(e) => setParam('type', e.target.value)}>
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expenses</option>
            <option value="transfer">Transfers</option>
          </Select>
          <Select aria-label="Account" value={accountId} onChange={(e) => setParam('account', e.target.value)}>
            <option value="">All accounts</option>
            {f.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select aria-label="Category" value={categoryId} onChange={(e) => setParam('category', e.target.value)}>
            <option value="">All categories</option>
            {f.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === 'income' ? ' (income)' : ''}{c.archived ? ' (archived)' : ''}</option>)}
          </Select>
          <div className="flex gap-2">
            <Input aria-label="From date" type="date" value={from} onChange={(e) => setParam('from', e.target.value)} />
            <Input aria-label="To date" type="date" value={to} onChange={(e) => setParam('to', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-ink-3">
            {filtered.length} transaction{filtered.length === 1 ? '' : 's'} · income <span className="tabular text-ink">{formatMoney(totals.income, f.base)}</span> · expenses <span className="tabular text-ink">{formatMoney(totals.expense, f.base)}</span>
          </p>
          <div className="flex gap-2">
            {anyFilter && <Button variant="ghost" size="sm" onClick={() => { setParams({}, { replace: true }); setSearch(''); }}>Clear filters</Button>}
            <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!filtered.length}>Export CSV</Button>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => quick.openTransaction()}>Add</Button>
          </div>
        </div>
        {totals.missing.length > 0 && <div className="mt-3"><Alert>Totals exclude {totals.missing.join(', ')} amounts (no exchange rate set).</Alert></div>}
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight className="size-6" />}
            title={data.length ? 'No transactions match your filters' : 'No transactions yet'}
            description={data.length ? 'Try clearing filters or searching for something else.' : 'Record your first income or expense to start tracking.'}
            action={!data.length && <Button onClick={() => quick.openTransaction()}>Add transaction</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-ink-3">
                <tr>
                  <SortTh label="Date" k="date" sort={sort} onSort={toggleSort} />
                  <SortTh label="Description" k="description" sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <SortTh label="Amount" k="amount" sort={sort} onSort={toggleSort} align="right" />
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.slice(0, limit).map((t) => {
                  const cat = f.categoryById.get(t.categoryId);
                  const acc = f.accountById.get(t.accountId);
                  const toAcc = f.accountById.get(t.toAccountId);
                  const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0;
                  return (
                    <tr key={t.id} className="hover:bg-surface-2">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatDate(t.date)}</td>
                      <td className="max-w-64 px-4 py-3">
                        <p className="truncate font-medium text-ink">{t.description || (t.type === 'transfer' ? 'Transfer' : cat?.name ?? '—')}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {t.recurrence && <Badge tone="brand"><Repeat className="size-3" aria-hidden />{RECURRENCE_LABELS[t.recurrence]}</Badge>}
                          {t.recurringId && t.recurringId !== t.id && <Badge>Recurring</Badge>}
                          {t.linkType === 'debt_payment' && <Badge tone="warning">Debt payment</Badge>}
                          {t.linkType === 'investment' && <Badge tone="warning">Investment trade</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {t.type === 'transfer' ? <span className="text-ink-3">Transfer</span> : (
                          <span className="inline-flex items-center gap-1.5 text-ink-2">
                            <span className="size-2.5 rounded-sm" style={{ background: cat?.color }} aria-hidden />{cat?.name ?? 'Unknown'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {t.type === 'transfer' ? `${acc?.name ?? 'External'} → ${toAcc?.name ?? 'External'}` : acc?.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                        <Signed value={sign}>{sign > 0 ? '+' : sign < 0 ? '−' : ''}{formatMoney(t.amount, t.currency)}</Signed>
                        {t.toAmount ? <p className="text-xs font-normal text-ink-3">→ {formatMoney(Number(t.toAmount), toAcc?.currency ?? '')}</p> : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-right">
                        {isPendingTransaction(t) ? (
                          <span className="inline-flex items-center gap-1.5 px-2 text-xs text-ink-3" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden />Saving</span>
                        ) : t.linkType ? (
                          <a href={t.linkType === 'investment' ? '#/investments' : '#/debts'} className="inline-flex size-8 items-center justify-center text-ink-3" title="Managed from its page" aria-label="Managed from its page">
                            <Lock className="size-4" />
                          </a>
                        ) : (
                          <>
                            <IconButton label="Edit transaction" onClick={() => setEditing(t)}><Pencil className="size-4" /></IconButton>
                            <IconButton label="Delete transaction" onClick={() => setDeleting(t)}><Trash className="size-4" /></IconButton>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div className="border-t border-line p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 100)}>Show more ({filtered.length - limit} remaining)</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <TransactionForm open={!!editing} transaction={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete transaction?"
        message={deleting && <>This permanently removes <strong>{deleting.description || 'this transaction'}</strong> ({formatMoney(deleting.amount, deleting.currency)} on {formatDate(deleting.date)}). Account balances update automatically.</>}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) del.mutate(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}

function SortTh({ label, k, sort, onSort, align }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; align?: 'right' }) {
  const active = sort.key === k;
  return (
    <th className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : ''}`} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        {active && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </button>
    </th>
  );
}

function Recurring({ data }: { data: Transaction[] }) {
  const f = useFinance();
  const series = useMemo(() => recurringSeries(data, f.today), [data, f.today]);
  const record = useAction('recordRecurring');
  const stop = useAction('updateTransaction');
  const [busyId, setBusyId] = useState<string | null>(null);
  const monthly = useMemo(() => {
    const c = f.newConverter();
    let exp = 0, inc = 0;
    for (const s of series) {
      const v = c.convert(s.monthlyEquivalent, s.template.currency);
      if (v === null) continue;
      if (s.template.type === 'expense') exp += v;
      if (s.template.type === 'income') inc += v;
    }
    return { exp, inc };
  }, [series, f]);

  if (!series.length) {
    return (
      <Card>
        <EmptyState icon={<Repeat className="size-6" />} title="No recurring transactions" description="When adding a transaction, choose how often it repeats (e.g. rent, salary, subscriptions). It will show up here with its next due date." />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5"><p className="text-xs text-ink-3">Recurring expenses (monthly equivalent)</p><p className="mt-2 text-xl font-semibold tabular">{formatMoney(monthly.exp, f.base)}</p></Card>
        <Card className="p-5"><p className="text-xs text-ink-3">Recurring income (monthly equivalent)</p><p className="mt-2 text-xl font-semibold tabular">{formatMoney(monthly.inc, f.base)}</p></Card>
      </div>
      <FormError error={record.error ?? stop.error} />
      <Card className="divide-y divide-line">
        {series.map((s) => {
          const cat = f.categoryById.get(s.template.categoryId);
          return (
            <div key={s.template.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-48 flex-1">
                <p className="font-medium text-ink">{s.template.description || cat?.name || 'Recurring transfer'}</p>
                <p className="text-xs text-ink-3">
                  {RECURRENCE_LABELS[s.template.recurrence]} · {s.template.type} · {f.accountById.get(s.template.accountId)?.name} · {s.occurrences} recorded · last {formatDate(s.lastDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium tabular">{formatMoney(s.template.amount, s.template.currency)}</p>
                <p className={`text-xs ${s.overdue ? 'font-medium text-warning' : 'text-ink-3'}`}>{s.overdue ? 'Due' : 'Next'} {formatDate(s.nextDue)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" loading={record.isPending && busyId === s.template.id} onClick={() => { setBusyId(s.template.id); record.mutate({ id: s.template.id }); }}>
                  Record {formatDate(s.nextDue)}
                </Button>
                <Button size="sm" variant="ghost" loading={stop.isPending && busyId === `stop-${s.template.id}`} onClick={() => { setBusyId(`stop-${s.template.id}`); stop.mutate({ id: s.template.id, recurrence: '' }); }}>
                  Stop repeating
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
