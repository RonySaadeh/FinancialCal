/**
 * Pure financial calculations. No spreadsheet access here, so everything is
 * unit-tested in tests/backend.
 *
 * Accounting model (avoids double counting):
 *  - Account balance = openingBalance + income - expenses -/+ transfers.
 *    Credit cards hold negative balances when money is owed.
 *  - A credit-card purchase is one expense on the card account. Paying the
 *    card is a transfer (bank -> card), never a second expense.
 *  - Transfers never count as income or expenses.
 *  - Investment buys/sells with a cash account create linked transfers that
 *    move cash out of/into the account; the holding's market value is the
 *    only place the investment itself is counted.
 *  - Debt repayments reduce the debt by their principal portion only; the
 *    interest portion is an expense. Paid from an account, the principal is a
 *    linked transfer out of the account (not an expense).
 *  - Savings goals are earmarks on existing balances, never added to assets.
 *
 * Cost basis: weighted average cost. Fees on buys are added to cost; fees on
 * sells reduce proceeds. A sale realises (price * qty - fees) - avgCost * qty.
 */

/** Returns [{accountId, delta}] describing how a transaction changes account balances. */
function txnEffects_(t) {
  const amount = Number(t.amount) || 0;
  if (t.type === 'income') return t.accountId ? [{ accountId: t.accountId, delta: amount }] : [];
  if (t.type === 'expense') return t.accountId ? [{ accountId: t.accountId, delta: -amount }] : [];
  const out = [];
  if (t.accountId) out.push({ accountId: t.accountId, delta: -amount });
  if (t.toAccountId) {
    const toAmount = t.toAmount === null || t.toAmount === undefined || t.toAmount === '' ? amount : Number(t.toAmount);
    out.push({ accountId: t.toAccountId, delta: toAmount });
  }
  return out;
}

/** Balance per account ID, optionally as of a date (inclusive). */
function accountBalances_(accounts, txns, asOfDate) {
  const bal = {};
  accounts.forEach(function (a) {
    const opened = !asOfDate || !a.openingDate || a.openingDate <= asOfDate;
    bal[a.id] = opened ? Number(a.openingBalance) || 0 : 0;
  });
  txns.forEach(function (t) {
    if (asOfDate && t.date > asOfDate) return;
    txnEffects_(t).forEach(function (e) {
      if (Object.prototype.hasOwnProperty.call(bal, e.accountId)) bal[e.accountId] += e.delta;
    });
  });
  Object.keys(bal).forEach(function (k) { bal[k] = round2_(bal[k]); });
  return bal;
}

/**
 * Converter into the base currency using explicit user rates
 * ("1 unit of currency = rate base"). Unknown currencies return null and are
 * recorded in `missing`, so callers can exclude them and warn rather than
 * silently summing different currencies.
 */
function makeConverter_(base, rates) {
  const missing = {};
  const convert = function (amount, currency) {
    if (amount === null || amount === undefined) return null;
    if (!currency || currency === base) return Number(amount);
    const r = rates && rates[currency];
    if (!r) {
      missing[currency] = true;
      return null;
    }
    return Number(amount) * r;
  };
  convert.base = base;
  convert.missing = function () { return Object.keys(missing).sort(); };
  return convert;
}

/** Sums `items` after converting with `convert`; unconvertible items are skipped. */
function sumConverted_(items, convert, amountFn, currencyFn) {
  let total = 0;
  items.forEach(function (item) {
    const v = convert(amountFn(item), currencyFn(item));
    if (v !== null) total += v;
  });
  return round2_(total);
}

/** Price observations for an investment, newest last: manual updates and trade prices. */
function priceObservations_(investmentId, invTxns, priceHistory) {
  const obs = [];
  priceHistory.forEach(function (p) {
    if (p.investmentId === investmentId) obs.push({ date: p.date, price: Number(p.price), source: 'manual', order: 1 });
  });
  invTxns.forEach(function (t) {
    if (t.investmentId === investmentId) obs.push({ date: t.date, price: Number(t.price), source: 'trade', order: 0 });
  });
  obs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order; });
  return obs;
}

function sortInvTxns_(list) {
  return list.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.createdAt) < String(b.createdAt) ? -1 : String(a.createdAt) > String(b.createdAt) ? 1 : 0;
  });
}

/**
 * Replays an investment's transactions (weighted average cost) up to asOfDate.
 * Throws if a sale would exceed the quantity held at that point.
 */
function replayHolding_(invTxns, asOfDate) {
  let qty = 0, cost = 0, realized = 0, invested = 0, proceeds = 0, feesPaid = 0;
  sortInvTxns_(invTxns).forEach(function (t) {
    if (asOfDate && t.date > asOfDate) return;
    const q = Number(t.quantity), p = Number(t.price), f = Number(t.fees) || 0;
    feesPaid += f;
    if (t.type === 'buy') {
      cost += q * p + f;
      invested += q * p + f;
      qty += q;
    } else if (t.type === 'sell') {
      if (q > qty + 1e-9) {
        throw apiError_('VALIDATION', 'Sale on ' + t.date + ' exceeds the quantity held (' + roundQty_(qty) + ').');
      }
      const avg = qty > 0 ? cost / qty : 0;
      const costSold = avg * q;
      realized += q * p - f - costSold;
      proceeds += q * p - f;
      cost -= costSold;
      qty -= q;
      if (qty < 1e-9) { qty = 0; cost = 0; }
    }
  });
  return {
    quantity: roundQty_(qty),
    costBasis: round2_(cost),
    averageCost: qty > 0 ? cost / qty : 0,
    realizedPL: round2_(realized),
    totalInvested: round2_(invested),
    totalProceeds: round2_(proceeds),
    feesPaid: round2_(feesPaid)
  };
}

/** Full holding metrics for one investment as of a date (default: today). */
function computeHolding_(inv, allInvTxns, priceHistory, asOfDate, today) {
  const own = allInvTxns.filter(function (t) { return t.investmentId === inv.id; });
  const h = replayHolding_(own, asOfDate);
  const obs = priceObservations_(inv.id, own, priceHistory).filter(function (o) { return !asOfDate || o.date <= asOfDate; });
  const last = obs.length ? obs[obs.length - 1] : null;
  const price = last ? last.price : null;
  const marketValue = price === null ? null : round2_(h.quantity * price);
  const unrealized = marketValue === null ? null : round2_(marketValue - h.costBasis);
  const refDate = asOfDate || today;
  return {
    quantity: h.quantity,
    costBasis: h.costBasis,
    averageCost: h.averageCost,
    realizedPL: h.realizedPL,
    totalInvested: h.totalInvested,
    totalProceeds: h.totalProceeds,
    feesPaid: h.feesPaid,
    price: price,
    priceDate: last ? last.date : '',
    priceSource: last ? last.source : 'none',
    priceAgeDays: last && refDate ? daysBetween_(last.date, refDate) : null,
    stale: !!(last && refDate && h.quantity > 0 && daysBetween_(last.date, refDate) > STALE_PRICE_DAYS),
    marketValue: marketValue,
    unrealizedPL: unrealized,
    returnPct: unrealized !== null && h.costBasis > 0 ? unrealized / h.costBasis : null,
    totalReturn: unrealized === null ? h.realizedPL : round2_(unrealized + h.realizedPL)
  };
}

/** Outstanding balance of a debt as of a date: opening balance minus principal repaid. */
function debtOutstanding_(debt, payments, asOfDate) {
  if (asOfDate && debt.startDate && debt.startDate > asOfDate) return 0;
  const paid = payments.reduce(function (sum, p) {
    if (p.debtId !== debt.id || (asOfDate && p.date > asOfDate)) return sum;
    return sum + (Number(p.principal) || 0);
  }, 0);
  return round2_(Math.max(0, (Number(debt.openingBalance) || 0) - paid));
}

/** Next due date on or after `today` for a monthly due day (clamped to month length). */
function nextDueDate_(dueDay, today) {
  if (!dueDay) return '';
  const p = parseYmd_(today);
  const thisDay = Math.min(dueDay, daysInMonth_(p.y, p.m));
  if (thisDay >= p.d) return ymd_(p.y, p.m, thisDay);
  const next = addMonths_(today.slice(0, 7), 1);
  const ny = Number(next.slice(0, 4)), nm = Number(next.slice(5, 7));
  return ymd_(ny, nm, Math.min(dueDay, daysInMonth_(ny, nm)));
}

/** Income and expenses per month (base currency). Transfers are excluded. */
function monthlyFlows_(txns, months, convert) {
  const byMonth = {};
  months.forEach(function (m) { byMonth[m] = { month: m, income: 0, expenses: 0 }; });
  txns.forEach(function (t) {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const row = byMonth[monthOf_(t.date)];
    if (!row) return;
    const v = convert(t.amount, t.currency);
    if (v === null) return;
    if (t.type === 'income') row.income += v; else row.expenses += v;
  });
  return months.map(function (m) {
    const r = byMonth[m];
    const income = round2_(r.income), expenses = round2_(r.expenses);
    const savings = round2_(income - expenses);
    return { month: m, income: income, expenses: expenses, savings: savings, savingsRate: income > 0 ? savings / income : null };
  });
}

/** Expense totals per category between two dates (inclusive), in base currency. */
function expensesByCategory_(txns, categories, fromDate, toDate, convert) {
  const totals = {};
  txns.forEach(function (t) {
    if (t.type !== 'expense' || t.date < fromDate || t.date > toDate) return;
    const v = convert(t.amount, t.currency);
    if (v === null) return;
    const key = t.categoryId || '';
    totals[key] = (totals[key] || 0) + v;
  });
  const catById = indexBy_(categories, 'id');
  return Object.keys(totals).map(function (id) {
    const c = catById[id];
    return { categoryId: id, name: c ? c.name : 'Uncategorised', color: c ? c.color : '#94a3b8', amount: round2_(totals[id]) };
  }).sort(function (a, b) { return b.amount - a.amount; });
}

/**
 * Balance-sheet snapshot as of a date (base currency).
 * Assets: positive account balances + investment market value.
 * Liabilities: negative account balances (e.g. credit cards) + debt outstanding.
 */
function balanceSheet_(data, asOfDate, today, convert) {
  const balances = accountBalances_(data.accounts, data.transactions, asOfDate);
  let cash = 0, accountAssets = 0, accountLiabilities = 0;
  data.accounts.forEach(function (a) {
    const v = convert(balances[a.id], a.currency);
    if (v === null) return;
    if (a.type !== 'credit_card') cash += v;
    if (v >= 0) accountAssets += v; else accountLiabilities += -v;
  });
  let portfolio = 0, portfolioCost = 0;
  data.investments.forEach(function (inv) {
    const h = computeHolding_(inv, data.investmentTransactions, data.priceHistory, asOfDate, today);
    const mv = convert(h.marketValue === null ? 0 : h.marketValue, inv.currency);
    const cb = convert(h.costBasis, inv.currency);
    if (mv !== null) portfolio += mv;
    if (cb !== null) portfolioCost += cb;
  });
  let debts = 0;
  data.debts.forEach(function (d) {
    const v = convert(debtOutstanding_(d, data.debtPayments, asOfDate), d.currency);
    if (v !== null) debts += v;
  });
  const assets = accountAssets + portfolio;
  const liabilities = accountLiabilities + debts;
  return {
    balances: balances,
    cashBalance: round2_(cash),
    accountAssets: round2_(accountAssets),
    accountLiabilities: round2_(accountLiabilities),
    portfolioValue: round2_(portfolio),
    portfolioCost: round2_(portfolioCost),
    debtOutstanding: round2_(debts),
    totalAssets: round2_(assets),
    totalLiabilities: round2_(liabilities),
    netWorth: round2_(assets - liabilities)
  };
}

/** Next due date of a recurring series, based on its last occurrence. */
function recurringNextDue_(template, occurrences) {
  if (!template.recurrence) return '';
  let last = template.date;
  occurrences.forEach(function (o) { if (o.date > last) last = o.date; });
  return addPeriod_(last, template.recurrence, parseYmd_(template.date).d);
}
