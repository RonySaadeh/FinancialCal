/**
 * Investments: holdings, buy/sell trades and manually entered prices.
 *
 * Trades live in InvestmentTransactions, separate from ordinary expenses.
 * If a trade names a cash account, a linked transfer moves the cash so
 * account balances stay right — purchases are never counted as spending.
 * Prices are only ever what the user entered (or the price of a recorded
 * trade); nothing is fetched or invented. See Calc.gs for cost-basis rules.
 */

function handleGetInvestments_(ctx) {
  const today = todayStr_();
  const convert = userConverter_(ctx);
  const investments = listForUser_('Investments', ctx.userId);
  const itx = listForUser_('InvestmentTransactions', ctx.userId);
  const prices = listForUser_('PriceHistory', ctx.userId);

  const holdings = investments.map(function (inv) {
    const out = toPublic_(inv);
    out.metrics = computeHolding_(inv, itx, prices, '', today);
    out.transactions = sortInvTxns_(itx.filter(function (t) { return t.investmentId === inv.id; })).reverse().map(toPublic_);
    out.prices = prices.filter(function (p) { return p.investmentId === inv.id; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(toPublic_);
    return out;
  }).sort(function (a, b) { return a.archived - b.archived || (b.metrics.marketValue || 0) - (a.metrics.marketValue || 0); });

  const totals = { marketValue: 0, costBasis: 0, unrealizedPL: 0, realizedPL: 0 };
  const byType = {};
  const byHolding = [];
  holdings.forEach(function (h) {
    const m = h.metrics;
    const mv = convert(m.marketValue || 0, h.currency);
    const cb = convert(m.costBasis, h.currency);
    const rl = convert(m.realizedPL, h.currency);
    if (mv !== null) totals.marketValue += mv;
    if (cb !== null) totals.costBasis += cb;
    if (rl !== null) totals.realizedPL += rl;
    if (mv !== null && mv > 0) {
      byType[h.assetType] = (byType[h.assetType] || 0) + mv;
      byHolding.push({ id: h.id, name: h.name, ticker: h.ticker, value: round2_(mv) });
    }
  });
  totals.unrealizedPL = totals.marketValue - totals.costBasis;
  Object.keys(totals).forEach(function (k) { totals[k] = round2_(totals[k]); });
  totals.returnPct = totals.costBasis > 0 ? totals.unrealizedPL / totals.costBasis : null;

  return {
    currency: convert.base,
    holdings: holdings,
    totals: totals,
    allocationByType: Object.keys(byType).map(function (t) { return { assetType: t, value: round2_(byType[t]) }; })
      .sort(function (a, b) { return b.value - a.value; }),
    allocationByHolding: byHolding.sort(function (a, b) { return b.value - a.value; }),
    history: portfolioHistory_(investments, itx, prices, today, 12, convert),
    staleCount: holdings.filter(function (h) { return h.metrics.stale; }).length,
    stalePriceDays: STALE_PRICE_DAYS,
    missingRates: convert.missing()
  };
}

/** Month-end portfolio value vs cost basis, using only prices known on each date. */
function portfolioHistory_(investments, itx, prices, today, months, convert) {
  const endMonth = today.slice(0, 7);
  return monthRange_(endMonth, months).map(function (m) {
    const asOf = m === endMonth ? today : lastDayOfMonth_(m);
    let value = 0, cost = 0;
    investments.forEach(function (inv) {
      const h = computeHolding_(inv, itx, prices, asOf, today);
      const v = convert(h.marketValue || 0, inv.currency);
      const c = convert(h.costBasis, inv.currency);
      if (v !== null) value += v;
      if (c !== null) cost += c;
    });
    return { month: m, value: round2_(value), costBasis: round2_(cost) };
  });
}

function investmentFields_(ctx, payload, existing) {
  const out = {};
  const has = function (k) { return !existing || payload[k] !== undefined; };
  if (has('name')) out.name = vString_(payload.name, 'Name', { required: true, max: 80 });
  if (has('ticker')) out.ticker = vString_(payload.ticker, 'Ticker', { max: 20 }).toUpperCase();
  if (has('assetType')) out.assetType = vEnum_(payload.assetType, 'Asset type', ENUMS.assetType);
  if (has('notes')) out.notes = vString_(payload.notes, 'Notes', { max: 500 });
  if (payload.archived !== undefined) out.archived = vBool_(payload.archived, 'Archived');
  if (payload.currency !== undefined || !existing) {
    const currency = vCurrency_(payload.currency, 'Currency', { defaultValue: ctx.user.preferredCurrency || DEFAULT_CURRENCY });
    if (existing && currency !== existing.currency && listForUser_('InvestmentTransactions', ctx.userId).some(function (t) { return t.investmentId === existing.id; })) {
      throw apiError_('CONFLICT', 'The currency of an investment with trades cannot be changed.');
    }
    out.currency = currency;
  }
  return out;
}

function handleAddInvestment_(ctx, payload) {
  vPayload_(payload, ['name', 'ticker', 'assetType', 'currency', 'notes']);
  const now = nowIso_();
  const rec = Object.assign({
    id: newId_('Investments'), userId: ctx.userId, currentPrice: '', priceUpdatedAt: '', archived: false, createdAt: now, updatedAt: now
  }, investmentFields_(ctx, payload, null));
  insertRecord_('Investments', rec);
  return toPublic_(rec);
}

function handleUpdateInvestment_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'ticker', 'assetType', 'currency', 'notes', 'archived']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.id, 'Investment', 'Investments'));
  return toPublic_(updateForUser_('Investments', ctx.userId, inv.id, investmentFields_(ctx, payload, inv)));
}

/** Deletes a holding with its trades, prices and linked cash transfers. */
function handleDeleteInvestment_(ctx, payload) {
  vPayload_(payload, ['id']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.id, 'Investment', 'Investments'));
  const tradeIds = listForUser_('InvestmentTransactions', ctx.userId).filter(function (t) { return t.investmentId === inv.id; }).map(function (t) { return t.id; });
  deleteLinkedTransactions_(ctx.userId, 'investment', tradeIds);
  deleteWhere_('InvestmentTransactions', function (t) { return t.userId === ctx.userId && t.investmentId === inv.id; });
  deleteWhere_('PriceHistory', function (p) { return p.userId === ctx.userId && p.investmentId === inv.id; });
  deleteForUser_('Investments', ctx.userId, inv.id);
  return { deleted: inv.id };
}

function handleAddInvestmentTransaction_(ctx, payload) {
  vPayload_(payload, ['investmentId', 'type', 'date', 'quantity', 'price', 'fees', 'cashAccountId', 'note']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.investmentId, 'Investment', 'Investments'));
  const rec = {
    id: newId_('InvestmentTransactions'), userId: ctx.userId, investmentId: inv.id,
    type: vEnum_(payload.type, 'Type', ENUMS.investmentTxnType),
    date: vDate_(payload.date, 'Date') || todayStr_(),
    quantity: vNumber_(payload.quantity, 'Quantity', { required: true, positive: true, decimals: 8 }),
    price: vNumber_(payload.price, 'Price per unit', { required: true, decimals: 8 }),
    fees: vNumber_(payload.fees, 'Fees', { defaultValue: 0 }),
    cashAccountId: '', note: vString_(payload.note, 'Note', { max: 200 }), createdAt: nowIso_()
  };
  const account = requireAccount_(ctx.userId, payload.cashAccountId, 'Cash account', { required: false, open: true });
  if (account && account.currency !== inv.currency) {
    throw apiError_('VALIDATION', 'The cash account must be in ' + inv.currency + ' to link this trade.');
  }
  // Replaying with the new trade rejects sales larger than the quantity held on that date.
  const own = listForUser_('InvestmentTransactions', ctx.userId).filter(function (t) { return t.investmentId === inv.id; });
  replayHolding_(own.concat([rec]), '');
  if (rec.type === 'sell' && rec.quantity * rec.price - rec.fees < 0) {
    throw apiError_('VALIDATION', 'Fees cannot exceed the sale proceeds.');
  }
  rec.cashAccountId = account ? account.id : '';
  insertRecord_('InvestmentTransactions', rec);
  if (account) {
    const gross = rec.quantity * rec.price;
    const label = (rec.type === 'buy' ? 'Buy ' : 'Sell ') + (inv.ticker || inv.name);
    insertLinkedTransaction_(ctx.userId, rec.type === 'buy'
      ? { type: 'transfer', amount: gross + rec.fees, currency: account.currency, accountId: account.id, date: rec.date, description: label, linkType: 'investment', linkId: rec.id }
      : { type: 'transfer', amount: gross - rec.fees, currency: account.currency, toAccountId: account.id, date: rec.date, description: label, linkType: 'investment', linkId: rec.id });
  }
  return toPublic_(rec);
}

function handleDeleteInvestmentTransaction_(ctx, payload) {
  vPayload_(payload, ['id']);
  const t = getForUser_('InvestmentTransactions', ctx.userId, vId_(payload.id, 'Trade', 'InvestmentTransactions'));
  const remaining = listForUser_('InvestmentTransactions', ctx.userId).filter(function (x) { return x.investmentId === t.investmentId && x.id !== t.id; });
  try {
    replayHolding_(remaining, '');
  } catch (e) {
    throw apiError_('CONFLICT', 'Deleting this purchase would leave a later sale larger than the quantity held. Delete the sale first.');
  }
  deleteLinkedTransactions_(ctx.userId, 'investment', [t.id]);
  deleteForUser_('InvestmentTransactions', ctx.userId, t.id);
  return { deleted: t.id };
}

/** Records a manually entered market price for a holding. */
function handleUpdateInvestmentPrice_(ctx, payload) {
  vPayload_(payload, ['investmentId', 'price', 'date']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.investmentId, 'Investment', 'Investments'));
  const price = vNumber_(payload.price, 'Price', { required: true, decimals: 8 });
  const date = vDate_(payload.date, 'Price date') || todayStr_();
  if (date > todayStr_()) throw apiError_('VALIDATION', 'Price date cannot be in the future.');
  insertRecord_('PriceHistory', { id: newId_('PriceHistory'), userId: ctx.userId, investmentId: inv.id, date: date, price: price, createdAt: nowIso_() });
  if (!inv.priceUpdatedAt || date >= inv.priceUpdatedAt) {
    updateForUser_('Investments', ctx.userId, inv.id, { currentPrice: price, priceUpdatedAt: date });
  }
  return { investmentId: inv.id, price: price, date: date };
}

function handleDeletePrice_(ctx, payload) {
  vPayload_(payload, ['id']);
  const p = getForUser_('PriceHistory', ctx.userId, vId_(payload.id, 'Price', 'PriceHistory'));
  deleteForUser_('PriceHistory', ctx.userId, p.id);
  const latest = listForUser_('PriceHistory', ctx.userId).filter(function (x) { return x.investmentId === p.investmentId; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
  updateForUser_('Investments', ctx.userId, p.investmentId, { currentPrice: latest ? latest.price : '', priceUpdatedAt: latest ? latest.date : '' });
  return { deleted: p.id };
}
