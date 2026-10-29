import type { Category, Transaction } from './types';
import type { Converter } from './currency';
import { round2 } from './currency';
import { addDays, daysBetween, inPeriod, monthRange, previousPeriod, type Period } from './dates';
import { formatDate } from './format';

/**
 * Spending analytics computed in the browser from the user's own
 * transactions (already filtered to the signed-in user by the backend).
 * Only `expense` transactions count as spending: transfers, card repayments
 * and investment trades are excluded by construction.
 */

export interface CategoryStat {
  categoryId: string;
  name: string;
  color: string;
  essential: boolean;
  archived: boolean;
  total: number;
  share: number;
  count: number;
  average: number;
  previousTotal: number;
  /** Ratio change vs previous period; null when there was no previous spending. */
  change: number | null;
}

export interface SpendingAnalytics {
  period: Period;
  previous: Period;
  totalExpenses: number;
  previousExpenses: number;
  totalIncome: number;
  transactionCount: number;
  categories: CategoryStat[];
  daily: { date: string; amount: number }[];
  monthly: { month: string; amount: number }[];
  essential: number;
  discretionary: number;
  largest: Transaction | null;
  dailyAverage: number;
  insights: string[];
  missingRates: string[];
}

const UNCATEGORISED = { name: 'Uncategorised', color: '#94a3b8', essential: false, archived: false };

export function spendingAnalytics(
  transactions: Transaction[],
  categories: Category[],
  period: Period,
  converter: Converter,
  formatAmount: (n: number) => string
): SpendingAnalytics {
  const previous = previousPeriod(period);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const value = (t: Transaction) => converter.convert(t.amount, t.currency);

  const stats = new Map<string, { total: number; count: number; previousTotal: number }>();
  const entry = (id: string) => {
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { total: 0, count: 0, previousTotal: 0 }));
    return s;
  };

  let totalExpenses = 0, previousExpenses = 0, totalIncome = 0, count = 0, essential = 0, discretionary = 0;
  let largest: Transaction | null = null;
  let largestValue = 0;
  const dailyMap = new Map<string, number>();
  const monthlyMap = new Map<string, number>();

  // Monthly trend: the 12 months ending at the period end.
  const trendMonths = monthRange(period.to.slice(0, 7), 12);
  const trendFrom = `${trendMonths[0]}-01`;

  for (const t of transactions) {
    if (t.type === 'income' && inPeriod(t.date, period)) {
      const v = value(t);
      if (v !== null) totalIncome += v;
      continue;
    }
    if (t.type !== 'expense') continue;
    const v = value(t);
    if (v === null) continue;
    if (t.date >= trendFrom && t.date <= period.to) {
      const m = t.date.slice(0, 7);
      monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + v);
    }
    if (inPeriod(t.date, period)) {
      const s = entry(t.categoryId);
      s.total += v;
      s.count += 1;
      totalExpenses += v;
      count += 1;
      dailyMap.set(t.date, (dailyMap.get(t.date) ?? 0) + v);
      if (catById.get(t.categoryId)?.essential) essential += v; else discretionary += v;
      if (v > largestValue) {
        largestValue = v;
        largest = t;
      }
    } else if (inPeriod(t.date, previous)) {
      entry(t.categoryId).previousTotal += v;
      previousExpenses += v;
    }
  }

  const categoryStats: CategoryStat[] = [...stats.entries()]
    .filter(([, s]) => s.total > 0 || s.previousTotal > 0)
    .map(([id, s]) => {
      const c = catById.get(id) ?? UNCATEGORISED;
      return {
        categoryId: id,
        name: c.name,
        color: c.color,
        essential: c.essential,
        archived: c.archived,
        total: round2(s.total),
        share: totalExpenses > 0 ? s.total / totalExpenses : 0,
        count: s.count,
        average: s.count ? round2(s.total / s.count) : 0,
        previousTotal: round2(s.previousTotal),
        change: s.previousTotal > 0 ? (s.total - s.previousTotal) / s.previousTotal : null
      };
    })
    .sort((a, b) => b.total - a.total || b.previousTotal - a.previousTotal);

  const days = Math.max(1, daysBetween(period.from, period.to) + 1);
  const daily: { date: string; amount: number }[] = [];
  if (days <= 92) {
    for (let i = 0; i < days; i++) {
      const d = addDays(period.from, i);
      daily.push({ date: d, amount: round2(dailyMap.get(d) ?? 0) });
    }
  }

  const result: SpendingAnalytics = {
    period,
    previous,
    totalExpenses: round2(totalExpenses),
    previousExpenses: round2(previousExpenses),
    totalIncome: round2(totalIncome),
    transactionCount: count,
    categories: categoryStats,
    daily,
    monthly: trendMonths.map((m) => ({ month: m, amount: round2(monthlyMap.get(m) ?? 0) })),
    essential: round2(essential),
    discretionary: round2(discretionary),
    largest,
    dailyAverage: round2(totalExpenses / days),
    insights: [],
    missingRates: converter.missing()
  };
  result.insights = buildInsights(result, formatAmount);
  return result;
}

/** Plain-language observations derived only from the numbers above. */
export function buildInsights(a: SpendingAnalytics, fmt: (n: number) => string): string[] {
  const out: string[] = [];
  if (a.totalExpenses <= 0) return out;
  const top = a.categories.find((c) => c.total > 0);
  if (top) out.push(`${top.name} was your biggest expense: ${fmt(top.total)} (${Math.round(top.share * 100)}% of spending).`);

  if (a.previousExpenses > 0) {
    const change = (a.totalExpenses - a.previousExpenses) / a.previousExpenses;
    if (Math.abs(change) >= 0.05) {
      out.push(`Total spending is ${change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change) * 100)}% compared with the previous period (${fmt(a.previousExpenses)}).`);
    } else {
      out.push('Total spending is about the same as the previous period.');
    }
  }

  const movers = a.categories.filter((c) => c.change !== null && c.previousTotal >= a.totalExpenses * 0.02);
  const riser = [...movers].sort((x, y) => (y.change ?? 0) - (x.change ?? 0))[0];
  if (riser && (riser.change ?? 0) >= 0.2) {
    out.push(`${riser.name} rose ${Math.round((riser.change ?? 0) * 100)}% (${fmt(riser.previousTotal)} → ${fmt(riser.total)}).`);
  }
  const faller = [...movers].sort((x, y) => (x.change ?? 0) - (y.change ?? 0))[0];
  if (faller && (faller.change ?? 0) <= -0.2) {
    out.push(`You spent ${Math.round(Math.abs(faller.change ?? 0) * 100)}% less on ${faller.name} than in the previous period.`);
  }
  const fresh = a.categories.filter((c) => c.total > 0 && c.previousTotal === 0 && a.previousExpenses > 0);
  if (fresh.length) out.push(`New spending this period in ${fresh.slice(0, 3).map((c) => c.name).join(', ')}.`);

  const discShare = a.discretionary / a.totalExpenses;
  out.push(`${Math.round(discShare * 100)}% of spending was discretionary and ${Math.round((1 - discShare) * 100)}% essential.`);

  if (a.totalIncome > 0) {
    const rate = (a.totalIncome - a.totalExpenses) / a.totalIncome;
    out.push(rate >= 0
      ? `You kept ${Math.round(rate * 100)}% of your income after expenses.`
      : `Expenses exceeded income by ${fmt(a.totalExpenses - a.totalIncome)}.`);
  }
  if (a.largest) out.push(`Largest single expense: ${a.largest.description || 'an expense'} (${fmt(a.largest.amount)}) on ${formatDate(a.largest.date)}.`);
  return out;
}
