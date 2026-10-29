/**
 * Financial Cal — configuration and spreadsheet schema.
 *
 * Every sheet is described here once. The Db layer maps rows to objects by
 * header name, so the order below is only used when a sheet is created.
 */

const APP_VERSION = '1.0.0';
/** Used for "today", month boundaries and date formatting. */
const TIME_ZONE = 'Asia/Dubai';
const DEFAULT_CURRENCY = 'AED';
const SESSION_TTL_DAYS = 14;
const STALE_PRICE_DAYS = 7;
const LOCK_TIMEOUT_MS = 15000;
const MAX_REQUEST_BYTES = 100000;

/** Password hashing and brute-force protection. */
const PASSWORD_ITERATIONS = 5000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

/** Sheet name -> ordered column headers. */
const SCHEMA = {
  Users: ['id', 'username', 'email', 'displayName', 'status', 'role', 'preferredCurrency', 'theme', 'passwordHash', 'passwordSalt', 'passwordIterations', 'failedLogins', 'lockedUntil', 'createdAt', 'updatedAt', 'lastLoginAt'],
  Sessions: ['id', 'tokenHash', 'userId', 'createdAt', 'expiresAt', 'userAgent'],
  Accounts: ['id', 'userId', 'name', 'type', 'currency', 'openingBalance', 'openingDate', 'institution', 'archived', 'createdAt', 'updatedAt'],
  Transactions: ['id', 'userId', 'type', 'amount', 'currency', 'categoryId', 'accountId', 'toAccountId', 'toAmount', 'date', 'description', 'notes', 'recurrence', 'recurringId', 'linkType', 'linkId', 'createdAt', 'updatedAt'],
  Categories: ['id', 'userId', 'name', 'kind', 'color', 'icon', 'essential', 'archived', 'sortOrder', 'createdAt', 'updatedAt'],
  Budgets: ['id', 'userId', 'categoryId', 'month', 'amount', 'createdAt', 'updatedAt'],
  SavingsGoals: ['id', 'userId', 'name', 'targetAmount', 'initialAmount', 'currency', 'targetDate', 'accountId', 'notes', 'archived', 'createdAt', 'updatedAt'],
  GoalContributions: ['id', 'userId', 'goalId', 'amount', 'date', 'note', 'createdAt'],
  Debts: ['id', 'userId', 'name', 'type', 'lender', 'currency', 'originalPrincipal', 'openingBalance', 'interestRate', 'minimumPayment', 'dueDay', 'startDate', 'notes', 'archived', 'createdAt', 'updatedAt'],
  DebtPayments: ['id', 'userId', 'debtId', 'date', 'amount', 'principal', 'interest', 'accountId', 'interestCategoryId', 'note', 'createdAt'],
  Investments: ['id', 'userId', 'name', 'ticker', 'assetType', 'currency', 'currentPrice', 'priceUpdatedAt', 'notes', 'archived', 'createdAt', 'updatedAt'],
  InvestmentTransactions: ['id', 'userId', 'investmentId', 'type', 'date', 'quantity', 'price', 'fees', 'cashAccountId', 'note', 'createdAt'],
  PriceHistory: ['id', 'userId', 'investmentId', 'date', 'price', 'createdAt'],
  AppSettings: ['id', 'userId', 'key', 'value', 'updatedAt']
};

/** Columns stored as numbers. Everything else is stored as plain text. */
const NUMBER_COLUMNS = {
  openingBalance: true, amount: true, toAmount: true, sortOrder: true,
  targetAmount: true, initialAmount: true, originalPrincipal: true, interestRate: true,
  minimumPayment: true, dueDay: true, principal: true, interest: true,
  currentPrice: true, quantity: true, price: true, fees: true,
  passwordIterations: true, failedLogins: true
};

/** Columns stored as TRUE/FALSE. */
const BOOLEAN_COLUMNS = { archived: true, essential: true };

/** Columns holding a calendar date (yyyy-MM-dd). */
const DATE_COLUMNS = { date: true, openingDate: true, targetDate: true, startDate: true, priceUpdatedAt: true };

/** ID prefixes per sheet; IDs are always `<prefix>_<20 hex chars>`. */
const ID_PREFIX = {
  Users: 'usr', Sessions: 'ses', Accounts: 'acc', Transactions: 'txn', Categories: 'cat',
  Budgets: 'bud', SavingsGoals: 'gol', GoalContributions: 'gct', Debts: 'dbt', DebtPayments: 'dpy',
  Investments: 'inv', InvestmentTransactions: 'itx', PriceHistory: 'prc', AppSettings: 'set'
};

const ENUMS = {
  userStatus: ['active', 'disabled'],
  userRole: ['admin', 'member'],
  theme: ['system', 'light', 'dark'],
  accountType: ['cash', 'bank', 'savings', 'credit_card'],
  transactionType: ['income', 'expense', 'transfer'],
  categoryKind: ['expense', 'income'],
  recurrence: ['', 'weekly', 'monthly', 'quarterly', 'yearly'],
  debtType: ['personal_loan', 'car_loan', 'home_loan', 'credit_card', 'other'],
  assetType: ['stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'gold', 'real_estate', 'other'],
  investmentTxnType: ['buy', 'sell']
};

/** Seeded for each new user. `essential` drives the essential vs discretionary split. */
const DEFAULT_CATEGORIES = [
  { name: 'Housing', kind: 'expense', color: '#6366f1', icon: 'home', essential: true },
  { name: 'Groceries', kind: 'expense', color: '#22c55e', icon: 'shopping-basket', essential: true },
  { name: 'Restaurants', kind: 'expense', color: '#f97316', icon: 'utensils', essential: false },
  { name: 'Transportation', kind: 'expense', color: '#0ea5e9', icon: 'bus', essential: true },
  { name: 'Fuel', kind: 'expense', color: '#eab308', icon: 'fuel', essential: true },
  { name: 'Utilities', kind: 'expense', color: '#14b8a6', icon: 'plug', essential: true },
  { name: 'Shopping', kind: 'expense', color: '#ec4899', icon: 'shopping-bag', essential: false },
  { name: 'Healthcare', kind: 'expense', color: '#ef4444', icon: 'heart-pulse', essential: true },
  { name: 'Education', kind: 'expense', color: '#8b5cf6', icon: 'graduation-cap', essential: true },
  { name: 'Family', kind: 'expense', color: '#f43f5e', icon: 'users', essential: true },
  { name: 'Entertainment', kind: 'expense', color: '#a855f7', icon: 'clapperboard', essential: false },
  { name: 'Travel', kind: 'expense', color: '#06b6d4', icon: 'plane', essential: false },
  { name: 'Subscriptions', kind: 'expense', color: '#64748b', icon: 'repeat', essential: false },
  { name: 'Insurance', kind: 'expense', color: '#0891b2', icon: 'shield', essential: true },
  { name: 'Other', kind: 'expense', color: '#94a3b8', icon: 'circle', essential: false },
  { name: 'Salary', kind: 'income', color: '#10b981', icon: 'briefcase', essential: false },
  { name: 'Freelance', kind: 'income', color: '#3b82f6', icon: 'laptop', essential: false },
  { name: 'Bonus', kind: 'income', color: '#f59e0b', icon: 'gift', essential: false },
  { name: 'Other Income', kind: 'income', color: '#84cc16', icon: 'coins', essential: false }
];

/** Script properties used by the backend (set in Project Settings > Script properties). */
const PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  /** "username:password, username:password" — read and deleted by setup(). The first user is the admin. */
  USERS: 'USERS'
};
