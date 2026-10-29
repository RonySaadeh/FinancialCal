import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { useAction } from '../lib/queries';
import type { Category } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import { Badge, Button, Card, CardHeader, Checkbox, Field, FormError, IconButton, Input, Modal, PageHeader, Segmented, TextField } from '../components/ui';

const SWATCHES = ['#6366f1', '#22c55e', '#f97316', '#0ea5e9', '#eab308', '#14b8a6', '#ec4899', '#ef4444', '#8b5cf6', '#f43f5e', '#a855f7', '#06b6d4', '#64748b', '#0891b2', '#94a3b8', '#10b981', '#3b82f6', '#f59e0b', '#84cc16'];

export default function CategoriesPage() {
  const f = useFinance();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<Category | null | 'new'>(null);
  const update = useAction('updateCategory');
  const list = f.categories.filter((c) => c.kind === kind);
  const active = list.filter((c) => !c.archived);
  const archived = list.filter((c) => c.archived);

  /** Swaps the sort positions of two neighbouring categories. */
  const move = async (c: Category, dir: -1 | 1) => {
    const other = active[active.indexOf(c) + dir];
    if (!other) return;
    const [mine, theirs] = c.sortOrder === other.sortOrder
      ? (dir === -1 ? [other.sortOrder, other.sortOrder + 1] : [other.sortOrder + 1, other.sortOrder])
      : [other.sortOrder, c.sortOrder];
    try {
      await update.mutateAsync({ id: c.id, sortOrder: mine });
      await update.mutateAsync({ id: other.id, sortOrder: theirs });
    } catch {
      /* error shown via update.error */
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        subtitle="Rename, recolour or archive categories — past transactions keep their category"
        actions={
          <>
            <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add category</Button>
          </>
        }
      />
      <FormError error={update.error} />
      <Card>
        <CardHeader title={`Active ${kind} categories`} subtitle={kind === 'expense' ? 'Essential categories count as essential spending in analytics' : undefined} />
        <ul className="divide-y divide-line p-2">
          {active.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
              {c.essential && <Badge>Essential</Badge>}
              <span className="hidden text-xs text-ink-3 sm:inline">{c.transactionCount} transaction{c.transactionCount === 1 ? '' : 's'}</span>
              <IconButton label={`Move ${c.name} up`} disabled={i === 0 || update.isPending} onClick={() => move(c, -1)}><ArrowUp className="size-4" /></IconButton>
              <IconButton label={`Move ${c.name} down`} disabled={i === active.length - 1 || update.isPending} onClick={() => move(c, 1)}><ArrowDown className="size-4" /></IconButton>
              <IconButton label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil className="size-4" /></IconButton>
              <IconButton label={`Archive ${c.name}`} disabled={update.isPending} onClick={() => update.mutate({ id: c.id, archived: true })}><Archive className="size-4" /></IconButton>
            </li>
          ))}
          {!active.length && <li className="px-3 py-6 text-center text-sm text-ink-3">No active categories.</li>}
        </ul>
      </Card>
      {archived.length > 0 && (
        <Card>
          <CardHeader title="Archived" subtitle="Hidden from new transactions; history is preserved" />
          <ul className="divide-y divide-line p-2">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 opacity-70">
                <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-ink-3">{c.transactionCount} transactions</span>
                <IconButton label={`Restore ${c.name}`} onClick={() => update.mutate({ id: c.id, archived: false })}><ArchiveRestore className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add category' : 'Edit category'}>
        {editing !== null && <CategoryForm category={editing === 'new' ? null : editing} kind={kind} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function CategoryForm({ category, kind, onDone }: { category: Category | null; kind: 'expense' | 'income'; onDone: () => void }) {
  const add = useAction('addCategory');
  const update = useAction('updateCategory');
  const m = category ? update : add;
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? SWATCHES[0]);
  const [essential, setEssential] = useState(category?.essential ?? false);
  const k = category?.kind ?? kind;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate(category ? { id: category.id, name, color, essential } : { name, color, essential, kind: k }, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField label="Name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Colour">
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((s) => (
            <button key={s} type="button" aria-label={`Colour ${s}`} aria-pressed={color === s} onClick={() => setColor(s)}
              className={`size-7 rounded-full ring-offset-2 ring-offset-surface ${color === s ? 'ring-2 ring-brand' : ''}`} style={{ background: s }} />
          ))}
          <Input type="color" aria-label="Custom colour" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 p-1" />
        </div>
      </Field>
      {k === 'expense' && <Checkbox label="Essential spending" hint="e.g. housing, groceries, utilities. Used for the essential vs discretionary split." checked={essential} onChange={setEssential} />}
      <FormError error={m.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>{category ? 'Save' : 'Add category'}</Button>
      </div>
    </form>
  );
}
