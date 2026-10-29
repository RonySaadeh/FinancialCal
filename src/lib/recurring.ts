import type { Recurrence, Transaction } from './types';
import { addDays, addMonths, daysInMonth, ymd } from './dates';

/** Same rule as the backend (Util.gs addPeriod_): months clamp to the anchor day. */
export function addPeriod(date: string, recurrence: Exclude<Recurrence, ''>, anchorDay?: number): string {
  if (recurrence === 'weekly') return addDays(date, 7);
  const months = recurrence === 'monthly' ? 1 : recurrence === 'quarterly' ? 3 : 12;
  const target = addMonths(date.slice(0, 7), months);
  const [y, m] = target.split('-').map(Number);
  const day = Math.min(anchorDay ?? Number(date.slice(8, 10)), daysInMonth(y, m));
  return ymd(y, m, day);
}

export const MONTHLY_FACTOR: Record<Exclude<Recurrence, ''>, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12
};

export interface RecurringSeries {
  template: Transaction;
  occurrences: number;
  lastDate: string;
  nextDue: string;
  overdue: boolean;
  monthlyEquivalent: number;
}

/** Active recurring series (templates) with their next due date. */
export function recurringSeries(transactions: Transaction[], today: string): RecurringSeries[] {
  const byId = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.recurringId) byId.set(t.recurringId, [...(byId.get(t.recurringId) ?? []), t]);
  }
  return transactions
    .filter((t) => t.recurrence && t.recurringId === t.id)
    .map((template) => {
      const series = byId.get(template.id) ?? [template];
      const lastDate = series.reduce((m, t) => (t.date > m ? t.date : m), template.date);
      const rec = template.recurrence as Exclude<Recurrence, ''>;
      const nextDue = addPeriod(lastDate, rec, Number(template.date.slice(8, 10)));
      return {
        template,
        occurrences: series.length,
        lastDate,
        nextDue,
        overdue: nextDue <= today,
        monthlyEquivalent: template.amount * MONTHLY_FACTOR[rec]
      };
    })
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}
