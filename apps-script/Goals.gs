/**
 * Savings goals. A goal is an earmark on money you already hold in your
 * accounts: contributions and withdrawals track how much is set aside, but
 * they do not move cash and are never added to assets or net worth.
 */

function goalSaved_(goal, contributions) {
  return round2_(contributions.reduce(function (s, c) {
    return c.goalId === goal.id ? s + Number(c.amount) : s;
  }, Number(goal.initialAmount) || 0));
}

function handleGetSavingsGoals_(ctx) {
  const today = todayStr_();
  const contributions = listForUser_('GoalContributions', ctx.userId);
  const accounts = accountsWithBalances_(ctx.userId);
  const accById = indexBy_(accounts, 'id');
  return listForUser_('SavingsGoals', ctx.userId).map(function (g) {
    const saved = goalSaved_(g, contributions);
    const remaining = round2_(Math.max(0, g.targetAmount - saved));
    let monthsLeft = null, monthlyNeeded = null;
    if (g.targetDate && g.targetDate > today) {
      const t = parseYmd_(g.targetDate), n = parseYmd_(today);
      monthsLeft = Math.max(1, (t.y - n.y) * 12 + (t.m - n.m));
      monthlyNeeded = round2_(remaining / monthsLeft);
    }
    const acc = g.accountId ? accById[g.accountId] : null;
    const out = toPublic_(g);
    out.saved = saved;
    out.remaining = remaining;
    out.progress = g.targetAmount > 0 ? Math.min(1, saved / g.targetAmount) : 0;
    out.monthsLeft = monthsLeft;
    out.monthlyNeeded = monthlyNeeded;
    out.overdue = !!(g.targetDate && g.targetDate < today && saved < g.targetAmount);
    out.accountName = acc ? acc.name : '';
    out.accountBalance = acc ? acc.balance : null;
    out.contributions = contributions.filter(function (c) { return c.goalId === g.id; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(toPublic_);
    return out;
  }).sort(function (a, b) { return a.archived - b.archived || (a.targetDate || '9999') .localeCompare(b.targetDate || '9999'); });
}

function goalFields_(ctx, payload, existing) {
  const out = {};
  const has = function (k) { return !existing || payload[k] !== undefined; };
  if (has('name')) out.name = vString_(payload.name, 'Name', { required: true, max: 80 });
  if (has('targetAmount')) out.targetAmount = vAmount_(payload.targetAmount, 'Target amount');
  if (has('initialAmount')) out.initialAmount = vNumber_(payload.initialAmount, 'Already saved', { defaultValue: 0 });
  if (has('targetDate')) out.targetDate = vDate_(payload.targetDate, 'Target date');
  if (has('notes')) out.notes = vString_(payload.notes, 'Notes', { max: 500 });
  if (has('accountId')) {
    const acc = requireAccount_(ctx.userId, payload.accountId, 'Linked account', { required: false });
    out.accountId = acc ? acc.id : '';
  }
  if (has('currency')) {
    out.currency = vCurrency_(payload.currency, 'Currency', { defaultValue: ctx.user.preferredCurrency || DEFAULT_CURRENCY });
  }
  if (payload.archived !== undefined) out.archived = vBool_(payload.archived, 'Archived');
  return out;
}

function handleAddSavingsGoal_(ctx, payload) {
  vPayload_(payload, ['name', 'targetAmount', 'initialAmount', 'currency', 'targetDate', 'accountId', 'notes']);
  const now = nowIso_();
  const rec = Object.assign({ id: newId_('SavingsGoals'), userId: ctx.userId, archived: false, createdAt: now, updatedAt: now }, goalFields_(ctx, payload, null));
  insertRecord_('SavingsGoals', rec);
  return toPublic_(rec);
}

function handleUpdateSavingsGoal_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'targetAmount', 'initialAmount', 'currency', 'targetDate', 'accountId', 'notes', 'archived']);
  const goal = getForUser_('SavingsGoals', ctx.userId, vId_(payload.id, 'Goal', 'SavingsGoals'));
  return toPublic_(updateForUser_('SavingsGoals', ctx.userId, goal.id, goalFields_(ctx, payload, goal)));
}

function handleDeleteSavingsGoal_(ctx, payload) {
  vPayload_(payload, ['id']);
  const goal = getForUser_('SavingsGoals', ctx.userId, vId_(payload.id, 'Goal', 'SavingsGoals'));
  deleteWhere_('GoalContributions', function (c) { return c.userId === ctx.userId && c.goalId === goal.id; });
  deleteForUser_('SavingsGoals', ctx.userId, goal.id);
  return { deleted: goal.id };
}

/** Records a contribution (positive) or withdrawal (negative) against a goal. */
function handleAddGoalContribution_(ctx, payload) {
  vPayload_(payload, ['goalId', 'amount', 'kind', 'date', 'note']);
  const goal = getForUser_('SavingsGoals', ctx.userId, vId_(payload.goalId, 'Goal', 'SavingsGoals'));
  const kind = vEnum_(payload.kind, 'Kind', ['contribution', 'withdrawal'], { defaultValue: 'contribution' });
  const amount = vAmount_(payload.amount, 'Amount');
  const signed = kind === 'withdrawal' ? -amount : amount;
  const saved = goalSaved_(goal, listForUser_('GoalContributions', ctx.userId));
  if (saved + signed < -0.005) throw apiError_('VALIDATION', 'Withdrawal is larger than the amount saved for this goal.');
  const rec = {
    id: newId_('GoalContributions'), userId: ctx.userId, goalId: goal.id, amount: signed,
    date: vDate_(payload.date, 'Date') || todayStr_(), note: vString_(payload.note, 'Note', { max: 200 }), createdAt: nowIso_()
  };
  insertRecord_('GoalContributions', rec);
  return toPublic_(rec);
}

function handleDeleteGoalContribution_(ctx, payload) {
  vPayload_(payload, ['id']);
  const c = getForUser_('GoalContributions', ctx.userId, vId_(payload.id, 'Contribution', 'GoalContributions'));
  deleteForUser_('GoalContributions', ctx.userId, c.id);
  return { deleted: c.id };
}
