import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queries';
import type { Transaction } from '../../lib/types';
import { useToast } from '../../components/ui/toast';

/**
 * Optimistic transaction saves: the list updates immediately and the form
 * closes, while Apps Script (1–3 s per request) saves in the background.
 * If the server rejects the change, the list is restored and a message shown.
 */

const KEY = ['transaction-write'];
export const isPendingTransaction = (t: Transaction) => t.id.startsWith('tmp_');

interface SaveVars {
  payload: Record<string, unknown>;
  /** What the row should look like until the server answers. */
  optimistic: Transaction;
  label: string;
}

function useRefreshAfter() {
  const qc = useQueryClient();
  return () => {
    // Only refresh once the last queued save has finished, so a refetch never hides other pending rows.
    if (qc.isMutating({ mutationKey: KEY }) <= 1) void qc.invalidateQueries({ queryKey: ['data'] });
  };
}

export function useSaveTransaction() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = useRefreshAfter();
  return useMutation({
    mutationKey: KEY,
    mutationFn: ({ payload }: SaveVars) => api<Transaction>(payload.id ? 'updateTransaction' : 'addTransaction', payload),
    onMutate: async ({ optimistic }) => {
      await qc.cancelQueries({ queryKey: qk.transactions });
      const prev = qc.getQueryData<Transaction[]>(qk.transactions);
      if (prev) {
        const exists = prev.some((t) => t.id === optimistic.id);
        qc.setQueryData<Transaction[]>(qk.transactions, exists ? prev.map((t) => (t.id === optimistic.id ? optimistic : t)) : [optimistic, ...prev]);
      }
      return { prev };
    },
    onSuccess: (saved, { optimistic }) => {
      qc.setQueryData<Transaction[]>(qk.transactions, (list) => list?.map((t) => (t.id === optimistic.id ? saved : t)));
    },
    onError: (err, { label }, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.transactions, ctx.prev);
      toast.error(`Couldn’t save “${label}”: ${errorMessage(err)}`);
    },
    onSettled: refresh
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = useRefreshAfter();
  return useMutation({
    mutationKey: KEY,
    mutationFn: (t: Transaction) => api('deleteTransaction', { id: t.id }),
    onMutate: async (t) => {
      await qc.cancelQueries({ queryKey: qk.transactions });
      const prev = qc.getQueryData<Transaction[]>(qk.transactions);
      if (prev) qc.setQueryData<Transaction[]>(qk.transactions, prev.filter((x) => x.id !== t.id));
      return { prev };
    },
    onError: (err, t, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.transactions, ctx.prev);
      toast.error(`Couldn’t delete “${t.description || 'transaction'}”: ${errorMessage(err)}`);
    },
    onSettled: refresh
  });
}
