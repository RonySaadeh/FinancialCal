/**
 * Monthly budgets per expense category, expressed in the user's preferred
 * currency. Actual spending is converted with the user's stored exchange rates.
 */

function budgetReport_(ctx, month) {
  const convert = userConverter_(ctx);
  const categories = listForUser_('Categories', ctx.userId);
  const catById = indexBy_(categories, 'id');
  const budgets = listForUser_('Budgets', ctx.userId).filter(function (b) { return b.month === month; });
  const spent = {};
  listForUser_('Transactions', ctx.userId).forEach(function (t) {
    if (t.type !== 'expense' || monthOf_(t.date) !== month) return;
    const v = convert(t.amount, t.currency);
    if (v !== null) spent[t.categoryId] = (spent[t.categoryId] || 0) + v;
  });
  const items = budgets.map(function (b) {
    const c = catById[b.categoryId] || {};
    const actual = round2_(spent[b.categoryId] || 0);
    return {
      id: b.id, categoryId: b.categoryId, categoryName: c.name || 'Unknown', color: c.color || '#94a3b8',
      month: b.month, amount: b.amount, spent: actual, remaining: round2_(b.amount - actual),
      percentUsed: b.amount > 0 ? actual / b.amount : null
    };
  }).sort(function (a, b) { return b.spent - a.spent; });
  const budgeted = {};
  budgets.forEach(function (b) { budgeted[b.categoryId] = true; });
  const unbudgeted = Object.keys(spent).filter(function (id) { return !budgeted[id]; }).map(function (id) {
    const c = catById[id] || {};
    return { categoryId: id, categoryName: c.name || 'Uncategorised', color: c.color || '#94a3b8', spent: round2_(spent[id]) };
  }).sort(function (a, b) { return b.spent - a.spent; });
  const totalBudget = round2_(items.reduce(function (s, i) { return s + i.amount; }, 0));
  const totalSpent = round2_(items.reduce(function (s, i) { return s + i.spent; }, 0));
  return {
    month: month, currency: convert.base, items: items, unbudgeted: unbudgeted,
    totalBudget: totalBudget, totalSpent: totalSpent, totalRemaining: round2_(totalBudget - totalSpent),
    missingRates: convert.missing()
  };
}

function handleGetBudgets_(ctx, payload) {
  vPayload_(payload, ['month']);
  const month = vMonth_(payload.month, 'Month') || todayStr_().slice(0, 7);
  return budgetReport_(ctx, month);
}

/** Creates or updates the budget for a category and month. */
function handleSetBudget_(ctx, payload) {
  vPayload_(payload, ['categoryId', 'month', 'amount']);
  const cat = requireCategory_(ctx.userId, payload.categoryId, 'expense');
  const month = vMonth_(payload.month, 'Month', { required: true });
  const amount = vAmount_(payload.amount, 'Budget amount');
  const existing = listForUser_('Budgets', ctx.userId).find(function (b) { return b.categoryId === cat.id && b.month === month; });
  if (existing) {
    updateForUser_('Budgets', ctx.userId, existing.id, { amount: amount });
  } else {
    const now = nowIso_();
    insertRecord_('Budgets', { id: newId_('Budgets'), userId: ctx.userId, categoryId: cat.id, month: month, amount: amount, createdAt: now, updatedAt: now });
  }
  return budgetReport_(ctx, month);
}

function handleDeleteBudget_(ctx, payload) {
  vPayload_(payload, ['id']);
  const b = getForUser_('Budgets', ctx.userId, vId_(payload.id, 'Budget', 'Budgets'));
  deleteForUser_('Budgets', ctx.userId, b.id);
  return budgetReport_(ctx, b.month);
}

/** Copies budgets from one month to another, skipping categories that already have a budget. */
function handleCopyBudgets_(ctx, payload) {
  vPayload_(payload, ['fromMonth', 'toMonth']);
  const fromMonth = vMonth_(payload.fromMonth, 'From month', { required: true });
  const toMonth = vMonth_(payload.toMonth, 'To month', { required: true });
  if (fromMonth === toMonth) throw apiError_('VALIDATION', 'Choose two different months.');
  const all = listForUser_('Budgets', ctx.userId);
  const existing = {};
  all.forEach(function (b) { if (b.month === toMonth) existing[b.categoryId] = true; });
  const now = nowIso_();
  const copies = all.filter(function (b) { return b.month === fromMonth && !existing[b.categoryId]; }).map(function (b) {
    return { id: newId_('Budgets'), userId: ctx.userId, categoryId: b.categoryId, month: toMonth, amount: b.amount, createdAt: now, updatedAt: now };
  });
  insertRecords_('Budgets', copies);
  return budgetReport_(ctx, toMonth);
}
