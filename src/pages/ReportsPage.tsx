import { useState } from 'react';
import { Download } from 'lucide-react';
import { useReports } from '../lib/queries';
import { downloadCsv } from '../lib/csv';
import { ASSET_TYPE_LABELS, formatDate, formatMoney, formatMonth, formatNumber, formatPercent } from '../lib/format';
import { categorySlices, DonutWithLegend, IncomeExpenseChart, PortfolioChart, SavingsChart, TrendChart } from '../components/charts';
import { Badge, Button, Card, CardHeader, ErrorState, MissingRatesNotice, PageHeader, Segmented, Signed, Spinner } from '../components/ui';

type Range = '6' | '12' | '24';

export default function ReportsPage() {
  const [range, setRange] = useState<Range>('12');
  const q = useReports(Number(range));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Monthly cash flow, net worth, debts and investments"
        actions={<Segmented label="Range" value={range} onChange={setRange} options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }, { value: '24', label: '24 months' }]} />}
      />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (() => {
        const r = q.data;
        const c = r.currency;
        const exportCashFlow = () => downloadCsv(`financial-cal-cash-flow-${r.from}-${r.to}.csv`,
          ['Month', `Income (${c})`, `Expenses (${c})`, `Net savings (${c})`, 'Savings rate', `Net worth (${c})`, `Assets (${c})`, `Liabilities (${c})`, `Debt outstanding (${c})`, `Portfolio value (${c})`, `Portfolio cost (${c})`],
          r.series.map((s) => [s.month, s.income, s.expenses, s.savings, s.savingsRate === null ? '' : Math.round(s.savingsRate * 10000) / 10000, s.netWorth ?? '', s.totalAssets ?? '', s.totalLiabilities ?? '', s.debtOutstanding ?? '', s.portfolioValue ?? '', s.portfolioCost ?? '']));
        const exportCategories = () => downloadCsv(`financial-cal-spending-by-category-${r.from}-${r.to}.csv`, ['Category', `Amount (${c})`, 'Share'],
          r.spendingByCategory.map((x) => [x.name, x.amount, r.totals.expenses ? Math.round((x.amount / r.totals.expenses) * 10000) / 10000 : '']));
        const exportInvestments = () => downloadCsv(`financial-cal-investments-${r.to}.csv`, ['Holding', 'Ticker', 'Type', 'Currency', 'Quantity', 'Cost basis', 'Market value', 'Unrealised P/L', 'Realised P/L', 'Return', 'Price date', 'Price outdated'],
          r.investmentPerformance.map((h) => [h.name, h.ticker, ASSET_TYPE_LABELS[h.assetType], h.currency, h.quantity, h.costBasis, h.marketValue ?? '', h.unrealizedPL ?? '', h.realizedPL, h.returnPct === null ? '' : Math.round(h.returnPct * 10000) / 10000, h.priceDate, h.stale ? 'yes' : 'no']));
        const nw = r.series.filter((s) => s.netWorth !== undefined);
        return (
          <>
            <MissingRatesNotice currencies={r.missingRates} base={c} />
            <p className="text-sm text-ink-3">{formatDate(r.from)} – {formatDate(r.to)} · all figures in {c}</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Income" value={formatMoney(r.totals.income, c)} />
              <Stat label="Expenses" value={formatMoney(r.totals.expenses, c)} />
              <Stat label="Net savings" value={<Signed value={r.totals.savings}>{formatMoney(r.totals.savings, c)}</Signed>} />
              <Stat label="Savings rate" value={formatPercent(r.totals.savingsRate)} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader title="Income and expenses" />
                <div className="p-5"><IncomeExpenseChart data={r.series} currency={c} /></div>
              </Card>
              <Card>
                <CardHeader title="Monthly cash flow" subtitle="Net savings per month" />
                <div className="p-5"><SavingsChart data={r.series} currency={c} height={262} /></div>
              </Card>
              <Card>
                <CardHeader title="Savings rate" subtitle="Share of income kept each month" />
                <div className="p-5"><TrendChart data={r.series.map((s) => ({ month: s.month, rate: s.savingsRate === null ? null : Math.round(s.savingsRate * 1000) / 10 }))} xKey="month" yKey="rate" currency={c} name="Savings rate" kind="line" valueFormat={(v) => `${formatNumber(v, 1)}%`} height={240} /></div>
              </Card>
              <Card>
                <CardHeader title="Net worth" subtitle="Month-end assets minus liabilities" />
                <div className="p-5"><TrendChart data={nw.map((s) => ({ month: s.month, netWorth: s.netWorth ?? 0 }))} xKey="month" yKey="netWorth" currency={c} name="Net worth" height={240} /></div>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <CardHeader title="Monthly summary" action={<Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportCashFlow}>Export CSV</Button>} />
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-ink-3">
                    <tr>{['Month', 'Income', 'Expenses', 'Net', 'Savings rate', 'Net worth', 'Debt outstanding'].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...r.series].reverse().map((s) => (
                      <tr key={s.month}>
                        <td className="px-4 py-2.5">{formatMonth(s.month)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(s.income, c)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(s.expenses, c)}</td>
                        <td className="px-4 py-2.5 text-right"><Signed value={s.savings}>{formatMoney(s.savings, c)}</Signed></td>
                        <td className="px-4 py-2.5 text-right tabular">{formatPercent(s.savingsRate)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(s.netWorth, c)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(s.debtOutstanding, c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader title="Spending by category" subtitle="Whole range" action={<Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportCategories} disabled={!r.spendingByCategory.length}>CSV</Button>} />
                <div className="p-5">{r.spendingByCategory.length ? <DonutWithLegend slices={categorySlices(r.spendingByCategory)} currency={c} label="Spending by category for the report range" /> : <p className="text-sm text-ink-3">No expenses in this range.</p>}</div>
              </Card>
              <Card>
                <CardHeader title="Debt reduction" subtitle="Repayments in this range" />
                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs text-ink-3">Principal repaid</p><p className="mt-1 text-lg font-semibold tabular">{formatMoney(r.debtReduction.principalRepaid, c)}</p></div>
                    <div><p className="text-xs text-ink-3">Interest paid</p><p className="mt-1 text-lg font-semibold tabular">{formatMoney(r.debtReduction.interestPaid, c)}</p></div>
                  </div>
                  <TrendChart data={nw.map((s) => ({ month: s.month, debt: s.debtOutstanding ?? 0 }))} xKey="month" yKey="debt" currency={c} name="Debt outstanding" kind="line" height={180} />
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <CardHeader title="Investment performance" subtitle="Current holdings, from your recorded prices" action={<Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportInvestments} disabled={!r.investmentPerformance.length}>CSV</Button>} />
              <div className="p-5"><PortfolioChart data={nw.map((s) => ({ month: s.month, value: s.portfolioValue ?? 0, costBasis: s.portfolioCost ?? 0 }))} currency={c} height={200} /></div>
              {r.investmentPerformance.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-surface-2 text-left text-xs text-ink-3">
                      <tr>{['Holding', 'Cost basis', 'Market value', 'Unrealised', 'Realised', 'Return'].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {r.investmentPerformance.map((h) => (
                        <tr key={h.id}>
                          <td className="px-4 py-2.5">{h.name} <span className="text-xs text-ink-3">{h.ticker}</span> {h.stale && <Badge tone="warning">Outdated price</Badge>}</td>
                          <td className="px-4 py-2.5 text-right tabular">{formatMoney(h.costBasis, h.currency)}</td>
                          <td className="px-4 py-2.5 text-right tabular">{formatMoney(h.marketValue, h.currency)}</td>
                          <td className="px-4 py-2.5 text-right"><Signed value={h.unrealizedPL}>{formatMoney(h.unrealizedPL, h.currency, { sign: true })}</Signed></td>
                          <td className="px-4 py-2.5 text-right"><Signed value={h.realizedPL}>{formatMoney(h.realizedPL, h.currency, { sign: true })}</Signed></td>
                          <td className="px-4 py-2.5 text-right"><Signed value={h.returnPct}>{formatPercent(h.returnPct, 1, true)}</Signed></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        );
      })()}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular">{value}</p>
    </Card>
  );
}
