/** Display formatting. Amounts are formatted in their own currency, never mixed. */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | null | undefined, currency: string, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  const key = `${currency}|${opts.compact ? 'c' : ''}|${opts.sign ? 's' : ''}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        notation: opts.compact ? 'compact' : 'standard',
        maximumFractionDigits: opts.compact ? 1 : 2,
        minimumFractionDigits: opts.compact ? 0 : 2,
        signDisplay: opts.sign ? 'exceptZero' : 'auto'
      });
    } catch {
      f = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    }
    moneyFormatters.set(key, f);
  }
  // Intl puts a non-breaking space after the code; normalise for consistent layout.
  return f.format(amount).replace(/ /g, ' ');
}

export function formatNumber(n: number | null | undefined, maxDigits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDigits }).format(n);
}

export function formatPercent(ratio: number | null | undefined, digits = 1, sign = false): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    signDisplay: sign ? 'exceptZero' : 'auto'
  }).format(ratio);
}

/** yyyy-MM-dd -> "15 Oct 2026" (no timezone shifts: parsed as a calendar date). */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** yyyy-MM -> "Oct 2026" or "Oct" when short. */
export function formatMonth(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', short ? { month: 'short', timeZone: 'UTC' } : { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: 'Cash', bank: 'Bank account', savings: 'Savings account', credit_card: 'Credit card'
};

export const DEBT_TYPE_LABELS: Record<string, string> = {
  personal_loan: 'Personal loan', car_loan: 'Car loan', home_loan: 'Home loan', credit_card: 'Credit card balance', other: 'Other liability'
};

export const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: 'Stocks', etf: 'ETFs', mutual_fund: 'Mutual funds', bond: 'Bonds', crypto: 'Crypto',
  gold: 'Gold', real_estate: 'Real estate', other: 'Other'
};

export const RECURRENCE_LABELS: Record<string, string> = {
  '': 'Does not repeat', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly'
};

export const COMMON_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'INR', 'PKR', 'EGP', 'LBP', 'JOD', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'SGD'];
