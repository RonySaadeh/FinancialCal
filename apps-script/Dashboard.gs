/**
 * Dashboard and reports. All figures are in the user's preferred currency;
 * amounts in currencies without a stored exchange rate are excluded and
 * listed in `missingRates` so the UI can say so.
 */

function handleGetDashboard_(ctx) {
  const today = todayStr_();
  const month = today.slice(0, 7);
  const convert = userConverter_(ctx);
  const data = loadUserData_(ctx.userId);
  const sheet = balanceSheet_(data, '', today, convert);
  const months = monthRange_(month, 6);
  const flows = monthlyFlows_(data.transactions, months, convert);
  const current = flows[flows.length - 1];
  const catById = indexBy_(data.categories, 'id');
  const accById = indexBy_(data.accounts, 'id');

  const inv = data.investments.map(function (i) {
    return { inv: i, m: computeHolding_(i, data.investmentTransactions, data.priceHistory, '', today) };
  });
  const allocation = {};
  inv.forEach(function (x) {
    const v = convert(x.m.marketValue || 0, x.inv.currency);
    if (v) allocation[x.inv.assetType] = (allocation[x.inv.assetType] || 0) + v;
  });

  const recent = data.transactions.slice()
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1); })
    .slice(0, 8)
    .map(function (t) {
      const out = toPublic_(t);
      out.categoryName = t.categoryId && catById[t.categoryId] ? catById[t.categoryId].name : '';
      out.categoryColor = t.categoryId && catById[t.categoryId] ? catById[t.categoryId].color : '';
      out.accountName = accById[t.accountId] ? accById[t.accountId].name : '';
      out.toAccountName = accById[t.toAccountId] ? accById[t.toAccountId].name : '';
      return out;
    });

  const debts = handleGetDebts_(ctx);
  const goals = handleGetSavingsGoals_(ctx).filter(function (g) { return !g.archived; }).slice(0, 4);
  const budgets = budgetReport_(ctx, month);

  // Collect missing rates from every sub-calculation.
  const missing = {};
  convert.missing().concat(debts.missingRates, budgets.missingRates).forEach(function (c) { missing[c] = true; });

  return {
    currency: convert.base,
    asOf: today,
    month: month,
    kpis: {
      cashBalance: sheet.cashBalance,
      totalAssets: sheet.totalAssets,
      totalLiabilities: sheet.totalLiabilities,
      netWorth: sheet.netWorth,
      monthIncome: current.income,
      monthExpenses: current.expenses,
      monthSavings: current.savings,
      savingsRate: current.savingsRate,
      portfolioValue: sheet.portfolioValue,
      portfolioCost: sheet.portfolioCost,
      debtOutstanding: sheet.debtOutstanding
    },
    monthly: flows,
    expensesByCategory: expensesByCategory_(data.transactions, data.categories, month + '-01', lastDayOfMonth_(month), convert),
    allocation: Object.keys(allocation).map(function (k) { return { assetType: k, value: round2_(allocation[k]) }; })
      .sort(function (a, b) { return b.value - a.value; }),
    portfolioHistory: portfolioHistory_(data.investments, data.investmentTransactions, data.priceHistory, today, 6, convert),
    recentTransactions: recent,
    budgets: budgets.items.slice(0, 5),
    upcomingDebtPayments: debts.upcoming.slice(0, 5),
    goals: goals.map(function (g) {
      return { id: g.id, name: g.name, saved: g.saved, targetAmount: g.targetAmount, currency: g.currency, progress: g.progress, targetDate: g.targetDate };
    }),
    stalePrices: inv.filter(function (x) { return x.m.stale; }).map(function (x) { return { id: x.inv.id, name: x.inv.name, priceDate: x.m.priceDate }; }),
    counts: {
      accounts: data.accounts.length,
      transactions: data.transactions.length,
      investments: data.investments.length,
      debts: data.debts.length,
      goals: data.goals.length
    },
    missingRates: Object.keys(missing).sort()
  };
}

/** Monthly report series over the last `months` months (default 12). */
function handleGetReports_(ctx, payload) {
  vPayload_(payload, ['months', 'endMonth']);
  const count = vInt_(payload.months, 'Months', { min: 1, max: 60, defaultValue: 12 });
  const today = todayStr_();
  const endMonth = vMonth_(payload.endMonth, 'End month') || today.slice(0, 7);
  const convert = userConverter_(ctx);
  const data = loadUserData_(ctx.userId);
  const months = monthRange_(endMonth, count);
  const flows = monthlyFlows_(data.transactions, months, convert);

  const series = flows.map(function (f) {
    const asOf = f.month === today.slice(0, 7) ? today : lastDayOfMonth_(f.month);
    const bs = asOf > today ? null : balanceSheet_(data, asOf, today, convert);
    return Object.assign({}, f, bs ? {
      netWorth: bs.netWorth, totalAssets: bs.totalAssets, totalLiabilities: bs.totalLiabilities,
      cashBalance: bs.cashBalance, debtOutstanding: bs.debtOutstanding,
      portfolioValue: bs.portfolioValue, portfolioCost: bs.portfolioCost
    } : {});
  });

  const from = months[0] + '-01';
  const to = lastDayOfMonth_(months[months.length - 1]);
  const totals = series.reduce(function (acc, s) {
    acc.income += s.income;
    acc.expenses += s.expenses;
    return acc;
  }, { income: 0, expenses: 0 });
  totals.income = round2_(totals.income);
  totals.expenses = round2_(totals.expenses);
  totals.savings = round2_(totals.income - totals.expenses);
  totals.savingsRate = totals.income > 0 ? totals.savings / totals.income : null;

  const holdings = data.investments.map(function (i) {
    const m = computeHolding_(i, data.investmentTransactions, data.priceHistory, '', today);
    return {
      id: i.id, name: i.name, ticker: i.ticker, assetType: i.assetType, currency: i.currency,
      quantity: m.quantity, costBasis: m.costBasis, marketValue: m.marketValue, unrealizedPL: m.unrealizedPL,
      realizedPL: m.realizedPL, returnPct: m.returnPct, priceDate: m.priceDate, stale: m.stale
    };
  });

  const debtPaymentsInRange = data.debtPayments.filter(function (p) { return p.date >= from && p.date <= to; });
  const debtCurrency = function (p) {
    const d = data.debts.find(function (x) { return x.id === p.debtId; });
    return d ? d.currency : convert.base;
  };
  return {
    currency: convert.base,
    from: from,
    to: to,
    series: series,
    totals: totals,
    spendingByCategory: expensesByCategory_(data.transactions, data.categories, from, to, convert),
    investmentPerformance: holdings,
    debtReduction: {
      principalRepaid: sumConverted_(debtPaymentsInRange, convert, function (p) { return p.principal; }, debtCurrency),
      interestPaid: sumConverted_(debtPaymentsInRange, convert, function (p) { return p.interest; }, debtCurrency)
    },
    missingRates: convert.missing()
  };
}
