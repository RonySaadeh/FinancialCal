/**
 * Accounts: cash, bank, savings and credit-card accounts.
 * Balances are always derived from the opening balance plus transactions,
 * never stored, so they cannot drift.
 */

function loadUserData_(userId) {
  return {
    accounts: listForUser_('Accounts', userId),
    transactions: listForUser_('Transactions', userId),
    categories: listForUser_('Categories', userId),
    budgets: listForUser_('Budgets', userId),
    goals: listForUser_('SavingsGoals', userId),
    goalContributions: listForUser_('GoalContributions', userId),
    debts: listForUser_('Debts', userId),
    debtPayments: listForUser_('DebtPayments', userId),
    investments: listForUser_('Investments', userId),
    investmentTransactions: listForUser_('InvestmentTransactions', userId),
    priceHistory: listForUser_('PriceHistory', userId)
  };
}

function userConverter_(ctx) {
  return makeConverter_(ctx.user.preferredCurrency || DEFAULT_CURRENCY, userExchangeRates_(ctx.userId));
}

function accountsWithBalances_(userId) {
  const accounts = listForUser_('Accounts', userId);
  const txns = listForUser_('Transactions', userId);
  const balances = accountBalances_(accounts, txns);
  const counts = {};
  txns.forEach(function (t) {
    if (t.accountId) counts[t.accountId] = (counts[t.accountId] || 0) + 1;
    if (t.toAccountId) counts[t.toAccountId] = (counts[t.toAccountId] || 0) + 1;
  });
  return accounts.map(function (a) {
    const out = toPublic_(a);
    out.balance = balances[a.id];
    out.transactionCount = counts[a.id] || 0;
    return out;
  }).sort(function (a, b) { return a.archived - b.archived || a.name.localeCompare(b.name); });
}

function handleGetAccounts_(ctx) {
  return accountsWithBalances_(ctx.userId);
}

/** Fetches an account owned by the user; optionally requires it to be open. */
function requireAccount_(userId, id, field, opts) {
  opts = opts || {};
  const accountId = vId_(id, field, 'Accounts', { required: opts.required !== false });
  if (!accountId) return null;
  const acc = findForUser_('Accounts', userId, accountId);
  if (!acc) throw apiError_('VALIDATION', field + ' does not exist.');
  if (opts.open && acc.archived) throw apiError_('VALIDATION', field + ' "' + acc.name + '" is archived.');
  return acc;
}

function handleAddAccount_(ctx, payload) {
  vPayload_(payload, ['name', 'type', 'currency', 'openingBalance', 'openingDate', 'institution']);
  const now = nowIso_();
  const rec = {
    id: newId_('Accounts'),
    userId: ctx.userId,
    name: vString_(payload.name, 'Name', { required: true, max: 80 }),
    type: vEnum_(payload.type, 'Type', ENUMS.accountType),
    currency: vCurrency_(payload.currency, 'Currency', { defaultValue: ctx.user.preferredCurrency || DEFAULT_CURRENCY }),
    openingBalance: vNumber_(payload.openingBalance, 'Opening balance', { min: -1e11, defaultValue: 0 }),
    openingDate: vDate_(payload.openingDate, 'Opening date') || todayStr_(),
    institution: vString_(payload.institution, 'Institution', { max: 80 }),
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  insertRecord_('Accounts', rec);
  return toPublic_(rec);
}

function handleUpdateAccount_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'currency', 'openingBalance', 'openingDate', 'institution', 'archived', 'type']);
  const acc = requireAccount_(ctx.userId, payload.id, 'Account');
  const changes = {};
  if (payload.name !== undefined) changes.name = vString_(payload.name, 'Name', { required: true, max: 80 });
  if (payload.institution !== undefined) changes.institution = vString_(payload.institution, 'Institution', { max: 80 });
  if (payload.openingBalance !== undefined) changes.openingBalance = vNumber_(payload.openingBalance, 'Opening balance', { min: -1e11, required: true });
  if (payload.openingDate !== undefined) changes.openingDate = vDate_(payload.openingDate, 'Opening date', { required: true });
  if (payload.archived !== undefined) changes.archived = vBool_(payload.archived, 'Archived');
  if (payload.type !== undefined) changes.type = vEnum_(payload.type, 'Type', ENUMS.accountType);
  if (payload.currency !== undefined) {
    const currency = vCurrency_(payload.currency, 'Currency', { required: true });
    if (currency !== acc.currency) {
      if (accountIsReferenced_(ctx.userId, acc.id)) {
        throw apiError_('CONFLICT', 'The currency of an account with transactions cannot be changed.');
      }
      changes.currency = currency;
    }
  }
  return toPublic_(updateForUser_('Accounts', ctx.userId, acc.id, changes));
}

function accountIsReferenced_(userId, accountId) {
  return listForUser_('Transactions', userId).some(function (t) { return t.accountId === accountId || t.toAccountId === accountId; }) ||
    listForUser_('DebtPayments', userId).some(function (p) { return p.accountId === accountId; }) ||
    listForUser_('InvestmentTransactions', userId).some(function (t) { return t.cashAccountId === accountId; }) ||
    listForUser_('SavingsGoals', userId).some(function (g) { return g.accountId === accountId; });
}

/** Deleting is only allowed for unused accounts; used accounts must be archived so history stays intact. */
function handleDeleteAccount_(ctx, payload) {
  vPayload_(payload, ['id']);
  const acc = requireAccount_(ctx.userId, payload.id, 'Account');
  if (accountIsReferenced_(ctx.userId, acc.id)) {
    throw apiError_('CONFLICT', 'This account has history. Archive it instead of deleting it.');
  }
  deleteForUser_('Accounts', ctx.userId, acc.id);
  return { deleted: acc.id };
}
