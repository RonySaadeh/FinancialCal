import { describe, expect, it } from 'vitest';
import { newEnv, signIn } from './helpers.js';

/** Two independent users (the family use case): neither can see or touch the other's records. */
function twoUsers() {
  const env = newEnv();
  const rony = signIn(env, 'rony');
  const wife = signIn(env, 'wife');

  const bank = rony.ok('addAccount', { name: 'Rony Bank', type: 'bank', openingBalance: 5000 });
  const groceries = rony.category('Groceries');
  const txn = rony.ok('addTransaction', { type: 'expense', amount: 120, categoryId: groceries.id, accountId: bank.id, date: '2026-10-02' });
  const goal = rony.ok('addSavingsGoal', { name: 'Car', targetAmount: 20000 });
  const debt = rony.ok('addDebt', { name: 'Car loan', type: 'car_loan', originalPrincipal: 50000 });
  const inv = rony.ok('addInvestment', { name: 'S&P 500 ETF', ticker: 'VOO', assetType: 'etf', currency: 'AED' });
  const trade = rony.ok('addInvestmentTransaction', { investmentId: inv.id, type: 'buy', quantity: 2, price: 100, date: '2026-10-01' });
  rony.ok('setBudget', { categoryId: groceries.id, month: '2026-10', amount: 1000 });
  return { env, rony, wife, bank, groceries, txn, goal, debt, inv, trade };
}

describe('per-user data isolation', () => {
  it('lists only the caller’s own records', () => {
    const { wife, rony } = twoUsers();
    expect(wife.ok('getAccounts')).toEqual([]);
    expect(wife.ok('getTransactions')).toEqual([]);
    expect(wife.ok('getSavingsGoals')).toEqual([]);
    expect(wife.ok('getDebts').debts).toEqual([]);
    expect(wife.ok('getInvestments').holdings).toEqual([]);
    expect(wife.ok('getBudgets', { month: '2026-10' }).items).toEqual([]);
    const dash = wife.ok('getDashboard');
    expect(dash.kpis.netWorth).toBe(0);
    expect(dash.recentTransactions).toEqual([]);
    // Each user has their own category set.
    const wifeCats = wife.ok('getCategories').map((c) => c.id);
    const ronyCats = rony.ok('getCategories').map((c) => c.id);
    expect(wifeCats.some((id) => ronyCats.includes(id))).toBe(false);
  });

  it('cannot read, change or delete another user’s records by ID', () => {
    const { wife, rony, bank, txn, goal, debt, inv, trade, groceries } = twoUsers();
    const attempts = [
      ['updateTransaction', { id: txn.id, amount: 1 }],
      ['deleteTransaction', { id: txn.id }],
      ['recordRecurring', { id: txn.id }],
      ['updateAccount', { id: bank.id, name: 'hacked' }],
      ['deleteAccount', { id: bank.id }],
      ['updateCategory', { id: groceries.id, name: 'hacked' }],
      ['updateSavingsGoal', { id: goal.id, name: 'hacked' }],
      ['deleteSavingsGoal', { id: goal.id }],
      ['addGoalContribution', { goalId: goal.id, amount: 10 }],
      ['updateDebt', { id: debt.id, name: 'hacked' }],
      ['deleteDebt', { id: debt.id }],
      ['addDebtPayment', { debtId: debt.id, amount: 10 }],
      ['updateInvestment', { id: inv.id, name: 'hacked' }],
      ['deleteInvestment', { id: inv.id }],
      ['addInvestmentTransaction', { investmentId: inv.id, type: 'sell', quantity: 1, price: 1 }],
      ['deleteInvestmentTransaction', { id: trade.id }],
      ['updateInvestmentPrice', { investmentId: inv.id, price: 1 }]
    ];
    for (const [action, payload] of attempts) {
      const res = wife.call(action, payload);
      expect(res.ok, action).toBe(false);
      expect(['NOT_FOUND', 'VALIDATION']).toContain(res.error.code);
    }
    // Rony's data is untouched.
    expect(rony.ok('getTransactions')[0].amount).toBe(120);
    expect(rony.ok('getAccounts')[0].name).toBe('Rony Bank');
    expect(rony.ok('getSavingsGoals')[0].name).toBe('Car');
    expect(rony.ok('getInvestments').holdings[0].metrics.quantity).toBe(2);
  });

  it('cannot attach records to another user’s account or category', () => {
    const { wife, bank, groceries } = twoUsers();
    const wifeCash = wife.ok('addAccount', { name: 'Wallet', type: 'cash' });
    const wifeGroceries = wife.category('Groceries');
    expect(wife.call('addTransaction', { type: 'expense', amount: 5, categoryId: wifeGroceries.id, accountId: bank.id, date: '2026-10-01' }).ok).toBe(false);
    expect(wife.call('addTransaction', { type: 'expense', amount: 5, categoryId: groceries.id, accountId: wifeCash.id, date: '2026-10-01' }).ok).toBe(false);
    expect(wife.call('addTransaction', { type: 'transfer', amount: 5, accountId: wifeCash.id, toAccountId: bank.id, date: '2026-10-01' }).ok).toBe(false);
    expect(wife.call('setBudget', { categoryId: groceries.id, month: '2026-10', amount: 1 }).ok).toBe(false);
  });

  it('ignores any user ID supplied by the frontend', () => {
    const { wife, rony } = twoUsers();
    const res = wife.call('getTransactions', { userId: rony.user.id });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const res2 = wife.call('addAccount', { name: 'x', type: 'cash', userId: rony.user.id });
    expect(res2.ok).toBe(false);
    expect(rony.ok('getAccounts')).toHaveLength(1);
  });

  it('never returns the owner user ID column in records', () => {
    const { rony } = twoUsers();
    expect(rony.ok('getTransactions')[0]).not.toHaveProperty('userId');
    expect(rony.ok('getAccounts')[0]).not.toHaveProperty('userId');
  });
});
