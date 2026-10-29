/**
 * Income, expense and transfer transactions, plus recurring series.
 *
 * A recurring series is a "template" transaction with `recurrence` set and
 * `recurringId` equal to its own ID. Each recorded occurrence is an ordinary
 * transaction whose `recurringId` points at the template.
 *
 * Transactions with a `linkType` (debt payments, investment trades) are
 * owned by that feature and can only be changed through it.
 */

const TXN_FIELDS = ['type', 'amount', 'categoryId', 'accountId', 'toAccountId', 'toAmount', 'date', 'description', 'notes', 'recurrence'];

function handleGetTransactions_(ctx, payload) {
  vPayload_(payload, ['from', 'to']);
  const from = vDate_(payload.from, 'From');
  const to = vDate_(payload.to, 'To');
  return listForUser_('Transactions', ctx.userId)
    .filter(function (t) { return (!from || t.date >= from) && (!to || t.date <= to); })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1); })
    .map(toPublic_);
}

function requireCategory_(userId, id, kind) {
  const categoryId = vId_(id, 'Category', 'Categories');
  const cat = findForUser_('Categories', userId, categoryId);
  if (!cat) throw apiError_('VALIDATION', 'Category does not exist.');
  if (cat.kind !== kind) throw apiError_('VALIDATION', 'Category "' + cat.name + '" is not an ' + kind + ' category.');
  return cat;
}

/** Validates a user-entered transaction and returns the normalised fields. */
function normalizeTransaction_(ctx, payload, existing) {
  const src = {};
  TXN_FIELDS.forEach(function (f) { src[f] = payload[f] !== undefined ? payload[f] : (existing ? existing[f] : undefined); });

  const type = vEnum_(src.type, 'Type', ENUMS.transactionType);
  const amount = vAmount_(src.amount, 'Amount');
  const date = vDate_(src.date, 'Date', { required: true });
  const description = vString_(src.description, 'Description', { max: 200 });
  const notes = vString_(src.notes, 'Notes', { max: 1000 });
  const recurrence = vEnum_(src.recurrence || '', 'Recurrence', ENUMS.recurrence);
  const isNewOrChangedAccount = function (field) { return !existing || (payload[field] !== undefined && payload[field] !== existing[field]); };

  const account = requireAccount_(ctx.userId, src.accountId, 'Account', { open: isNewOrChangedAccount('accountId') });
  const out = {
    type: type, amount: amount, date: date, description: description, notes: notes, recurrence: recurrence,
    accountId: account.id, currency: account.currency, categoryId: '', toAccountId: '', toAmount: ''
  };

  if (type === 'transfer') {
    const toAccount = requireAccount_(ctx.userId, src.toAccountId, 'Destination account', { open: isNewOrChangedAccount('toAccountId') });
    if (toAccount.id === account.id) throw apiError_('VALIDATION', 'Source and destination accounts must be different.');
    out.toAccountId = toAccount.id;
    if (toAccount.currency !== account.currency) {
      out.toAmount = vAmount_(src.toAmount, 'Amount received (' + toAccount.currency + ')');
    }
  } else {
    out.categoryId = requireCategory_(ctx.userId, src.categoryId, type).id;
  }
  return out;
}

function handleAddTransaction_(ctx, payload) {
  vPayload_(payload, TXN_FIELDS);
  const fields = normalizeTransaction_(ctx, payload, null);
  const now = nowIso_();
  const id = newId_('Transactions');
  const rec = Object.assign({ id: id, userId: ctx.userId, linkType: '', linkId: '', createdAt: now, updatedAt: now }, fields);
  rec.recurringId = fields.recurrence ? id : '';
  insertRecord_('Transactions', rec);
  return toPublic_(rec);
}

function requireEditableTransaction_(userId, id) {
  const txnId = vId_(id, 'Transaction', 'Transactions');
  const txn = getForUser_('Transactions', userId, txnId);
  if (txn.linkType === 'debt_payment') throw apiError_('CONFLICT', 'This transaction belongs to a debt payment. Edit it from the Debts page.');
  if (txn.linkType === 'investment') throw apiError_('CONFLICT', 'This transaction belongs to an investment trade. Edit it from the Investments page.');
  return txn;
}

function handleUpdateTransaction_(ctx, payload) {
  vPayload_(payload, ['id'].concat(TXN_FIELDS));
  const txn = requireEditableTransaction_(ctx.userId, payload.id);
  const fields = normalizeTransaction_(ctx, payload, txn);
  if (fields.recurrence && txn.recurringId && txn.recurringId !== txn.id) {
    throw apiError_('VALIDATION', 'This is an occurrence of a recurring series. Change the recurrence on the original transaction.');
  }
  fields.recurringId = fields.recurrence ? txn.id : (txn.recurringId === txn.id ? '' : txn.recurringId);
  return toPublic_(updateForUser_('Transactions', ctx.userId, txn.id, fields));
}

function handleDeleteTransaction_(ctx, payload) {
  vPayload_(payload, ['id']);
  const txn = requireEditableTransaction_(ctx.userId, payload.id);
  deleteForUser_('Transactions', ctx.userId, txn.id);
  return { deleted: txn.id };
}

/** Records the next occurrence of a recurring series (optionally with a different date/amount). */
function handleRecordRecurring_(ctx, payload) {
  vPayload_(payload, ['id', 'date', 'amount']);
  const template = getForUser_('Transactions', ctx.userId, vId_(payload.id, 'Transaction', 'Transactions'));
  if (!template.recurrence || template.recurringId !== template.id) {
    throw apiError_('VALIDATION', 'This transaction is not an active recurring series.');
  }
  const occurrences = listForUser_('Transactions', ctx.userId).filter(function (t) {
    return t.recurringId === template.id && t.id !== template.id;
  });
  const date = vDate_(payload.date, 'Date') || recurringNextDue_(template, occurrences);
  const fields = normalizeTransaction_(ctx, {
    type: template.type, amount: payload.amount !== undefined ? payload.amount : template.amount,
    categoryId: template.categoryId, accountId: template.accountId, toAccountId: template.toAccountId,
    toAmount: template.toAmount, date: date, description: template.description, notes: template.notes, recurrence: ''
  }, null);
  const now = nowIso_();
  const rec = Object.assign({ id: newId_('Transactions'), userId: ctx.userId, linkType: '', linkId: '', createdAt: now, updatedAt: now }, fields);
  rec.recurringId = template.id;
  insertRecord_('Transactions', rec);
  return toPublic_(rec);
}

/** Creates a transaction owned by another feature (debt payment or investment trade). Callers hold the lock. */
function insertLinkedTransaction_(userId, fields) {
  const now = nowIso_();
  const rec = {
    id: newId_('Transactions'), userId: userId, type: fields.type, amount: round2_(fields.amount), currency: fields.currency,
    categoryId: fields.categoryId || '', accountId: fields.accountId || '', toAccountId: fields.toAccountId || '',
    toAmount: '', date: fields.date, description: fields.description || '', notes: '', recurrence: '', recurringId: '',
    linkType: fields.linkType, linkId: fields.linkId, createdAt: now, updatedAt: now
  };
  return insertRecord_('Transactions', rec);
}

function deleteLinkedTransactions_(userId, linkType, linkIds) {
  const set = {};
  linkIds.forEach(function (id) { set[id] = true; });
  return deleteWhere_('Transactions', function (t) { return t.userId === userId && t.linkType === linkType && set[t.linkId]; });
}
