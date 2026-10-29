import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Lightbulb, Repeat } from 'lucide-react';
import { useBudgets, useTransactions } from '../lib/queries';
import { spendingAnalytics, type CategoryStat } from '../lib/analytics';
import { inPeriod, monthPeriod, periodForKind, shiftPeriod, customPeriod, type Period, type PeriodKind } from '../lib/dates';
import { formatDate, formatMoney, formatPercent, RECURRENCE_LABELS } from '../lib/format';
import { recurringSeries } from '../lib/recurring';
import type { Transaction } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import { categorySlices, DonutWithLegend, PairedBars, TrendChart } from '../components/charts';
import {
  Badge, Card, CardHeader, EmptyState, ErrorState, IconButton, Input, MissingRatesNotice, Modal, PageHeader, ProgressBar, Segmented, Spinner
} from '../components/ui';

export default function SpendingPage() {
  const f = useFinance();
  const q = useTransactions();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<Period>(() => monthPeriod(f.today.slice(0, 7)));
  const selectedCategory = params.get('category');

  const analytics = useMemo(
    () => (q.data ? spendingAnalytics(q.data, f.categories, period, f.newConverter(), (n) => formatMoney(n, f.base)) : null),
    [q.data, f, period]
  );

  const setKind = (kind: PeriodKind) => setPeriod((p) => periodForKind(kind, f.today, p));
  const openCategory = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('category'); else next.set('category', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        subtitle="Where your money goes, by category and over time"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Period" value={period.kind} onChange={setKind} options={[
              { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' }
            ]} />
            {period.kind === 'custom' ? (
              <div className="flex items-center gap-2">
                <Input aria-label="From" type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && setPeriod(customPeriod(e.target.value, period.to))} className="w-40" />
                <Input aria-label="To" type="date" value={period.to} min={period.from} onChange={(e) => e.target.value && setPeriod(customPeriod(period.from, e.target.value))} className="w-40" />
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-xl border border-line bg-surface px-1">
                <IconButton label="Previous period" onClick={() => setPeriod(shiftPeriod(period, -1))}><ChevronLeft className="size-4" /></IconButton>
                <span className="min-w-28 text-center text-sm font-medium">{period.label}</span>
                <IconButton label="Next period" onClick={() => setPeriod(shiftPeriod(period, 1))}><ChevronRight className="size-4" /></IconButton>
              </div>
            )}
          </div>
        }
      />
      {q.isPending ? <Spinner /> : q.isError || !analytics ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <SpendingBody a={analytics} transactions={q.data} onCategory={openCategory} />
      )}
      {analytics && q.data && selectedCategory && (
        <CategoryTransactions
          categoryId={selectedCategory}
          stat={analytics.categories.find((c) => c.categoryId === selectedCategory)}
          period={period}
          transactions={q.data}
          onClose={() => openCategory(null)}
        />
      )}
    </div>
  );
}

function SpendingBody({ a, transactions, onCategory }: { a: ReturnType<typeof spendingAnalytics>; transactions: Transaction[]; onCategory: (id: string) => void }) {
  const f = useFinance();
  const c = f.base;
  const change = a.previousExpenses > 0 ? (a.totalExpenses - a.previousExpenses) / a.previousExpenses : null;
  const active = a.categories.filter((x) => x.total > 0);
  const recurring = recurringSeries(transactions, f.today).filter((s) => s.template.type === 'expense');

  return (
    <>
      <MissingRatesNotice currencies={a.missingRates} base={c} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total spent" value={formatMoney(a.totalExpenses, c)} hint={a.period.label} />
        <Stat
          label="Vs previous period"
          value={change === null ? '—' : <span className={change > 0 ? 'text-negative' : 'text-positive'}>{formatPercent(change, 0, true)}</span>}
          hint={`${a.previous.label}: ${formatMoney(a.previousExpenses, c)}`}
        />
        <Stat label="Daily average" value={formatMoney(a.dailyAverage, c)} hint={`${a.transactionCount} expense${a.transactionCount === 1 ? '' : 's'}`} />
        <Stat
          label="Essential vs discretionary"
          value={a.totalExpenses ? `${formatPercent(a.essential / a.totalExpenses, 0)} / ${formatPercent(a.discretionary / a.totalExpenses, 0)}` : '—'}
          hint={<span className="tabular">{formatMoney(a.essential, c)} · {formatMoney(a.discretionary, c)}</span>}
        />
      </div>

      {a.totalExpenses === 0 && a.previousExpenses === 0 ? (
        <Card><EmptyState title="No spending in this period" description="Pick another period, or record expenses to see your analytics." /></Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Spending by category" subtitle="Click a category to see its transactions" />
              <div className="overflow-x-auto p-2">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-xs text-ink-3">
                    <tr>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Share</th>
                      <th className="px-3 py-2 text-right font-medium">Count</th>
                      <th className="px-3 py-2 text-right font-medium">Average</th>
                      <th className="px-3 py-2 text-right font-medium">Vs previous</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.categories.map((s) => (
                      <tr key={s.categoryId} className="cursor-pointer hover:bg-surface-2" onClick={() => onCategory(s.categoryId)}>
                        <td className="px-3 py-2.5">
                          <button type="button" className="flex items-center gap-2 text-left font-medium text-ink" onClick={(e) => { e.stopPropagation(); onCategory(s.categoryId); }}>
                            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                            {s.name}
                            {s.essential && <Badge>Essential</Badge>}
                            {s.archived && <Badge>Archived</Badge>}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">{formatMoney(s.total, c)}</td>
                        <td className="px-3 py-2.5 text-right tabular text-ink-2">{formatPercent(s.share)}</td>
                        <td className="px-3 py-2.5 text-right tabular text-ink-2">{s.count}</td>
                        <td className="px-3 py-2.5 text-right tabular text-ink-2">{s.count ? formatMoney(s.average, c) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular"><ChangeCell s={s} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Highest-spending categories" subtitle={a.period.label} />
              <div className="p-5">
                {active.length ? (
                  <DonutWithLegend
                    slices={categorySlices(active.map((s) => ({ categoryId: s.categoryId, name: s.name, color: s.color, amount: s.total })))}
                    currency={c}
                    label="Spending share by category"
                    onSelect={onCategory}
                  />
                ) : <p className="text-sm text-ink-3">No spending in this period.</p>}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Daily spending" subtitle={a.daily.length ? a.period.label : 'Available for periods up to 3 months'} />
              <div className="p-5">
                {a.daily.length ? <TrendChart data={a.daily} xKey="date" yKey="amount" currency={c} name="Spent per day" kind="bar" height={220} /> : <p className="text-sm text-ink-3">Choose a month, quarter or a shorter custom range to see daily spending.</p>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Monthly spending trend" subtitle="12 months ending with this period" />
              <div className="p-5"><TrendChart data={a.monthly} xKey="month" yKey="amount" currency={c} name="Spent per month" height={220} /></div>
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Budget vs actual" subtitle={a.period.kind === 'month' ? a.period.label : 'Budgets are monthly — choose a single month'} action={<a href="#/budgets" className="text-xs font-medium text-brand">Budgets</a>} />
          <div className="p-5">
            {a.period.kind === 'month' ? <BudgetVsActual month={a.period.from.slice(0, 7)} /> : <p className="text-sm text-ink-3">Switch the period to Month to compare spending with that month’s budgets.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Insights" subtitle="From your own numbers" />
          <ul className="space-y-3 p-5 text-sm text-ink-2">
            {a.insights.length ? a.insights.map((i) => (
              <li key={i} className="flex gap-2"><Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />{i}</li>
            )) : <li className="text-ink-3">Insights appear once there is spending in this period.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recurring expenses" subtitle="Subscriptions, rent and other repeating costs" action={<a href="#/transactions" className="text-xs font-medium text-brand">Manage</a>} />
        <div className="p-5">
          {recurring.length ? (
            <ul className="divide-y divide-line">
              {recurring.map((s) => (
                <li key={s.template.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Repeat className="size-4 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink">{s.template.description || f.categoryById.get(s.template.categoryId)?.name}</span>
                  <span className="text-xs text-ink-3">{RECURRENCE_LABELS[s.template.recurrence]} · next {formatDate(s.nextDue)}</span>
                  <span className="w-32 text-right tabular">{formatMoney(s.template.amount, s.template.currency)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-3">No recurring expenses. Mark a transaction as repeating to track it here.</p>}
        </div>
      </Card>
    </>
  );
}

function ChangeCell({ s }: { s: CategoryStat }) {
  if (s.change === null) return <span className="text-ink-3">{s.total > 0 ? 'New' : '—'}</span>;
  return <span className={s.change > 0 ? 'text-negative' : s.change < 0 ? 'text-positive' : 'text-ink-2'}>{formatPercent(s.change, 0, true)}</span>;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}

function BudgetVsActual({ month }: { month: string }) {
  const q = useBudgets(month);
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  if (!r.items.length) return <p className="text-sm text-ink-3">No budgets set for this month. <a className="font-medium text-brand" href="#/budgets">Create budgets</a>.</p>;
  return (
    <div className="space-y-5">
      <PairedBars
        data={r.items.map((i) => ({ name: i.categoryName, budget: i.amount, actual: i.spent }))}
        xKey="name" aKey="budget" bKey="actual" aLabel="Budget" bLabel="Actual" currency={r.currency} height={220}
      />
      <div className="space-y-2">
        {r.items.map((i) => (
          <div key={i.id} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate font-medium text-ink">{i.categoryName}</span>
            <ProgressBar value={i.percentUsed ?? 0} label={`${i.categoryName} budget used`} />
            <span className={`tabular ${i.remaining < 0 ? 'text-negative' : 'text-ink-3'}`}>{i.remaining < 0 ? `${formatMoney(-i.remaining, r.currency)} over` : `${formatMoney(i.remaining, r.currency)} left`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryTransactions({ categoryId, stat, period, transactions, onClose }: {
  categoryId: string;
  stat?: CategoryStat;
  period: Period;
  transactions: Transaction[];
  onClose: () => void;
}) {
  const f = useFinance();
  const cat = f.categoryById.get(categoryId);
  const rows = transactions.filter((t) => t.type === 'expense' && t.categoryId === categoryId && inPeriod(t.date, period)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Modal open onClose={onClose} title={`${cat?.name ?? 'Category'} · ${period.label}`} size="lg">
      <div className="space-y-4">
        {stat && (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-ink-3">Total</p><p className="font-semibold tabular">{formatMoney(stat.total, f.base)}</p></div>
            <div><p className="text-xs text-ink-3">Share</p><p className="font-semibold tabular">{formatPercent(stat.share)}</p></div>
            <div><p className="text-xs text-ink-3">Transactions</p><p className="font-semibold tabular">{stat.count}</p></div>
            <div><p className="text-xs text-ink-3">Average</p><p className="font-semibold tabular">{formatMoney(stat.average, f.base)}</p></div>
          </div>
        )}
        {rows.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-ink-3">{formatDate(t.date)}</span>
                <span className="min-w-0 flex-1 truncate">{t.description || '—'}<span className="text-ink-3"> · {f.accountById.get(t.accountId)?.name}</span></span>
                <span className="tabular font-medium">{formatMoney(t.amount, t.currency)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-3">No expenses in this category for {period.label}.</p>}
        <a className="inline-block text-sm font-medium text-brand" href={`#/transactions?category=${categoryId}&from=${period.from}&to=${period.to}`}>Open in Transactions →</a>
      </div>
    </Modal>
  );
}
