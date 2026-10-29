import { useNavigate } from 'react-router';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarClock, Landmark, PiggyBank, Plus, Target, TrendingUp, Wallet
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useDashboard } from '../lib/queries';
import { formatDate, formatMoney, formatMonth, formatPercent } from '../lib/format';
import { useUser } from '../features/auth/AuthProvider';
import { useQuickAdd } from '../components/layout/AppLayout';
import {
  allocationSlices, categorySlices, DonutWithLegend, IncomeExpenseChart, PortfolioChart, SavingsChart
} from '../components/charts';
import {
  Alert, Button, Card, CardHeader, EmptyState, ErrorState, MissingRatesNotice, PageHeader, ProgressBar, Signed, Skeleton
} from '../components/ui';
import type { Dashboard, DashboardTransaction } from '../lib/types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const user = useUser();
  const q = useDashboard();
  const quick = useQuickAdd();
  const navigate = useNavigate();

  if (q.isPending) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const c = d.currency;
  const isNew = d.counts.accounts === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user.displayName.split(' ')[0]}`}
        subtitle={`Your finances for ${formatMonth(d.month)} · figures in ${c}`}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<ArrowDownLeft className="size-4" />} onClick={() => quick.openTransaction({ type: 'income' })}>Income</Button>
            <Button variant="secondary" size="sm" icon={<ArrowUpRight className="size-4" />} onClick={() => quick.openTransaction({ type: 'expense' })}>Expense</Button>
            <Button variant="secondary" size="sm" icon={<ArrowLeftRight className="size-4" />} onClick={() => quick.openTransaction({ type: 'transfer' })}>Transfer</Button>
          </>
        }
      />
      <MissingRatesNotice currencies={d.missingRates} base={c} />
      {d.stalePrices.length > 0 && (
        <Alert>
          {d.stalePrices.length} investment price{d.stalePrices.length > 1 ? 's are' : ' is'} out of date ({d.stalePrices.map((s) => s.name).join(', ')}). Portfolio values use the last price you entered.{' '}
          <a className="font-medium underline" href="#/investments">Update prices</a>.
        </Alert>
      )}

      {isNew && (
        <Card>
          <EmptyState
            icon={<Wallet className="size-6" />}
            title="Welcome to Financial Cal"
            description="Start by adding the accounts you use — cash, bank, savings and credit cards. Then record income and expenses, and your dashboard fills in from real data."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={<Plus className="size-4" />} onClick={() => navigate('/accounts')}>Add your first account</Button>
                <Button variant="secondary" onClick={() => navigate('/investments')}>Track investments</Button>
              </div>
            }
          />
        </Card>
      )}

      <section aria-label="Key figures" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white md:col-span-2 xl:col-span-1 xl:row-span-2 dark:from-indigo-500/30 dark:to-violet-600/30">
          <p className="text-sm text-indigo-100">Net worth</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{formatMoney(d.kpis.netWorth, c)}</p>
          <div className="mt-6 space-y-2 text-sm">
            <Row label="Total assets" value={formatMoney(d.kpis.totalAssets, c)} />
            <Row label="Total liabilities" value={formatMoney(d.kpis.totalLiabilities, c)} />
            <Row label="Investments" value={formatMoney(d.kpis.portfolioValue, c)} />
          </div>
          <p className="mt-6 text-xs text-indigo-100/80">Assets = account balances + investments. Savings goals are earmarks and are not counted twice.</p>
        </Card>
        <Kpi icon={<Wallet className="size-4" />} label="Cash balance" value={formatMoney(d.kpis.cashBalance, c)} hint="Cash, bank & savings accounts" />
        <Kpi icon={<ArrowDownLeft className="size-4" />} label="Income this month" value={formatMoney(d.kpis.monthIncome, c)} />
        <Kpi icon={<ArrowUpRight className="size-4" />} label="Expenses this month" value={formatMoney(d.kpis.monthExpenses, c)} />
        <Kpi icon={<PiggyBank className="size-4" />} label="Saved this month" value={<Signed value={d.kpis.monthSavings}>{formatMoney(d.kpis.monthSavings, c)}</Signed>} hint="Income − expenses" />
        <Kpi icon={<Target className="size-4" />} label="Savings rate" value={formatPercent(d.kpis.savingsRate)} hint={d.kpis.monthIncome > 0 ? 'Share of income kept' : 'No income recorded this month'} />
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label="Portfolio value"
          value={formatMoney(d.kpis.portfolioValue, c)}
          hint={d.kpis.portfolioCost > 0 ? <Signed value={d.kpis.portfolioValue - d.kpis.portfolioCost}>{formatMoney(d.kpis.portfolioValue - d.kpis.portfolioCost, c, { sign: true })} unrealised</Signed> : 'No holdings yet'}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Income vs expenses" subtitle="Last 6 months · transfers excluded" />
          <div className="p-5">
            {d.monthly.some((m) => m.income || m.expenses) ? <IncomeExpenseChart data={d.monthly} currency={c} /> : <ChartEmpty text="Record income and expenses to see your monthly cash flow." />}
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Expenses by category" subtitle={formatMonth(d.month)} action={<a href="#/spending" className="text-xs font-medium text-brand">Analyse</a>} />
          <div className="p-5">
            {d.expensesByCategory.length ? (
              <DonutWithLegend slices={categorySlices(d.expensesByCategory)} currency={c} label="Expenses by category this month" onSelect={(id) => navigate(`/spending?category=${id}`)} />
            ) : (
              <ChartEmpty text="No expenses recorded this month." />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Monthly savings" subtitle="Income minus expenses" />
          <div className="p-5">
            {d.monthly.some((m) => m.income || m.expenses) ? <SavingsChart data={d.monthly} currency={c} height={200} /> : <ChartEmpty text="Savings appear once you record income and expenses." />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Investment allocation" subtitle="By asset type, current value" action={<a href="#/investments" className="text-xs font-medium text-brand">Investments</a>} />
          <div className="p-5">
            {d.allocation.length ? <DonutWithLegend slices={allocationSlices(d.allocation)} currency={c} label="Investment allocation by asset type" height={160} /> : <ChartEmpty text="Add holdings on the Investments page." />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Portfolio performance" subtitle="Month-end value vs cost basis" />
          <div className="p-5">
            {d.portfolioHistory.some((p) => p.value || p.costBasis) ? <PortfolioChart data={d.portfolioHistory} currency={c} height={180} /> : <ChartEmpty text="Performance appears after your first purchase." />}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent transactions" action={<a href="#/transactions" className="text-xs font-medium text-brand">View all</a>} />
          <div className="p-2">
            {d.recentTransactions.length ? (
              <ul className="divide-y divide-line">
                {d.recentTransactions.map((t) => <RecentRow key={t.id} t={t} />)}
              </ul>
            ) : (
              <EmptyState title="No transactions yet" description="Your latest income, expenses and transfers will appear here." action={!isNew && <Button size="sm" onClick={() => quick.openTransaction()}>Add transaction</Button>} />
            )}
          </div>
        </Card>
        <div className="space-y-4">
          <BudgetsCard d={d} />
          <UpcomingCard d={d} />
          <GoalsCard d={d} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-white/15 pt-2">
      <span className="text-indigo-100/90">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-ink-3">
        <span className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-ink-3">{text}</div>;
}

function RecentRow({ t }: { t: DashboardTransaction }) {
  const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0;
  const label = t.type === 'transfer' ? `${t.accountName || 'External'} → ${t.toAccountName || 'External'}` : t.categoryName;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white"
        style={{ background: t.type === 'transfer' ? 'var(--chart-axis)' : t.categoryColor || 'var(--chart-axis)' }}
        aria-hidden
      >
        {t.type === 'transfer' ? <ArrowLeftRight className="size-4" /> : (t.categoryName || '?').slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{t.description || label}</p>
        <p className="truncate text-xs text-ink-3">{formatDate(t.date)} · {label}{t.type !== 'transfer' ? ` · ${t.accountName}` : ''}</p>
      </div>
      <Signed value={sign}>
        <span className="text-sm font-medium">{sign > 0 ? '+' : sign < 0 ? '−' : ''}{formatMoney(t.amount, t.currency)}</span>
      </Signed>
    </li>
  );
}

function BudgetsCard({ d }: { d: Dashboard }) {
  return (
    <Card>
      <CardHeader title="Budgets" subtitle={formatMonth(d.month)} action={<a href="#/budgets" className="text-xs font-medium text-brand">Manage</a>} />
      <div className="space-y-3 p-5">
        {d.budgets.length ? d.budgets.map((b) => (
          <div key={b.id}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-ink">{b.categoryName}</span>
              <span className="tabular text-ink-3">{formatMoney(b.spent, d.currency)} / {formatMoney(b.amount, d.currency)}</span>
            </div>
            <ProgressBar value={b.percentUsed ?? 0} label={`${b.categoryName} budget used`} />
          </div>
        )) : <p className="text-sm text-ink-3">No budgets for this month. <a className="font-medium text-brand" href="#/budgets">Set one</a>.</p>}
      </div>
    </Card>
  );
}

function UpcomingCard({ d }: { d: Dashboard }) {
  return (
    <Card>
      <CardHeader title="Upcoming debt payments" action={<a href="#/debts" className="text-xs font-medium text-brand">Debts</a>} />
      <div className="p-5">
        {d.upcomingDebtPayments.length ? (
          <ul className="space-y-2.5">
            {d.upcomingDebtPayments.map((u) => (
              <li key={u.debtId} className="flex items-center gap-3 text-sm">
                <CalendarClock className="size-4 text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">{u.name}</span>
                <span className="text-right">
                  <span className="block tabular text-ink">{u.minimumPayment ? formatMoney(u.minimumPayment, u.currency) : '—'}</span>
                  <span className="block text-xs text-ink-3">{formatDate(u.dueDate)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-ink-3"><Landmark className="size-4" aria-hidden /> No upcoming payments.</p>
        )}
      </div>
    </Card>
  );
}

function GoalsCard({ d }: { d: Dashboard }) {
  return (
    <Card>
      <CardHeader title="Savings goals" action={<a href="#/goals" className="text-xs font-medium text-brand">Goals</a>} />
      <div className="space-y-3 p-5">
        {d.goals.length ? d.goals.map((g) => (
          <div key={g.id}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-ink">{g.name}</span>
              <span className="text-ink-3">{formatPercent(g.progress, 0)}</span>
            </div>
            <ProgressBar value={g.progress} tone="positive" label={`${g.name} progress`} />
            <p className="mt-1 text-xs text-ink-3 tabular">{formatMoney(g.saved, g.currency)} of {formatMoney(g.targetAmount, g.currency)}{g.targetDate ? ` · by ${formatDate(g.targetDate)}` : ''}</p>
          </div>
        )) : <p className="text-sm text-ink-3">No goals yet. <a className="font-medium text-brand" href="#/goals">Create one</a>.</p>}
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className={i === 0 ? 'h-64 xl:row-span-2' : 'h-28'} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Skeleton className="h-80 xl:col-span-3" />
        <Skeleton className="h-80 xl:col-span-2" />
      </div>
    </div>
  );
}
