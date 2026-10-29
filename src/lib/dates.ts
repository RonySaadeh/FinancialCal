/** Calendar helpers on yyyy-MM-dd strings (no timezone arithmetic). */

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom';

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Local "today" as yyyy-MM-dd. */
export function todayLocal(now = new Date()) {
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthRange(endMonth: string, count: number) {
  return Array.from({ length: count }, (_, i) => addMonths(endMonth, i - count + 1));
}

export function addDays(date: string, delta: number) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86400000);
}

export function monthPeriod(month: string): Period {
  const [y, m] = month.split('-').map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { kind: 'month', from: `${month}-01`, to: ymd(y, m, daysInMonth(y, m)), label };
}

export function quarterPeriod(year: number, quarter: number): Period {
  const startM = (quarter - 1) * 3 + 1;
  return { kind: 'quarter', from: ymd(year, startM, 1), to: ymd(year, startM + 2, daysInMonth(year, startM + 2)), label: `Q${quarter} ${year}` };
}

export function yearPeriod(year: number): Period {
  return { kind: 'year', from: ymd(year, 1, 1), to: ymd(year, 12, 31), label: String(year) };
}

export function customPeriod(from: string, to: string): Period {
  return { kind: 'custom', from, to, label: `${from} → ${to}` };
}

/** The period of the same kind immediately before `p` (custom: same length, directly before). */
export function previousPeriod(p: Period): Period {
  if (p.kind === 'month') return monthPeriod(addMonths(p.from.slice(0, 7), -1));
  if (p.kind === 'quarter') {
    const y = Number(p.from.slice(0, 4));
    const q = Math.floor((Number(p.from.slice(5, 7)) - 1) / 3) + 1;
    return q === 1 ? quarterPeriod(y - 1, 4) : quarterPeriod(y, q - 1);
  }
  if (p.kind === 'year') return yearPeriod(Number(p.from.slice(0, 4)) - 1);
  const len = daysBetween(p.from, p.to);
  const to = addDays(p.from, -1);
  return customPeriod(addDays(to, -len), to);
}

export function shiftPeriod(p: Period, dir: -1 | 1): Period {
  if (dir === -1) return previousPeriod(p);
  if (p.kind === 'month') return monthPeriod(addMonths(p.from.slice(0, 7), 1));
  if (p.kind === 'quarter') {
    const y = Number(p.from.slice(0, 4));
    const q = Math.floor((Number(p.from.slice(5, 7)) - 1) / 3) + 1;
    return q === 4 ? quarterPeriod(y + 1, 1) : quarterPeriod(y, q + 1);
  }
  if (p.kind === 'year') return yearPeriod(Number(p.from.slice(0, 4)) + 1);
  const len = daysBetween(p.from, p.to);
  const from = addDays(p.to, 1);
  return customPeriod(from, addDays(from, len));
}

export function periodForKind(kind: PeriodKind, today: string, current?: Period): Period {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (kind === 'month') return monthPeriod(today.slice(0, 7));
  if (kind === 'quarter') return quarterPeriod(y, Math.floor((m - 1) / 3) + 1);
  if (kind === 'year') return yearPeriod(y);
  return current && current.kind === 'custom' ? current : customPeriod(addDays(today, -29), today);
}

export function inPeriod(date: string, p: { from: string; to: string }) {
  return date >= p.from && date <= p.to;
}
