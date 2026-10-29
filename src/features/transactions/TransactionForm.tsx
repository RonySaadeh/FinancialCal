import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Modal, Segmented, Select, SelectField, Textarea, TextField } from '../../components/ui';
import { RECURRENCE_LABELS, ACCOUNT_TYPE_LABELS } from '../../lib/format';
import type { Transaction, TransactionType } from '../../lib/types';
import { useFinance } from '../FinanceContext';
import { useSaveTransaction } from './useTransactionMutations';

export interface TransactionDraft {
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
}

/** Add or edit an income, expense or transfer. */
export function TransactionForm({ open, onClose, transaction, draft }: {
  open: boolean;
  onClose: () => void;
  transaction?: Transaction | null;
  draft?: TransactionDraft;
}) {
  return (
    <Modal open={open} onClose={onClose} title={transaction ? 'Edit transaction' : 'Add transaction'}>
      {open && <TransactionFormBody onDone={onClose} transaction={transaction ?? null} draft={draft} />}
    </Modal>
  );
}

function TransactionFormBody({ onDone, transaction, draft }: { onDone: () => void; transaction: Transaction | null; draft?: TransactionDraft }) {
  const f = useFinance();
  const save = useSaveTransaction();
  const [formError, setFormError] = useState<string | null>(null);

  const firstAccount = f.openAccounts[0]?.id ?? '';
  const [type, setType] = useState<TransactionType>(transaction?.type ?? draft?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [date, setDate] = useState(transaction?.date ?? f.today);
  const [accountId, setAccountId] = useState(transaction?.accountId ?? draft?.accountId ?? firstAccount);
  const [toAccountId, setToAccountId] = useState(transaction?.toAccountId ?? f.openAccounts.find((a) => a.id !== firstAccount)?.id ?? '');
  const [toAmount, setToAmount] = useState(transaction?.toAmount ? String(transaction.toAmount) : '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? draft?.categoryId ?? '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [recurrence, setRecurrence] = useState(transaction?.recurrence ?? '');

  const isOccurrence = !!transaction && !!transaction.recurringId && transaction.recurringId !== transaction.id;
  const cats = (type === 'income' ? f.incomeCategories : f.expenseCategories).slice();
  // Keep an archived category selectable when editing a transaction that already uses it.
  const current = categoryId ? f.categoryById.get(categoryId) : undefined;
  if (current && current.archived && !cats.includes(current)) cats.push(current);
  const effectiveCategory = cats.some((c) => c.id === categoryId) ? categoryId : cats[0]?.id ?? '';

  const accountOptions = f.accounts.filter((a) => !a.archived || a.id === accountId || a.id === toAccountId);
  const from = f.accountById.get(accountId);
  const to = f.accountById.get(toAccountId);
  const crossCurrency = type === 'transfer' && from && to && from.currency !== to.currency;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      type, amount: Number(amount), date, accountId, description, notes, recurrence: isOccurrence ? '' : recurrence
    };
    if (type === 'transfer') {
      payload.toAccountId = toAccountId;
      payload.toAmount = crossCurrency ? Number(toAmount) : '';
      payload.categoryId = '';
    } else {
      payload.categoryId = effectiveCategory;
      payload.toAccountId = '';
    }
    if (!(Number(amount) > 0)) return setFormError('Enter an amount greater than zero.');
    if (crossCurrency && !(Number(toAmount) > 0)) return setFormError('Enter the amount received in the destination account.');
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setFormError('Choose a different destination account.');
    if (transaction) payload.id = transaction.id;

    // Show it immediately; the server confirms (or rolls back) in the background.
    const now = new Date().toISOString();
    const optimistic: Transaction = {
      ...(transaction ?? {
        id: `tmp_${Date.now()}`, linkType: '', linkId: '', recurringId: '', createdAt: now
      }),
      type, amount: Number(amount), date, accountId, description, notes,
      currency: from?.currency ?? f.base,
      categoryId: type === 'transfer' ? '' : effectiveCategory,
      toAccountId: type === 'transfer' ? toAccountId : '',
      toAmount: crossCurrency ? Number(toAmount) : '',
      recurrence: isOccurrence ? '' : (recurrence as Transaction['recurrence']),
      updatedAt: now
    } as Transaction;
    const label = description || (type === 'transfer' ? 'Transfer' : f.categoryById.get(effectiveCategory)?.name ?? 'transaction');
    save.mutate({ payload, optimistic, label });
    onDone();
  };

  if (!f.openAccounts.length && !transaction) {
    return (
      <div className="space-y-3 text-sm text-ink-2">
        <p>Add an account first — every transaction belongs to a cash, bank, savings or credit-card account.</p>
        <a href="#/accounts" onClick={onDone} className="font-medium text-brand">Go to Accounts →</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented
        label="Transaction type"
        value={type}
        onChange={setType}
        options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]}
      />
      {type === 'transfer' && (
        <p className="text-xs text-ink-3">Transfers move money between your accounts (including paying a credit card). They are not counted as income or spending.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={`Amount${from ? ` (${from.currency})` : ''}`} type="number" inputMode="decimal" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField label={type === 'transfer' ? 'From account' : 'Account'} required value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABELS[a.type]} · {a.currency}{a.archived ? ' (archived)' : ''}</option>
          ))}
        </SelectField>
        {type === 'transfer' ? (
          <SelectField label="To account" required value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="" disabled>Choose account</option>
            {accountOptions.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name} · {a.currency}{a.archived ? ' (archived)' : ''}</option>
            ))}
          </SelectField>
        ) : (
          <SelectField label="Category" required value={effectiveCategory} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>
            ))}
          </SelectField>
        )}
        {crossCurrency && (
          <TextField label={`Amount received (${to?.currency})`} type="number" min="0.01" step="0.01" required value={toAmount} onChange={(e) => setToAmount(e.target.value)} hint="Different currencies: enter what arrived in the destination account." />
        )}
      </div>
      <TextField label="Description" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'income' ? 'e.g. October salary' : 'e.g. Carrefour'} />
      <Field label="Notes">
        <Textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      {isOccurrence ? (
        <p className="text-xs text-ink-3">This is an occurrence of a recurring series. Change the schedule on the original transaction.</p>
      ) : (
        <Field label="Repeats" hint="Recurring transactions appear in the Recurring tab with their next due date.">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
            {Object.entries(RECURRENCE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      )}
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit">{transaction ? 'Save changes' : 'Add transaction'}</Button>
      </div>
    </form>
  );
}

