import { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Trash } from 'lucide-react';
import { useAction, useBudgets } from '../lib/queries';
import { errorMessage } from '../lib/api';
import { addMonths } from '../lib/dates';
import { formatMoney, formatMonth, formatPercent } from '../lib/format';
import type { BudgetItem } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import { Button, Card, CardHeader, ErrorState, FormError, IconButton, Input, MissingRatesNotice, PageHeader, ProgressBar, Spinner } from '../components/ui';

export default function BudgetsPage() {
  const f = useFinance();
  const [month, setMonth] = useState(f.today.slice(0, 7));
  const q = useBudgets(month);
  const copy = useAction('copyBudgets');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        subtitle={`Monthly limits per expense category, in ${f.base}`}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-line bg-surface px-1">
              <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="size-4" /></IconButton>
              <span className="min-w-24 text-center text-sm font-medium">{formatMonth(month)}</span>
              <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="size-4" /></IconButton>
            </div>
            <Button variant="secondary" size="sm" icon={<Copy className="size-4" />} loading={copy.isPending}
              onClick={() => copy.mutate({ fromMonth: addMonths(month, -1), toMonth: month })}>
              Copy from {formatMonth(addMonths(month, -1), true)}
            </Button>
          </>
        }
      />
      <FormError error={copy.error} />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <MissingRatesNotice currencies={q.data.missingRates} base={q.data.currency} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-xs text-ink-3">Budgeted</p><p className="mt-2 text-xl font-semibold tabular">{formatMoney(q.data.totalBudget, q.data.currency)}</p></Card>
            <Card className="p-5"><p className="text-xs text-ink-3">Spent in budgeted categories</p><p className="mt-2 text-xl font-semibold tabular">{formatMoney(q.data.totalSpent, q.data.currency)}</p></Card>
            <Card className="p-5"><p className="text-xs text-ink-3">Remaining</p><p className={`mt-2 text-xl font-semibold tabular ${q.data.totalRemaining < 0 ? 'text-negative' : ''}`}>{formatMoney(q.data.totalRemaining, q.data.currency)}</p></Card>
          </div>
          <Card>
            <CardHeader title="Category budgets" subtitle="Type an amount and press Enter (or leave the field) to save. Leave blank for no budget." />
            <ul className="divide-y divide-line p-2">
              {f.expenseCategories.map((c) => {
                const item = q.data.items.find((i) => i.categoryId === c.id);
                const spent = item?.spent ?? q.data.unbudgeted.find((u) => u.categoryId === c.id)?.spent ?? 0;
                return <BudgetRow key={`${month}-${c.id}-${item?.amount ?? ''}`} month={month} categoryId={c.id} name={c.name} color={c.color} item={item} spent={spent} currency={q.data.currency} />;
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function BudgetRow({ month, categoryId, name, color, item, spent, currency }: {
  month: string; categoryId: string; name: string; color: string; item?: BudgetItem; spent: number; currency: string;
}) {
  const [value, setValue] = useState(item ? String(item.amount) : '');
  const set = useAction('setBudget');
  const del = useAction('deleteBudget');
  const dirty = value !== (item ? String(item.amount) : '');

  const save = () => {
    if (!dirty) return;
    if (value === '' && item) del.mutate({ id: item.id });
    else if (value !== '' && Number(value) > 0) set.mutate({ categoryId, month, amount: Number(value) });
  };

  return (
    <li className="grid items-center gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.4fr)_auto]">
      <span className="flex items-center gap-2 font-medium text-ink">
        <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />{name}
      </span>
      <Input
        type="number" min="0" step="0.01" inputMode="decimal" aria-label={`${name} budget for ${month}`} placeholder="No budget"
        value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className="h-9"
      />
      <div>
        {item ? (
          <>
            <ProgressBar value={item.percentUsed ?? 0} label={`${name} budget used`} />
            <p className={`mt-1 text-xs tabular ${item.remaining < 0 ? 'text-negative' : 'text-ink-3'}`}>
              {formatMoney(spent, currency)} spent · {formatPercent(item.percentUsed, 0)} · {item.remaining < 0 ? `${formatMoney(-item.remaining, currency)} over` : `${formatMoney(item.remaining, currency)} left`}
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-3 tabular">{spent > 0 ? `${formatMoney(spent, currency)} spent without a budget` : 'Nothing spent'}</p>
        )}
        {(set.error || del.error) && <p className="mt-1 text-xs text-negative">{errorMessage(set.error ?? del.error)}</p>}
      </div>
      <div className="flex justify-end">
        {item && <IconButton label={`Remove ${name} budget`} disabled={del.isPending} onClick={() => del.mutate({ id: item.id })}><Trash className="size-4" /></IconButton>}
        {(set.isPending || del.isPending) && <span className="text-xs text-ink-3">Saving…</span>}
      </div>
    </li>
  );
}
