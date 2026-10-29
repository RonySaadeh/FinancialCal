/**
 * Debts and repayments.
 *
 * Outstanding balance = opening balance - sum of principal repaid. Each
 * repayment is a distinct DebtPayments row; the liability is reduced only by
 * that row, never by the linked cash transactions as well.
 *
 * When a repayment is paid from an account, two linked transactions are
 * created so the account balance stays correct:
 *  - principal: a transfer out of the account (not an expense)
 *  - interest:  an expense in the chosen category
 *
 * Credit-card balances tracked as credit_card accounts are reported here
 * read-only (from the account balance) and are not stored as debts, so they
 * are never counted twice.
 */

function debtDetail_(debt, payments, today) {
  const own = payments.filter(function (p) { return p.debtId === debt.id; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  const outstanding = debtOutstanding_(debt, payments);
  const paidPrincipal = round2_(own.reduce(function (s, p) { return s + (Number(p.principal) || 0); }, 0));
  const paidInterest = round2_(own.reduce(function (s, p) { return s + (Number(p.interest) || 0); }, 0));
  const base = Number(debt.originalPrincipal) || Number(debt.openingBalance) || 0;
  const out = toPublic_(debt);
  out.outstanding = outstanding;
  out.paidPrincipal = paidPrincipal;
  out.paidInterest = paidInterest;
  out.progress = base > 0 ? Math.min(1, Math.max(0, (base - outstanding) / base)) : 0;
  out.nextDueDate = outstanding > 0 && !debt.archived ? nextDueDate_(debt.dueDay, today) : '';
  out.monthlyInterestEstimate = round2_(outstanding * (Number(debt.interestRate) || 0) / 100 / 12);
  out.payments = own.map(toPublic_);
  return out;
}

function handleGetDebts_(ctx) {
  const today = todayStr_();
  const convert = userConverter_(ctx);
  const debts = listForUser_('Debts', ctx.userId);
  const payments = listForUser_('DebtPayments', ctx.userId);
  const items = debts.map(function (d) { return debtDetail_(d, payments, today); })
    .sort(function (a, b) { return a.archived - b.archived || b.outstanding - a.outstanding; });

  const creditCards = accountsWithBalances_(ctx.userId)
    .filter(function (a) { return a.type === 'credit_card' && !a.archived; })
    .map(function (a) { return { id: a.id, name: a.name, currency: a.currency, owed: round2_(Math.max(0, -a.balance)), balance: a.balance }; });

  const endMonth = today.slice(0, 7);
  const history = monthRange_(endMonth, 12).map(function (m) {
    const asOf = m === endMonth ? today : lastDayOfMonth_(m);
    return { month: m, outstanding: sumConverted_(debts, convert, function (d) { return debtOutstanding_(d, payments, asOf); }, function (d) { return d.currency; }) };
  });

  const upcoming = items.filter(function (d) { return d.nextDueDate; })
    .map(function (d) { return { debtId: d.id, name: d.name, dueDate: d.nextDueDate, minimumPayment: d.minimumPayment, currency: d.currency }; })
    .sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });

  return {
    currency: convert.base,
    debts: items,
    creditCards: creditCards,
    totalOutstanding: sumConverted_(items, convert, function (d) { return d.outstanding; }, function (d) { return d.currency; }),
    totalCreditCardOwed: sumConverted_(creditCards, convert, function (c) { return c.owed; }, function (c) { return c.currency; }),
    upcoming: upcoming,
    history: history,
    missingRates: convert.missing()
  };
}

function debtFields_(ctx, payload, existing) {
  const out = {};
  const has = function (k) { return !existing || payload[k] !== undefined; };
  if (has('name')) out.name = vString_(payload.name, 'Name', { required: true, max: 80 });
  if (has('type')) out.type = vEnum_(payload.type, 'Type', ENUMS.debtType);
  if (has('lender')) out.lender = vString_(payload.lender, 'Lender', { max: 80 });
  if (has('originalPrincipal')) out.originalPrincipal = vAmount_(payload.originalPrincipal, 'Original principal');
  if (has('openingBalance')) {
    const fallback = out.originalPrincipal !== undefined ? out.originalPrincipal : existing && existing.openingBalance;
    out.openingBalance = vNumber_(payload.openingBalance, 'Current balance', { defaultValue: fallback });
    if (out.openingBalance === null || out.openingBalance === undefined) throw apiError_('VALIDATION', 'Current balance is required.');
  }
  if (has('interestRate')) out.interestRate = vNumber_(payload.interestRate, 'Interest rate', { max: 100, decimals: 4, defaultValue: 0 });
  if (has('minimumPayment')) out.minimumPayment = vNumber_(payload.minimumPayment, 'Minimum payment', { defaultValue: 0 });
  if (has('dueDay')) out.dueDay = vInt_(payload.dueDay, 'Due day', { min: 1, max: 31 }) || '';
  if (has('startDate')) out.startDate = vDate_(payload.startDate, 'Start date') || todayStr_();
  if (has('notes')) out.notes = vString_(payload.notes, 'Notes', { max: 500 });
  if (payload.archived !== undefined) out.archived = vBool_(payload.archived, 'Archived');
  if (payload.currency !== undefined || !existing) {
    const currency = vCurrency_(payload.currency, 'Currency', { defaultValue: ctx.user.preferredCurrency || DEFAULT_CURRENCY });
    if (existing && currency !== existing.currency && listForUser_('DebtPayments', ctx.userId).some(function (p) { return p.debtId === existing.id; })) {
      throw apiError_('CONFLICT', 'The currency of a debt with payments cannot be changed.');
    }
    out.currency = currency;
  }
  return out;
}

function handleAddDebt_(ctx, payload) {
  vPayload_(payload, ['name', 'type', 'lender', 'currency', 'originalPrincipal', 'openingBalance', 'interestRate', 'minimumPayment', 'dueDay', 'startDate', 'notes']);
  const now = nowIso_();
  const rec = Object.assign({ id: newId_('Debts'), userId: ctx.userId, archived: false, createdAt: now, updatedAt: now }, debtFields_(ctx, payload, null));
  insertRecord_('Debts', rec);
  return toPublic_(rec);
}

function handleUpdateDebt_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'type', 'lender', 'currency', 'originalPrincipal', 'openingBalance', 'interestRate', 'minimumPayment', 'dueDay', 'startDate', 'notes', 'archived']);
  const debt = getForUser_('Debts', ctx.userId, vId_(payload.id, 'Debt', 'Debts'));
  return toPublic_(updateForUser_('Debts', ctx.userId, debt.id, debtFields_(ctx, payload, debt)));
}

function handleDeleteDebt_(ctx, payload) {
  vPayload_(payload, ['id']);
  const debt = getForUser_('Debts', ctx.userId, vId_(payload.id, 'Debt', 'Debts'));
  const paymentIds = listForUser_('DebtPayments', ctx.userId).filter(function (p) { return p.debtId === debt.id; }).map(function (p) { return p.id; });
  deleteLinkedTransactions_(ctx.userId, 'debt_payment', paymentIds);
  deleteWhere_('DebtPayments', function (p) { return p.userId === ctx.userId && p.debtId === debt.id; });
  deleteForUser_('Debts', ctx.userId, debt.id);
  return { deleted: debt.id };
}

function defaultExpenseCategory_(userId) {
  const cats = listForUser_('Categories', userId).filter(function (c) { return c.kind === 'expense' && !c.archived; });
  return cats.find(function (c) { return c.name === 'Other'; }) || cats[0] || null;
}

function handleAddDebtPayment_(ctx, payload) {
  vPayload_(payload, ['debtId', 'date', 'amount', 'interest', 'accountId', 'interestCategoryId', 'note']);
  const debt = getForUser_('Debts', ctx.userId, vId_(payload.debtId, 'Debt', 'Debts'));
  const amount = vAmount_(payload.amount, 'Payment amount');
  const interest = vNumber_(payload.interest, 'Interest portion', { defaultValue: 0 });
  if (interest > amount) throw apiError_('VALIDATION', 'Interest portion cannot exceed the payment amount.');
  const principal = round2_(amount - interest);
  const outstanding = debtOutstanding_(debt, listForUser_('DebtPayments', ctx.userId));
  if (principal > outstanding + 0.005) {
    throw apiError_('VALIDATION', 'Principal (' + principal + ') exceeds the outstanding balance (' + outstanding + ').');
  }
  const date = vDate_(payload.date, 'Date') || todayStr_();
  const account = requireAccount_(ctx.userId, payload.accountId, 'Paid from account', { required: false, open: true });
  let interestCategory = null;
  if (account) {
    if (account.currency !== debt.currency) throw apiError_('VALIDATION', 'The paying account must be in ' + debt.currency + '.');
    if (interest > 0) {
      interestCategory = payload.interestCategoryId ? requireCategory_(ctx.userId, payload.interestCategoryId, 'expense') : defaultExpenseCategory_(ctx.userId);
      if (!interestCategory) throw apiError_('VALIDATION', 'Choose an expense category for the interest.');
    }
  }
  const rec = {
    id: newId_('DebtPayments'), userId: ctx.userId, debtId: debt.id, date: date, amount: amount,
    principal: principal, interest: interest, accountId: account ? account.id : '',
    interestCategoryId: interestCategory ? interestCategory.id : '', note: vString_(payload.note, 'Note', { max: 200 }), createdAt: nowIso_()
  };
  insertRecord_('DebtPayments', rec);
  if (account) {
    if (principal > 0) {
      insertLinkedTransaction_(ctx.userId, {
        type: 'transfer', amount: principal, currency: account.currency, accountId: account.id, date: date,
        description: 'Repayment: ' + debt.name, linkType: 'debt_payment', linkId: rec.id
      });
    }
    if (interest > 0) {
      insertLinkedTransaction_(ctx.userId, {
        type: 'expense', amount: interest, currency: account.currency, accountId: account.id, categoryId: interestCategory.id,
        date: date, description: 'Interest: ' + debt.name, linkType: 'debt_payment', linkId: rec.id
      });
    }
  }
  return toPublic_(rec);
}

function handleDeleteDebtPayment_(ctx, payload) {
  vPayload_(payload, ['id']);
  const p = getForUser_('DebtPayments', ctx.userId, vId_(payload.id, 'Payment', 'DebtPayments'));
  deleteLinkedTransactions_(ctx.userId, 'debt_payment', [p.id]);
  deleteForUser_('DebtPayments', ctx.userId, p.id);
  return { deleted: p.id };
}
