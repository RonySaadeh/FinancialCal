import { describe, expect, it } from 'vitest';
import { makeConverter, totalsByCurrency } from './currency';
import { customPeriod, monthPeriod, previousPeriod, quarterPeriod, shiftPeriod, yearPeriod, addMonths } from './dates';
import { spendingAnalytics } from './analytics';
import { addPeriod, recurringSeries } from './recurring';
import { csvCell, toCsv } from './csv';
import { formatMoney, formatPercent, formatDate } from './format';
import type { Category, Transaction } from './types';

const cat = (id: string, name: string, essential = false, kind: 'expense' | 'income' = 'expense'): Category => ({
  id, name, kind, color: '#000000', icon: 'circle', essential, archived: false, sortOrder: 0, transactionCount: 0
});
let seq = 0;
const txn = (p: Partial<Transaction>): Transaction => ({
  id: `txn_${++seq}`, type: 'expense', amount: 0, currency: 'AED', categoryId: '', accountId: 'acc_1', toAccountId: '', toAmount: '',
  date: '2026-10-01', description: '', notes: '', recurrence: '', recurringId: '', linkType: '', linkId: '',
  createdAt: `2026-10-01T00:00:0${seq % 10}Z`, updatedAt: '', ...p
});

describe('periods', () => {
  it('builds month/quarter/year ranges and their previous periods', () => {
    expect(monthPeriod('2026-02')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthPeriod('2024-02').to).toBe('2024-02-29');
    expect(previousPeriod(monthPeriod('2026-01'))).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(quarterPeriod(2026, 4)).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(previousPeriod(quarterPeriod(2026, 1))).toMatchObject({ from: '2025-10-01', to: '2025-12-31' });
    expect(shiftPeriod(quarterPeriod(2026, 4), 1)).toMatchObject({ from: '2027-01-01' });
    expect(previousPeriod(yearPeriod(2026))).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
    // Custom: same length immediately before.
    expect(previousPeriod(customPeriod('2026-10-11', '2026-10-20'))).toMatchObject({ from: '2026-10-01', to: '2026-10-10' });
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });
});

describe('currency', () => {
  it('converts only with explicit rates and reports missing ones', () => {
    const c = makeConverter('AED', { USD: 3.6725 });
    expect(c.convert(100, 'AED')).toBe(100);
    expect(c.convert(100, 'USD')).toBeCloseTo(367.25);
    expect(c.convert(100, 'EUR')).toBeNull();
    expect(c.missing()).toEqual(['EUR']);
  });
  it('keeps separate totals per currency', () => {
    expect(totalsByCurrency([{ a: 1.1, c: 'AED' }, { a: 2.2, c: 'AED' }, { a: 5, c: 'USD' }], (x) => x.a, (x) => x.c)).toEqual({ AED: 3.3, USD: 5 });
  });
});

describe('spending analytics', () => {
  const cats = [cat('g', 'Groceries', true), cat('r', 'Restaurants'), cat('s', 'Salary', false, 'income')];
  const data = [
    txn({ amount: 400, categoryId: 'g', date: '2026-10-03', description: 'Big shop' }),
    txn({ amount: 100, categoryId: 'g', date: '2026-10-10' }),
    txn({ amount: 300, categoryId: 'r', date: '2026-10-12' }),
    txn({ amount: 250, categoryId: 'g', date: '2026-09-05' }),
    txn({ amount: 100, categoryId: 'r', date: '2026-09-06' }),
    txn({ type: 'income', amount: 4000, categoryId: 's', date: '2026-10-01' }),
    txn({ type: 'transfer', amount: 9999, toAccountId: 'acc_2', date: '2026-10-02' }),
    txn({ amount: 50, currency: 'USD', categoryId: 'r', date: '2026-10-04' })
  ];
  const a = spendingAnalytics(data, cats, monthPeriod('2026-10'), makeConverter('AED', {}), (n) => `AED ${n}`);

  it('totals expenses only (transfers excluded) and skips unconvertible currencies', () => {
    expect(a.totalExpenses).toBe(800);
    expect(a.previousExpenses).toBe(350);
    expect(a.totalIncome).toBe(4000);
    expect(a.missingRates).toEqual(['USD']);
  });

  it('computes per-category share, count, average and change', () => {
    const g = a.categories.find((c) => c.categoryId === 'g')!;
    expect(g).toMatchObject({ total: 500, count: 2, average: 250, previousTotal: 250 });
    expect(g.share).toBeCloseTo(500 / 800);
    expect(g.change).toBeCloseTo(1);
    const r = a.categories.find((c) => c.categoryId === 'r')!;
    expect(r.change).toBeCloseTo(2);
    expect(a.categories[0].categoryId).toBe('g');
  });

  it('splits essential vs discretionary and builds daily/monthly trends', () => {
    expect(a.essential).toBe(500);
    expect(a.discretionary).toBe(300);
    expect(a.daily).toHaveLength(31);
    expect(a.daily.find((d) => d.date === '2026-10-03')?.amount).toBe(400);
    expect(a.monthly).toHaveLength(12);
    expect(a.monthly.at(-1)).toEqual({ month: '2026-10', amount: 800 });
    expect(a.monthly.at(-2)).toEqual({ month: '2026-09', amount: 350 });
    expect(a.largest?.description).toBe('Big shop');
  });

  it('derives insights from the data', () => {
    expect(a.insights[0]).toContain('Groceries was your biggest expense');
    expect(a.insights.some((i) => i.includes('up 129%'))).toBe(true);
    expect(a.insights.some((i) => i.includes('You kept 80% of your income'))).toBe(true);
  });

  it('returns no insights without spending', () => {
    const empty = spendingAnalytics([], cats, monthPeriod('2026-10'), makeConverter('AED', {}), String);
    expect(empty.insights).toEqual([]);
    expect(empty.totalExpenses).toBe(0);
  });
});

describe('recurring', () => {
  it('advances by period and clamps to month length', () => {
    expect(addPeriod('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addPeriod('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(addPeriod('2026-10-01', 'weekly')).toBe('2026-10-08');
    expect(addPeriod('2026-11-15', 'quarterly')).toBe('2027-02-15');
    expect(addPeriod('2024-02-29', 'yearly')).toBe('2025-02-28');
  });
  it('finds the next due date from the latest occurrence', () => {
    const t = txn({ id: 'txn_rent', recurrence: 'monthly', recurringId: 'txn_rent', date: '2026-08-31', amount: 5000 });
    const o = txn({ recurringId: 'txn_rent', date: '2026-09-30', amount: 5000 });
    const [s] = recurringSeries([t, o], '2026-10-15');
    expect(s.nextDue).toBe('2026-10-31');
    expect(s.overdue).toBe(false);
    expect(s.occurrences).toBe(2);
    expect(s.monthlyEquivalent).toBe(5000);
  });
});

describe('csv', () => {
  it('quotes and neutralises formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(toCsv(['A', 'B'], [[1, null]])).toBe('A,B\r\n1,');
  });
});

describe('format', () => {
  it('formats money with its own currency code', () => {
    expect(formatMoney(1234.5, 'AED')).toBe('AED 1,234.50');
    expect(formatMoney(-10, 'USD')).toBe('-USD 10.00');
    expect(formatMoney(null, 'AED')).toBe('—');
    expect(formatPercent(0.256)).toBe('25.6%');
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026');
  });
});
