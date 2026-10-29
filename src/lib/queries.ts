import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  AdminUsers, Bootstrap, BudgetReport, Category, Dashboard, DebtsResponse, InvestmentsResponse,
  Profile, Reports, SavingsGoal, Transaction, User, Account
} from './types';

/** Query keys. Every mutation invalidates the whole "data" namespace because
 * most writes affect balances, dashboards and reports at once. */
export const qk = {
  bootstrap: ['data', 'bootstrap'] as const,
  dashboard: ['data', 'dashboard'] as const,
  transactions: ['data', 'transactions'] as const,
  accounts: ['data', 'accounts'] as const,
  categories: ['data', 'categories'] as const,
  budgets: (month: string) => ['data', 'budgets', month] as const,
  goals: ['data', 'goals'] as const,
  debts: ['data', 'debts'] as const,
  investments: ['data', 'investments'] as const,
  reports: (months: number) => ['data', 'reports', months] as const,
  profile: ['data', 'profile'] as const,
  adminUsers: ['admin', 'users'] as const
};

const read = <T,>(action: string, payload: Record<string, unknown> = {}) => () => api<T>(action, payload, { read: true });

export const useBootstrap = (enabled = true) => useQuery({ queryKey: qk.bootstrap, queryFn: read<Bootstrap>('getBootstrap'), enabled });
export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: read<Dashboard>('getDashboard') });
export const useTransactions = () => useQuery({ queryKey: qk.transactions, queryFn: read<Transaction[]>('getTransactions') });
export const useAccounts = () => useQuery({ queryKey: qk.accounts, queryFn: read<Account[]>('getAccounts') });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: read<Category[]>('getCategories') });
export const useBudgets = (month: string) => useQuery({ queryKey: qk.budgets(month), queryFn: read<BudgetReport>('getBudgets', { month }) });
export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: read<SavingsGoal[]>('getSavingsGoals') });
export const useDebts = () => useQuery({ queryKey: qk.debts, queryFn: read<DebtsResponse>('getDebts') });
export const useInvestments = () => useQuery({ queryKey: qk.investments, queryFn: read<InvestmentsResponse>('getInvestments') });
export const useReports = (months: number) => useQuery({ queryKey: qk.reports(months), queryFn: read<Reports>('getReports', { months }) });
export const useProfile = () => useQuery({ queryKey: qk.profile, queryFn: read<Profile>('getProfile') });
export const useAdminUsers = (enabled: boolean) => useQuery({ queryKey: qk.adminUsers, queryFn: read<AdminUsers>('adminListUsers'), enabled });

/**
 * Generic write hook: calls an allow-listed action and refreshes cached data.
 * Components pass the action name; the backend validates everything.
 */
export function useAction<TPayload extends Record<string, unknown> = Record<string, unknown>, TResult = unknown>(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TPayload) => api<TResult>(action, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['data'] }),
        action.startsWith('admin') ? qc.invalidateQueries({ queryKey: ['admin'] }) : Promise.resolve()
      ]);
    }
  });
}

export type { User };
