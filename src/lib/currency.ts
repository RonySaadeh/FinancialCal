/**
 * Currency conversion with explicit, user-entered rates only.
 * rates[X] = how many units of the base currency one unit of X is worth.
 * Amounts in a currency without a rate are never silently summed: they are
 * returned as null and the currency is reported as missing.
 */
export interface Converter {
  base: string;
  convert(amount: number, currency: string): number | null;
  missing(): string[];
}

export function makeConverter(base: string, rates: Record<string, number>): Converter {
  const missing = new Set<string>();
  return {
    base,
    convert(amount, currency) {
      if (!currency || currency === base) return amount;
      const r = rates[currency];
      if (!r || !Number.isFinite(r) || r <= 0) {
        missing.add(currency);
        return null;
      }
      return amount * r;
    },
    missing: () => [...missing].sort()
  };
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Totals per currency (for showing unconverted amounts side by side). */
export function totalsByCurrency<T>(items: T[], amount: (t: T) => number, currency: (t: T) => string) {
  const out: Record<string, number> = {};
  for (const it of items) {
    const c = currency(it);
    out[c] = round2((out[c] ?? 0) + amount(it));
  }
  return out;
}
