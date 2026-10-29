/**
 * Categories. Transactions reference categories by ID, so renaming or
 * recolouring a category never rewrites history. Categories are archived,
 * not deleted, so historical transactions keep their category.
 */

function handleGetCategories_(ctx) {
  const counts = {};
  listForUser_('Transactions', ctx.userId).forEach(function (t) {
    if (t.categoryId) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
  });
  return listForUser_('Categories', ctx.userId)
    .map(function (c) {
      const out = toPublic_(c);
      out.transactionCount = counts[c.id] || 0;
      return out;
    })
    .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name); });
}

function assertUniqueCategoryName_(userId, name, kind, exceptId) {
  const clash = listForUser_('Categories', userId).some(function (c) {
    return c.id !== exceptId && c.kind === kind && c.name.toLowerCase() === name.toLowerCase();
  });
  if (clash) throw apiError_('CONFLICT', 'A ' + kind + ' category named "' + name + '" already exists.');
}

function vIcon_(v) {
  const s = vString_(v, 'Icon', { max: 40 });
  if (s && !/^[a-z0-9-]+$/.test(s)) throw apiError_('VALIDATION', 'Icon must be a lowercase icon name.');
  return s || 'circle';
}

function handleAddCategory_(ctx, payload) {
  vPayload_(payload, ['name', 'kind', 'color', 'icon', 'essential']);
  const name = vString_(payload.name, 'Name', { required: true, max: 60 });
  const kind = vEnum_(payload.kind, 'Kind', ENUMS.categoryKind, { defaultValue: 'expense' });
  assertUniqueCategoryName_(ctx.userId, name, kind, '');
  const existing = listForUser_('Categories', ctx.userId);
  const now = nowIso_();
  const rec = {
    id: newId_('Categories'), userId: ctx.userId, name: name, kind: kind,
    color: vColor_(payload.color, 'Colour'), icon: vIcon_(payload.icon),
    essential: kind === 'expense' ? vBool_(payload.essential, 'Essential') : false,
    archived: false,
    sortOrder: existing.reduce(function (m, c) { return Math.max(m, c.sortOrder || 0); }, 0) + 1,
    createdAt: now, updatedAt: now
  };
  insertRecord_('Categories', rec);
  return toPublic_(rec);
}

function handleUpdateCategory_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'color', 'icon', 'essential', 'archived', 'sortOrder']);
  const cat = getForUser_('Categories', ctx.userId, vId_(payload.id, 'Category', 'Categories'));
  const changes = {};
  if (payload.name !== undefined) {
    changes.name = vString_(payload.name, 'Name', { required: true, max: 60 });
    assertUniqueCategoryName_(ctx.userId, changes.name, cat.kind, cat.id);
  }
  if (payload.color !== undefined) changes.color = vColor_(payload.color, 'Colour');
  if (payload.icon !== undefined) changes.icon = vIcon_(payload.icon);
  if (payload.essential !== undefined) changes.essential = cat.kind === 'expense' ? vBool_(payload.essential, 'Essential') : false;
  if (payload.archived !== undefined) changes.archived = vBool_(payload.archived, 'Archived');
  if (payload.sortOrder !== undefined) changes.sortOrder = vInt_(payload.sortOrder, 'Sort order', { min: 0, max: 100000 });
  return toPublic_(updateForUser_('Categories', ctx.userId, cat.id, changes));
}
