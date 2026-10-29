import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { formatMoney, formatMonth, formatPercent, ASSET_TYPE_LABELS, formatDate } from '../../lib/format';
import type { CategoryTotal, MonthlyFlow } from '../../lib/types';

/**
 * Chart building blocks. Series colours come from the validated categorical
 * palette (CSS vars --series-N, stepped separately for dark mode). Categories
 * keep their own user-chosen colour so a category looks the same everywhere.
 * Every chart has hover tooltips and a legend or direct labels; values are
 * always rendered in text ink, never in series colours.
 */

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

/** Fixed slot per asset type so colours follow the entity, not its rank. */
export const ASSET_COLORS: Record<string, string> = {
  stock: SERIES[0], etf: SERIES[1], mutual_fund: SERIES[2], bond: SERIES[3],
  crypto: SERIES[4], gold: SERIES[5], real_estate: SERIES[6], other: SERIES[7]
};

const axisProps = {
  stroke: 'var(--chart-axis)',
  tick: { fill: 'var(--chart-axis)', fontSize: 11 },
  tickLine: false,
  axisLine: false
} as const;

function compact(currency: string) {
  return (v: number) => formatMoney(v, currency, { compact: true }).replace(`${currency} `, '');
}

interface TooltipRow {
  name: string;
  value: number | null;
  color: string;
}

export function TooltipCard({ title, rows, currency, footer }: { title: ReactNode; rows: TooltipRow[]; currency: string; footer?: ReactNode }) {
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="size-2.5 rounded-sm" style={{ background: r.color }} aria-hidden />
            {r.name}
          </span>
          <span className="tabular font-medium text-ink">{formatMoney(r.value, currency)}</span>
        </div>
      ))}
      {footer && <div className="mt-1 border-t border-line pt-1 text-ink-3">{footer}</div>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartFrame({ height = 240, children, label }: { height?: number; children: ReactNode; label: string }) {
  return (
    <div style={{ height }} role="img" aria-label={label} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------- Income vs expenses */

export function IncomeExpenseChart({ data, currency, height }: { data: MonthlyFlow[]; currency: string; height?: number }) {
  return (
    <div className="space-y-3">
      <Legend items={[{ label: 'Income', color: SERIES[0] }, { label: 'Expenses', color: SERIES[1] }]} />
      <ChartFrame height={height} label="Income versus expenses by month">
        <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, true)} {...axisProps} />
          <YAxis width={48} tickFormatter={compact(currency)} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'var(--surface-3)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={formatMonth(String(label))}
                  currency={currency}
                  rows={[
                    { name: 'Income', value: Number(payload[0]?.payload.income), color: SERIES[0] },
                    { name: 'Expenses', value: Number(payload[0]?.payload.expenses), color: SERIES[1] }
                  ]}
                  footer={<>Net {formatMoney(Number(payload[0]?.payload.savings), currency)}</>}
                />
              ) : null
            }
          />
          <Bar dataKey="income" name="Income" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name="Expenses" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}

/* ------------------------------------------------------- Monthly savings */

export function SavingsChart({ data, currency, height }: { data: MonthlyFlow[]; currency: string; height?: number }) {
  return (
    <ChartFrame height={height} label="Monthly savings (income minus expenses)">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, true)} {...axisProps} />
        <YAxis width={48} tickFormatter={compact(currency)} {...axisProps} />
        <ReferenceLine y={0} stroke="var(--chart-axis)" />
        <Tooltip
          cursor={{ fill: 'var(--surface-3)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as MonthlyFlow;
            return (
              <TooltipCard
                title={formatMonth(String(label))}
                currency={currency}
                rows={[{ name: 'Saved', value: row.savings, color: row.savings >= 0 ? SERIES[0] : SERIES[7] }]}
                footer={<>Savings rate {formatPercent(row.savingsRate)}</>}
              />
            );
          }}
        />
        <Bar dataKey="savings" name="Savings" radius={[4, 4, 4, 4]} maxBarSize={32}>
          {data.map((d) => (
            <Cell key={d.month} fill={d.savings >= 0 ? SERIES[0] : SERIES[7]} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------ Donut + legend */

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Folds slices beyond `max` into a single "Other" slice so colours never need to be generated. */
export function foldSlices(slices: Slice[], max = 7): Slice[] {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max).reduce((s, x) => s + x.value, 0);
  return [...sorted.slice(0, max), { key: '__other', label: 'All others', value: rest, color: 'var(--chart-axis)' }];
}

export function DonutWithLegend({ slices, currency, label, onSelect, height = 200 }: {
  slices: Slice[];
  currency: string;
  label: string;
  onSelect?: (key: string) => void;
  height?: number;
}) {
  const data = foldSlices(slices);
  const total = data.reduce((s, x) => s + x.value, 0);
  return (
    // Container query: legend sits beside the donut only when the card is wide enough.
    <div className="@container">
    <div className="grid items-center gap-4 @lg:grid-cols-[minmax(0,180px)_1fr]">
      <div className="mx-auto w-full max-w-[220px]">
      <ChartFrame height={height} label={label}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="95%"
            paddingAngle={data.length > 1 ? 1.5 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(d) => {
              const key = (d as unknown as { payload?: Slice }).payload?.key;
              if (onSelect && key && key !== '__other') onSelect(key);
            }}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            {data.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const s = payload[0].payload as Slice;
              return <TooltipCard title={s.label} currency={currency} rows={[{ name: 'Amount', value: s.value, color: s.color }]} footer={<>{formatPercent(total ? s.value / total : 0)} of total</>} />;
            }}
          />
        </PieChart>
      </ChartFrame>
      </div>
      <ul className="min-w-0 space-y-1.5 text-sm">
        {data.map((s) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="truncate text-ink-2">{s.label}</span>
              </span>
              <span className="tabular shrink-0 text-ink">
                {formatMoney(s.value, currency)} <span className="text-ink-3">· {formatPercent(total ? s.value / total : 0, 0)}</span>
              </span>
            </>
          );
          return (
            <li key={s.key}>
              {onSelect && s.key !== '__other' ? (
                <button type="button" onClick={() => onSelect(s.key)} className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-surface-3">
                  {content}
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 px-1 py-0.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
    </div>
  );
}

export function categorySlices(items: CategoryTotal[]): Slice[] {
  return items.map((c) => ({ key: c.categoryId, label: c.name, value: c.amount, color: c.color }));
}

export function allocationSlices(items: { assetType: string; value: number }[]): Slice[] {
  return items.map((a) => ({ key: a.assetType, label: ASSET_TYPE_LABELS[a.assetType] ?? a.assetType, value: a.value, color: ASSET_COLORS[a.assetType] ?? SERIES[7] }));
}

/* ------------------------------------------------- Portfolio performance */

export function PortfolioChart({ data, currency, height }: { data: { month: string; value: number; costBasis: number }[]; currency: string; height?: number }) {
  return (
    <div className="space-y-3">
      <Legend items={[{ label: 'Market value', color: SERIES[0] }, { label: 'Cost basis', color: 'var(--chart-axis)', dashed: true }]} />
      <ChartFrame height={height} label="Portfolio market value versus cost basis by month">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.25} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, true)} {...axisProps} />
          <YAxis width={48} tickFormatter={compact(currency)} {...axisProps} />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as { value: number; costBasis: number };
              return (
                <TooltipCard
                  title={formatMonth(String(label))}
                  currency={currency}
                  rows={[{ name: 'Market value', value: r.value, color: SERIES[0] }, { name: 'Cost basis', value: r.costBasis, color: 'var(--chart-axis)' }]}
                  footer={<>Unrealised {formatMoney(r.value - r.costBasis, currency, { sign: true })}</>}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="value" stroke={SERIES[0]} strokeWidth={2} fill="url(#pv)" dot={{ r: 3, fill: SERIES[0], strokeWidth: 0 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="costBasis" stroke="var(--chart-axis)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </AreaChart>
      </ChartFrame>
    </div>
  );
}

/* --------------------------------------------------------- Single series */

export function TrendChart({ data, xKey, yKey, currency, name, height, kind = 'area', xFormat, valueFormat }: {
  data: Record<string, string | number | null | undefined>[];
  xKey: string;
  yKey: string;
  currency: string;
  name: string;
  height?: number;
  kind?: 'area' | 'bar' | 'line';
  xFormat?: (v: string) => string;
  /** Formats values (tooltip and axis); defaults to money in `currency`. */
  valueFormat?: (v: number) => string;
}) {
  const fmtX = xFormat ?? ((v: string) => (v.length === 7 ? formatMonth(v, true) : formatDate(v)));
  const tooltip = (
    <Tooltip
      cursor={kind === 'bar' ? { fill: 'var(--surface-3)' } : { stroke: 'var(--chart-axis)' }}
      content={({ active, payload, label }) =>
        active && payload?.length ? (
          valueFormat ? (
            <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
              <p className="mb-1 font-medium text-ink">{String(label).length === 7 ? formatMonth(String(label)) : formatDate(String(label))}</p>
              <p className="text-ink-2">{name}: <span className="tabular font-medium text-ink">{payload[0].value === null || payload[0].value === undefined ? '—' : valueFormat(Number(payload[0].value))}</span></p>
            </div>
          ) : (
            <TooltipCard title={String(label).length === 7 ? formatMonth(String(label)) : formatDate(String(label))} currency={currency} rows={[{ name, value: Number(payload[0].value), color: SERIES[0] }]} />
          )
        ) : null
      }
    />
  );
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
      <XAxis dataKey={xKey} tickFormatter={fmtX} minTickGap={16} {...axisProps} />
      <YAxis width={48} tickFormatter={valueFormat ?? compact(currency)} {...axisProps} />
      {tooltip}
    </>
  );
  return (
    <ChartFrame height={height} label={name}>
      {kind === 'bar' ? (
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          {common}
          <Bar dataKey={yKey} name={name} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      ) : kind === 'line' ? (
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          {common}
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
          <Line type="monotone" dataKey={yKey} name={name} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      ) : (
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${yKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.25} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          {common}
          <Area type="monotone" dataKey={yKey} name={name} stroke={SERIES[0]} strokeWidth={2} fill={`url(#g-${yKey})`} activeDot={{ r: 4 }} />
        </AreaChart>
      )}
    </ChartFrame>
  );
}

/** Two series on one axis (e.g. budget vs actual). */
export function PairedBars({ data, currency, aKey, bKey, aLabel, bLabel, xKey, height }: {
  data: Record<string, string | number>[];
  currency: string;
  aKey: string;
  bKey: string;
  aLabel: string;
  bLabel: string;
  xKey: string;
  height?: number;
}) {
  return (
    <div className="space-y-3">
      <Legend items={[{ label: aLabel, color: SERIES[0] }, { label: bLabel, color: SERIES[1] }]} />
      <ChartFrame height={height} label={`${aLabel} versus ${bLabel}`}>
        <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} interval={0} tick={{ fill: 'var(--chart-axis)', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis width={48} tickFormatter={compact(currency)} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'var(--surface-3)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={String(label)}
                  currency={currency}
                  rows={[
                    { name: aLabel, value: Number(payload[0].payload[aKey]), color: SERIES[0] },
                    { name: bLabel, value: Number(payload[0].payload[bKey]), color: SERIES[1] }
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey={aKey} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey={bKey} fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}
