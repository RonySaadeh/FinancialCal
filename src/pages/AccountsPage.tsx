import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, Banknote, CreditCard, Landmark, Pencil, PiggyBank, Plus, Trash, Wallet } from 'lucide-react';
import { useAction } from '../lib/queries';
import { ACCOUNT_TYPE_LABELS, COMMON_CURRENCIES, formatDate, formatMoney } from '../lib/format';
import { totalsByCurrency } from '../lib/currency';
import type { Account, AccountType } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, FormError, IconButton, Modal, PageHeader, SelectField, Signed, TextField
} from '../components/ui';

const TYPE_ICONS: Record<AccountType, typeof Wallet> = { cash: Banknote, bank: Landmark, savings: PiggyBank, credit_card: CreditCard };

export default function AccountsPage() {
  const f = useFinance();
  const [editing, setEditing] = useState<Account | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const update = useAction('updateAccount');
  const del = useAction('deleteAccount');

  const visible = f.accounts.filter((a) => showArchived || !a.archived);
  const open = f.accounts.filter((a) => !a.archived);
  const totals = totalsByCurrency(open, (a) => a.balance, (a) => a.currency);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        subtitle="Balances are calculated from each account’s opening balance plus its transactions"
        actions={
          <>
            {f.accounts.some((a) => a.archived) && <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Hide archived' : 'Show archived'}</Button>}
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add account</Button>
          </>
        }
      />
      {Object.keys(totals).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(totals).map(([cur, total]) => (
            <Card key={cur} className="px-5 py-4">
              <p className="text-xs text-ink-3">Net across {cur} accounts</p>
              <p className="mt-1 text-lg font-semibold"><Signed value={total}>{formatMoney(total, cur)}</Signed></p>
            </Card>
          ))}
        </div>
      )}
      {!visible.length ? (
        <Card>
          <EmptyState
            icon={<Wallet className="size-6" />}
            title="No accounts yet"
            description="Add the cash, bank, savings and credit-card accounts you use. Credit cards start at 0 (or a negative balance if you already owe money)."
            action={<Button onClick={() => setEditing('new')}>Add account</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => {
            const Icon = TYPE_ICONS[a.type];
            return (
              <Card key={a.id} className={`p-5 ${a.archived ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{a.name}</p>
                    <p className="text-xs text-ink-3">{ACCOUNT_TYPE_LABELS[a.type]}{a.institution ? ` · ${a.institution}` : ''}</p>
                  </div>
                  {a.archived && <Badge>Archived</Badge>}
                </div>
                <p className="mt-5 text-2xl font-semibold tracking-tight"><Signed value={a.balance}>{formatMoney(a.balance, a.currency)}</Signed></p>
                <p className="mt-1 text-xs text-ink-3">
                  {a.type === 'credit_card' ? (a.balance < 0 ? `You owe ${formatMoney(-a.balance, a.currency)}` : 'Nothing owed') : `Opening ${formatMoney(a.openingBalance, a.currency)} on ${formatDate(a.openingDate)}`}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <a href={`#/transactions?account=${a.id}`} className="text-xs font-medium text-brand">{a.transactionCount} transaction{a.transactionCount === 1 ? '' : 's'} →</a>
                  <div className="flex">
                    <IconButton label="Edit account" onClick={() => setEditing(a)}><Pencil className="size-4" /></IconButton>
                    <IconButton label={a.archived ? 'Restore account' : 'Archive account'} disabled={update.isPending} onClick={() => update.mutate({ id: a.id, archived: !a.archived })}>
                      {a.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                    </IconButton>
                    {a.transactionCount === 0 && <IconButton label="Delete account" onClick={() => { del.reset(); setDeleting(a); }}><Trash className="size-4" /></IconButton>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <FormError error={update.error} />
      <AccountForm open={editing !== null} account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete account?"
        message={<>Delete <strong>{deleting?.name}</strong>? Accounts with history can only be archived.</>}
        loading={del.isPending}
        error={del.error}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

function AccountForm({ open, account, onClose }: { open: boolean; account: Account | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={account ? 'Edit account' : 'Add account'}>
      {open && <AccountFormBody account={account} onDone={onClose} />}
    </Modal>
  );
}

function AccountFormBody({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('addAccount');
  const update = useAction('updateAccount');
  const m = account ? update : add;
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [currency, setCurrency] = useState(account?.currency ?? f.base);
  const [openingBalance, setOpeningBalance] = useState(account ? String(account.openingBalance) : '0');
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? f.today);
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const currencyLocked = !!account && account.transactionCount > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name, type, openingBalance: Number(openingBalance), openingDate, institution };
    if (!currencyLocked) payload.currency = currency;
    if (account) payload.id = account.id;
    m.mutate(payload, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField label="Account name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emirates NBD current" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        <SelectField label="Currency" value={currency} disabled={currencyLocked} onChange={(e) => setCurrency(e.target.value)} hint={currencyLocked ? 'Locked: account has transactions' : undefined}>
          {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <TextField
          label="Opening balance"
          type="number"
          step="0.01"
          required
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          hint={type === 'credit_card' ? 'Enter money owed as a negative number, e.g. -1200' : 'Balance on the opening date'}
        />
        <TextField label="Opening date" type="date" required value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
      </div>
      <TextField label="Institution (optional)" maxLength={80} value={institution} onChange={(e) => setInstitution(e.target.value)} />
      <FormError error={m.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>{account ? 'Save' : 'Add account'}</Button>
      </div>
    </form>
  );
}
