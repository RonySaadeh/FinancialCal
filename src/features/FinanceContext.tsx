import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useBootstrap } from '../lib/queries';
import { makeConverter } from '../lib/currency';
import type { Account, Bootstrap, Category } from '../lib/types';
import { formatMoney } from '../lib/format';
import { ErrorState, Spinner } from '../components/ui';

interface Finance extends Bootstrap {
  base: string;
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  openAccounts: Account[];
  expenseCategories: Category[];
  incomeCategories: Category[];
  money: (n: number | null | undefined, currency?: string) => string;
  newConverter: () => ReturnType<typeof makeConverter>;
}

const FinanceContext = createContext<Finance | null>(null);

/** Loads accounts, categories, rates and preferences once for the signed-in user. */
export function FinanceProvider({ children }: { children: ReactNode }) {
  const q = useBootstrap();
  const value = useMemo<Finance | null>(() => {
    if (!q.data) return null;
    const d = q.data;
    const base = d.user.preferredCurrency || 'AED';
    const activeCats = d.categories.filter((c) => !c.archived);
    return {
      ...d,
      base,
      accountById: new Map(d.accounts.map((a) => [a.id, a])),
      categoryById: new Map(d.categories.map((c) => [c.id, c])),
      openAccounts: d.accounts.filter((a) => !a.archived),
      expenseCategories: activeCats.filter((c) => c.kind === 'expense'),
      incomeCategories: activeCats.filter((c) => c.kind === 'income'),
      money: (n, currency) => formatMoney(n, currency ?? base),
      newConverter: () => makeConverter(base, d.exchangeRates)
    };
  }, [q.data]);

  if (q.isPending) return <Spinner label="Loading your finances…" />;
  if (q.isError || !value) return <div className="p-6"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used inside FinanceProvider');
  return ctx;
}
