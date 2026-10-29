/** Domain types mirroring the Apps Script API responses. */

export type ISODate = string; // yyyy-MM-dd
export type Month = string; // yyyy-MM

export type AccountType = 'cash' | 'bank' | 'savings' | 'credit_card';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type Recurrence = '' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type DebtType = 'personal_loan' | 'car_loan' | 'home_loan' | 'credit_card' | 'other';
export type AssetType = 'stock' | 'etf' | 'mutual_fund' | 'bond' | 'crypto' | 'gold' | 'real_estate' | 'other';
export type Theme = 'system' | 'light' | 'dark';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: 'active' | 'disabled';
  role: 'admin' | 'member';
  preferredCurrency: string;
  theme: Theme;
  createdAt: string;
  lastLoginAt: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string;
  current: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  openingDate: ISODate;
  institution: string;
  archived: boolean;
  balance: number;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  color: string;
  icon: string;
  essential: boolean;
  archived: boolean;
  sortOrder: number;
  transactionCount: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  toAmount: number | null | '';
  date: ISODate;
  description: string;
  notes: string;
  recurrence: Recurrence;
  recurringId: string;
  linkType: '' | 'debt_payment' | 'investment';
  linkId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bootstrap {
  user: User;
  exchangeRates: Record<string, number>;
  accounts: Account[];
  categories: Category[];
  stalePriceDays: number;
  today: ISODate;
}

export interface Profile {
  user: User;
  exchangeRates: Record<string, number>;
  registrationEnabled?: boolean;
  sessions: SessionInfo[];
}

export interface MonthlyFlow {
  month: Month;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number | null;
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
}

export interface BudgetItem {
  id: string;
  categoryId: string;
  categoryName: string;
  color: string;
  month: Month;
  amount: number;
  spent: number;
  remaining: number;
  percentUsed: number | null;
}

export interface BudgetReport {
  month: Month;
  currency: string;
  items: BudgetItem[];
  unbudgeted: { categoryId: string; categoryName: string; color: string; spent: number }[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  missingRates: string[];
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  date: ISODate;
  note: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  initialAmount: number;
  currency: string;
  targetDate: ISODate;
  accountId: string;
  notes: string;
  archived: boolean;
  saved: number;
  remaining: number;
  progress: number;
  monthsLeft: number | null;
  monthlyNeeded: number | null;
  overdue: boolean;
  accountName: string;
  accountBalance: number | null;
  contributions: GoalContribution[];
}

export interface DebtPayment {
  id: string;
  debtId: string;
  date: ISODate;
  amount: number;
  principal: number;
  interest: number;
  accountId: string;
  interestCategoryId: string;
  note: string;
}

export interface Debt {
  id: string;
  name: string;
  type: DebtType;
  lender: string;
  currency: string;
  originalPrincipal: number;
  openingBalance: number;
  interestRate: number;
  minimumPayment: number;
  dueDay: number | '';
  startDate: ISODate;
  notes: string;
  archived: boolean;
  outstanding: number;
  paidPrincipal: number;
  paidInterest: number;
  progress: number;
  nextDueDate: ISODate;
  monthlyInterestEstimate: number;
  payments: DebtPayment[];
}

export interface UpcomingPayment {
  debtId: string;
  name: string;
  dueDate: ISODate;
  minimumPayment: number;
  currency: string;
}

export interface DebtsResponse {
  currency: string;
  debts: Debt[];
  creditCards: { id: string; name: string; currency: string; owed: number; balance: number }[];
  totalOutstanding: number;
  totalCreditCardOwed: number;
  upcoming: UpcomingPayment[];
  history: { month: Month; outstanding: number }[];
  missingRates: string[];
}

export interface HoldingMetrics {
  quantity: number;
  costBasis: number;
  averageCost: number;
  realizedPL: number;
  totalInvested: number;
  totalProceeds: number;
  feesPaid: number;
  price: number | null;
  priceDate: ISODate;
  priceSource: 'manual' | 'trade' | 'none';
  priceAgeDays: number | null;
  stale: boolean;
  marketValue: number | null;
  unrealizedPL: number | null;
  returnPct: number | null;
  totalReturn: number;
}

export interface InvestmentTrade {
  id: string;
  investmentId: string;
  type: 'buy' | 'sell';
  date: ISODate;
  quantity: number;
  price: number;
  fees: number;
  cashAccountId: string;
  note: string;
}

export interface PricePoint {
  id: string;
  investmentId: string;
  date: ISODate;
  price: number;
}

export interface Holding {
  id: string;
  name: string;
  ticker: string;
  assetType: AssetType;
  currency: string;
  currentPrice: number | null;
  priceUpdatedAt: ISODate;
  notes: string;
  archived: boolean;
  metrics: HoldingMetrics;
  transactions: InvestmentTrade[];
  prices: PricePoint[];
}

export interface InvestmentsResponse {
  currency: string;
  holdings: Holding[];
  totals: { marketValue: number; costBasis: number; unrealizedPL: number; realizedPL: number; returnPct: number | null };
  allocationByType: { assetType: AssetType; value: number }[];
  allocationByHolding: { id: string; name: string; ticker: string; value: number }[];
  history: { month: Month; value: number; costBasis: number }[];
  staleCount: number;
  stalePriceDays: number;
  missingRates: string[];
}

export interface DashboardTransaction extends Transaction {
  categoryName: string;
  categoryColor: string;
  accountName: string;
  toAccountName: string;
}

export interface Dashboard {
  currency: string;
  asOf: ISODate;
  month: Month;
  kpis: {
    cashBalance: number;
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    monthIncome: number;
    monthExpenses: number;
    monthSavings: number;
    savingsRate: number | null;
    portfolioValue: number;
    portfolioCost: number;
    debtOutstanding: number;
  };
  monthly: MonthlyFlow[];
  expensesByCategory: CategoryTotal[];
  allocation: { assetType: AssetType; value: number }[];
  portfolioHistory: { month: Month; value: number; costBasis: number }[];
  recentTransactions: DashboardTransaction[];
  budgets: BudgetItem[];
  upcomingDebtPayments: UpcomingPayment[];
  goals: { id: string; name: string; saved: number; targetAmount: number; currency: string; progress: number; targetDate: ISODate }[];
  stalePrices: { id: string; name: string; priceDate: ISODate }[];
  counts: { accounts: number; transactions: number; investments: number; debts: number; goals: number };
  missingRates: string[];
}

export interface ReportSeriesRow extends MonthlyFlow {
  netWorth?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  cashBalance?: number;
  debtOutstanding?: number;
  portfolioValue?: number;
  portfolioCost?: number;
}

export interface Reports {
  currency: string;
  from: ISODate;
  to: ISODate;
  series: ReportSeriesRow[];
  totals: { income: number; expenses: number; savings: number; savingsRate: number | null };
  spendingByCategory: CategoryTotal[];
  investmentPerformance: {
    id: string; name: string; ticker: string; assetType: AssetType; currency: string; quantity: number;
    costBasis: number; marketValue: number | null; unrealizedPL: number | null; realizedPL: number;
    returnPct: number | null; priceDate: ISODate; stale: boolean;
  }[];
  debtReduction: { principalRepaid: number; interestPaid: number };
  missingRates: string[];
}

export interface AdminUsers {
  registrationEnabled: boolean;
  users: User[];
}
