/**
 * FINANCIAL CAL — BACKEND (single file)
 *
 * HOW TO INSTALL: in the Apps Script editor open Code.gs, delete everything,
 * paste this whole file, and save. Then follow the README steps (USERS
 * property, run setup, deploy).
 *
 * This file is generated from the apps-script/ folder by
 * scripts/bundle-apps-script.mjs — do not edit it by hand.
 */

// ===================================================================== Config.gs

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

// ===================================================================== Util.gs

/**
 * Small shared helpers: errors, IDs, hashing, dates and rounding.
 */

/** Creates an error that is safe to return to the client. */
function apiError_(code, message) {
  const err = new Error(message);
  err.apiCode = code;
  return err;
}

function newId_(sheetName) {
  const prefix = ID_PREFIX[sheetName];
  if (!prefix) throw new Error('No ID prefix for ' + sheetName);
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

/** 64 hex chars (two v4 UUIDs, generated by a cryptographically secure RNG). */
function newSessionToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function nowIso_() {
  return new Date().toISOString();
}

/** Fixed in Config.gs so the project's own time-zone setting doesn't matter. */
function scriptTimeZone_() {
  return TIME_ZONE;
}

function todayStr_() {
  return Utilities.formatDate(new Date(), scriptTimeZone_(), 'yyyy-MM-dd');
}

function round2_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function roundQty_(n) {
  return Math.round(Number(n) * 1e8) / 1e8;
}

/** yyyy-MM-dd -> {y, m, d} (m is 1-based). */
function parseYmd_(s) {
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) };
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function ymd_(y, m, d) {
  return y + '-' + pad2_(m) + '-' + pad2_(d);
}

function daysInMonth_(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthOf_(dateStr) {
  return dateStr.slice(0, 7);
}

function lastDayOfMonth_(month) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return ymd_(y, m, daysInMonth_(y, m));
}

/** Adds `delta` months to yyyy-MM. */
function addMonths_(month, delta) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12 + 1;
  return ny + '-' + pad2_(nm);
}

/** Inclusive list of months ending at `endMonth`. */
function monthRange_(endMonth, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(addMonths_(endMonth, -i));
  return out;
}

/** Adds a recurrence period to a yyyy-MM-dd date, clamping the day of month. */
function addPeriod_(dateStr, recurrence, anchorDay) {
  const p = parseYmd_(dateStr);
  if (recurrence === 'weekly') {
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + 7));
    return ymd_(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const months = recurrence === 'monthly' ? 1 : recurrence === 'quarterly' ? 3 : recurrence === 'yearly' ? 12 : 0;
  if (!months) throw new Error('Unknown recurrence ' + recurrence);
  const target = addMonths_(dateStr.slice(0, 7), months);
  const ty = Number(target.slice(0, 4));
  const tm = Number(target.slice(5, 7));
  const day = Math.min(anchorDay || p.d, daysInMonth_(ty, tm));
  return ymd_(ty, tm, day);
}

function daysBetween_(fromStr, toStr) {
  const a = parseYmd_(fromStr);
  const b = parseYmd_(toStr);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

function indexBy_(list, key) {
  const out = {};
  list.forEach(function (item) { out[item[key]] = item; });
  return out;
}

// ===================================================================== Db.gs

/**
 * Spreadsheet data access. All row access goes through these helpers so that
 * type normalisation, formula escaping and per-user filtering live in one place.
 *
 * Handlers never receive raw spreadsheet access: they call the *ForUser_
 * helpers, which always scope by the authenticated user's ID.
 */

/** Per-execution cache of parsed sheets. Reset at the start of every request. */
let DB_CACHE_ = {};
let SPREADSHEET_ = null;

function resetDbCache_() {
  DB_CACHE_ = {};
  SPREADSHEET_ = null;
}

function getSpreadsheet_() {
  if (SPREADSHEET_) return SPREADSHEET_;
  const id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!id) throw apiError_('CONFIG', 'The backend is not configured: SPREADSHEET_ID script property is missing.');
  SPREADSHEET_ = SpreadsheetApp.openById(id);
  return SPREADSHEET_;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_('CONFIG', 'Sheet "' + name + '" is missing. Run setup() from the Apps Script editor.');
  return sheet;
}

/** Converts a raw cell value into its typed JS value. */
function fromCell_(column, value) {
  if (NUMBER_COLUMNS[column]) {
    if (value === '' || value === null) return null;
    const n = Number(value);
    return isFinite(n) ? n : null;
  }
  if (BOOLEAN_COLUMNS[column]) {
    return value === true || String(value).toUpperCase() === 'TRUE';
  }
  if (value instanceof Date) {
    if (DATE_COLUMNS[column]) return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM-dd');
    if (column === 'month') return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM');
    return value.toISOString();
  }
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Converts a JS value to a cell value. Strings that a spreadsheet could
 * interpret as a formula are written with a leading apostrophe (quote prefix),
 * which Sheets stores as literal text and strips on read.
 */
function toCell_(column, value) {
  if (NUMBER_COLUMNS[column]) return value === null || value === undefined || value === '' ? '' : Number(value);
  if (BOOLEAN_COLUMNS[column]) return value === true;
  const s = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function readTable_(name) {
  if (DB_CACHE_[name]) return DB_CACHE_[name];
  const sheet = getSheet_(name);
  const values = sheet.getDataRange().getValues();
  const header = (values[0] || []).map(String);
  const expected = SCHEMA[name];
  expected.forEach(function (col) {
    if (header.indexOf(col) < 0) throw apiError_('CONFIG', 'Sheet "' + name + '" is missing column "' + col + '". Run setup().');
  });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    if (raw.every(function (v) { return v === '' || v === null; })) continue;
    const rec = {};
    header.forEach(function (col, c) {
      if (expected.indexOf(col) >= 0) rec[col] = fromCell_(col, raw[c]);
    });
    Object.defineProperty(rec, '__row', { value: i + 1, enumerable: false, writable: true });
    rows.push(rec);
  }
  const table = { header: header, rows: rows };
  DB_CACHE_[name] = table;
  return table;
}

function allRecords_(name) {
  return readTable_(name).rows;
}

function invalidate_(name) {
  delete DB_CACHE_[name];
}

/** All records of `name` owned by `userId`. */
function listForUser_(name, userId) {
  if (!userId) throw apiError_('AUTH', 'Not signed in.');
  return allRecords_(name).filter(function (r) { return r.userId === userId; });
}

/** One record owned by `userId`, or NOT_FOUND. Records of other users are indistinguishable from missing ones. */
function getForUser_(name, userId, id) {
  if (!userId) throw apiError_('AUTH', 'Not signed in.');
  const rec = allRecords_(name).find(function (r) { return r.id === id && r.userId === userId; });
  if (!rec) throw apiError_('NOT_FOUND', 'Record not found.');
  return rec;
}

function findForUser_(name, userId, id) {
  return allRecords_(name).find(function (r) { return r.id === id && r.userId === userId; }) || null;
}

/** Builds a sheet row in header order. Columns not in the schema are left blank. */
function rowFromRecord_(name, header, record) {
  return header.map(function (col) { return SCHEMA[name].indexOf(col) >= 0 ? toCell_(col, record[col]) : ''; });
}

/** Appends records. Callers must hold the script lock. */
function insertRecords_(name, records) {
  if (!records.length) return records;
  const sheet = getSheet_(name);
  const header = readTable_(name).header;
  const rows = records.map(function (r) { return rowFromRecord_(name, header, r); });
  const start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, header.length).setValues(rows);
  invalidate_(name);
  return records;
}

function insertRecord_(name, record) {
  insertRecords_(name, [record]);
  return record;
}

/**
 * Updates a record owned by `userId`. `id` and `userId` can never be changed.
 * Callers must hold the script lock.
 */
function updateForUser_(name, userId, id, changes) {
  invalidate_(name);
  return writeUpdate_(name, getForUser_(name, userId, id), changes);
}

/** Updates a record without user scoping (Users table / admin use only). Callers must hold the lock. */
function updateById_(name, id, changes) {
  invalidate_(name);
  const rec = allRecords_(name).find(function (r) { return r.id === id; });
  if (!rec) throw apiError_('NOT_FOUND', 'Record not found.');
  return writeUpdate_(name, rec, changes);
}

function writeUpdate_(name, rec, changes) {
  const updated = {};
  SCHEMA[name].forEach(function (col) { updated[col] = rec[col]; });
  Object.keys(changes).forEach(function (col) {
    if (col === 'id' || col === 'userId') return;
    if (SCHEMA[name].indexOf(col) >= 0) updated[col] = changes[col];
  });
  if (SCHEMA[name].indexOf('updatedAt') >= 0) updated.updatedAt = nowIso_();
  const header = readTable_(name).header;
  getSheet_(name).getRange(rec.__row, 1, 1, header.length).setValues([rowFromRecord_(name, header, updated)]);
  invalidate_(name);
  return updated;
}

/** Deletes every record matching `predicate`. Callers must hold the script lock. */
function deleteWhere_(name, predicate) {
  invalidate_(name);
  const rows = allRecords_(name).filter(predicate).map(function (r) { return r.__row; });
  rows.sort(function (a, b) { return b - a; });
  const sheet = getSheet_(name);
  rows.forEach(function (row) { sheet.deleteRow(row); });
  invalidate_(name);
  return rows.length;
}

function deleteForUser_(name, userId, id) {
  getForUser_(name, userId, id);
  return deleteWhere_(name, function (r) { return r.id === id && r.userId === userId; });
}

/**
 * Runs `fn` while holding the script lock, so read-modify-write sequences
 * cannot interleave with another request. Keep work inside short.
 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw apiError_('BUSY', 'The server is busy saving another change. Please try again.');
  }
  try {
    resetDbCache_();
    const result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Strips internal properties and returns a plain object safe to send to the client. */
function toPublic_(rec) {
  const out = {};
  Object.keys(rec).forEach(function (k) {
    if (k !== 'userId') out[k] = rec[k];
  });
  return out;
}

// ===================================================================== Validation.gs

/**
 * Input validation. Every handler validates its payload with these helpers
 * before touching the spreadsheet. Each helper returns the normalised value
 * or throws a VALIDATION error naming the field.
 */

function invalid_(field, message) {
  return apiError_('VALIDATION', field + ' ' + message);
}

function isBlank_(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function vString_(v, field, opts) {
  opts = opts || {};
  const max = opts.max || 200;
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw invalid_(field, 'must be text.');
  const s = String(v).trim();
  if (s.length > max) throw invalid_(field, 'must be at most ' + max + ' characters.');
  // Reject control characters other than tab/newline.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s)) throw invalid_(field, 'contains invalid characters.');
  return s;
}

function vEnum_(v, field, allowed, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.defaultValue !== undefined) return opts.defaultValue;
    if (opts.required !== false && allowed.indexOf('') < 0) throw invalid_(field, 'is required.');
    return '';
  }
  if (allowed.indexOf(v) < 0) throw invalid_(field, 'must be one of: ' + allowed.filter(Boolean).join(', ') + '.');
  return v;
}

/**
 * Validates a number. Options: required, min, max, allowZero (default true when min<0
 * or when min is 0 and allowZero not false), decimals (default 2).
 */
function vNumber_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return opts.defaultValue !== undefined ? opts.defaultValue : null;
  }
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
  if (!isFinite(n)) throw invalid_(field, 'must be a number.');
  const min = opts.min === undefined ? 0 : opts.min;
  const max = opts.max === undefined ? 1e12 : opts.max;
  if (n < min) throw invalid_(field, 'must be at least ' + min + '.');
  if (n > max) throw invalid_(field, 'must be at most ' + max + '.');
  if (opts.positive && n <= 0) throw invalid_(field, 'must be greater than zero.');
  const decimals = opts.decimals === undefined ? 2 : opts.decimals;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function vAmount_(v, field, opts) {
  opts = opts || {};
  return vNumber_(v, field, {
    required: opts.required !== false,
    positive: opts.positive !== false,
    min: opts.min === undefined ? 0 : opts.min,
    max: 1e11,
    defaultValue: opts.defaultValue
  });
}

function vInt_(v, field, opts) {
  const n = vNumber_(v, field, Object.assign({}, opts, { decimals: 0 }));
  if (!isBlank_(v) && Math.floor(Number(v)) !== Number(v)) throw invalid_(field, 'must be a whole number.');
  return n;
}

function isValidYmd_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = parseYmd_(s);
  return p.y >= 1900 && p.y <= 2200 && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= daysInMonth_(p.y, p.m);
}

function vDate_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (!isValidYmd_(v)) throw invalid_(field, 'must be a valid date (YYYY-MM-DD).');
  return v;
}

function vMonth_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw invalid_(field, 'must be a month (YYYY-MM).');
  return v;
}

function vCurrency_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.defaultValue) return opts.defaultValue;
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (typeof v !== 'string' || !/^[A-Z]{3}$/.test(v)) throw invalid_(field, 'must be a 3-letter currency code such as AED.');
  return v;
}

function vId_(v, field, sheetName, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required !== false) throw invalid_(field, 'is required.');
    return '';
  }
  const prefix = ID_PREFIX[sheetName];
  if (typeof v !== 'string' || !new RegExp('^' + prefix + '_[a-f0-9]{20}$').test(v)) throw invalid_(field, 'is not a valid ID.');
  return v;
}

function vBool_(v, field, opts) {
  opts = opts || {};
  if (v === undefined || v === null || v === '') return opts.defaultValue === undefined ? false : opts.defaultValue;
  if (typeof v !== 'boolean') throw invalid_(field, 'must be true or false.');
  return v;
}

function vColor_(v, field) {
  if (isBlank_(v)) return '#64748b';
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw invalid_(field, 'must be a hex colour like #22c55e.');
  return v.toLowerCase();
}

function vEmail_(v, field) {
  const s = vString_(v, field, { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw invalid_(field, 'must be a valid email address.');
  return s;
}

/** Ensures the payload is a plain object and only contains known keys. */
function vPayload_(payload, allowedKeys) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw apiError_('VALIDATION', 'Request payload must be an object.');
  }
  Object.keys(payload).forEach(function (k) {
    if (allowedKeys.indexOf(k) < 0) throw apiError_('VALIDATION', 'Unknown field: ' + k);
  });
  return payload;
}

// ===================================================================== Calc.gs

/**
 * Pure financial calculations. No spreadsheet access here, so everything is
 * unit-tested in tests/backend.
 *
 * Accounting model (avoids double counting):
 *  - Account balance = openingBalance + income - expenses -/+ transfers.
 *    Credit cards hold negative balances when money is owed.
 *  - A credit-card purchase is one expense on the card account. Paying the
 *    card is a transfer (bank -> card), never a second expense.
 *  - Transfers never count as income or expenses.
 *  - Investment buys/sells with a cash account create linked transfers that
 *    move cash out of/into the account; the holding's market value is the
 *    only place the investment itself is counted.
 *  - Debt repayments reduce the debt by their principal portion only; the
 *    interest portion is an expense. Paid from an account, the principal is a
 *    linked transfer out of the account (not an expense).
 *  - Savings goals are earmarks on existing balances, never added to assets.
 *
 * Cost basis: weighted average cost. Fees on buys are added to cost; fees on
 * sells reduce proceeds. A sale realises (price * qty - fees) - avgCost * qty.
 */

/** Returns [{accountId, delta}] describing how a transaction changes account balances. */
function txnEffects_(t) {
  const amount = Number(t.amount) || 0;
  if (t.type === 'income') return t.accountId ? [{ accountId: t.accountId, delta: amount }] : [];
  if (t.type === 'expense') return t.accountId ? [{ accountId: t.accountId, delta: -amount }] : [];
  const out = [];
  if (t.accountId) out.push({ accountId: t.accountId, delta: -amount });
  if (t.toAccountId) {
    const toAmount = t.toAmount === null || t.toAmount === undefined || t.toAmount === '' ? amount : Number(t.toAmount);
    out.push({ accountId: t.toAccountId, delta: toAmount });
  }
  return out;
}

/** Balance per account ID, optionally as of a date (inclusive). */
function accountBalances_(accounts, txns, asOfDate) {
  const bal = {};
  accounts.forEach(function (a) {
    const opened = !asOfDate || !a.openingDate || a.openingDate <= asOfDate;
    bal[a.id] = opened ? Number(a.openingBalance) || 0 : 0;
  });
  txns.forEach(function (t) {
    if (asOfDate && t.date > asOfDate) return;
    txnEffects_(t).forEach(function (e) {
      if (Object.prototype.hasOwnProperty.call(bal, e.accountId)) bal[e.accountId] += e.delta;
    });
  });
  Object.keys(bal).forEach(function (k) { bal[k] = round2_(bal[k]); });
  return bal;
}

/**
 * Converter into the base currency using explicit user rates
 * ("1 unit of currency = rate base"). Unknown currencies return null and are
 * recorded in `missing`, so callers can exclude them and warn rather than
 * silently summing different currencies.
 */
function makeConverter_(base, rates) {
  const missing = {};
  const convert = function (amount, currency) {
    if (amount === null || amount === undefined) return null;
    if (!currency || currency === base) return Number(amount);
    const r = rates && rates[currency];
    if (!r) {
      missing[currency] = true;
      return null;
    }
    return Number(amount) * r;
  };
  convert.base = base;
  convert.missing = function () { return Object.keys(missing).sort(); };
  return convert;
}

/** Sums `items` after converting with `convert`; unconvertible items are skipped. */
function sumConverted_(items, convert, amountFn, currencyFn) {
  let total = 0;
  items.forEach(function (item) {
    const v = convert(amountFn(item), currencyFn(item));
    if (v !== null) total += v;
  });
  return round2_(total);
}

/** Price observations for an investment, newest last: manual updates and trade prices. */
function priceObservations_(investmentId, invTxns, priceHistory) {
  const obs = [];
  priceHistory.forEach(function (p) {
    if (p.investmentId === investmentId) obs.push({ date: p.date, price: Number(p.price), source: 'manual', order: 1 });
  });
  invTxns.forEach(function (t) {
    if (t.investmentId === investmentId) obs.push({ date: t.date, price: Number(t.price), source: 'trade', order: 0 });
  });
  obs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order; });
  return obs;
}

function sortInvTxns_(list) {
  return list.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.createdAt) < String(b.createdAt) ? -1 : String(a.createdAt) > String(b.createdAt) ? 1 : 0;
  });
}

/**
 * Replays an investment's transactions (weighted average cost) up to asOfDate.
 * Throws if a sale would exceed the quantity held at that point.
 */
function replayHolding_(invTxns, asOfDate) {
  let qty = 0, cost = 0, realized = 0, invested = 0, proceeds = 0, feesPaid = 0;
  sortInvTxns_(invTxns).forEach(function (t) {
    if (asOfDate && t.date > asOfDate) return;
    const q = Number(t.quantity), p = Number(t.price), f = Number(t.fees) || 0;
    feesPaid += f;
    if (t.type === 'buy') {
      cost += q * p + f;
      invested += q * p + f;
      qty += q;
    } else if (t.type === 'sell') {
      if (q > qty + 1e-9) {
        throw apiError_('VALIDATION', 'Sale on ' + t.date + ' exceeds the quantity held (' + roundQty_(qty) + ').');
      }
      const avg = qty > 0 ? cost / qty : 0;
      const costSold = avg * q;
      realized += q * p - f - costSold;
      proceeds += q * p - f;
      cost -= costSold;
      qty -= q;
      if (qty < 1e-9) { qty = 0; cost = 0; }
    }
  });
  return {
    quantity: roundQty_(qty),
    costBasis: round2_(cost),
    averageCost: qty > 0 ? cost / qty : 0,
    realizedPL: round2_(realized),
    totalInvested: round2_(invested),
    totalProceeds: round2_(proceeds),
    feesPaid: round2_(feesPaid)
  };
}

/** Full holding metrics for one investment as of a date (default: today). */
function computeHolding_(inv, allInvTxns, priceHistory, asOfDate, today) {
  const own = allInvTxns.filter(function (t) { return t.investmentId === inv.id; });
  const h = replayHolding_(own, asOfDate);
  const obs = priceObservations_(inv.id, own, priceHistory).filter(function (o) { return !asOfDate || o.date <= asOfDate; });
  const last = obs.length ? obs[obs.length - 1] : null;
  const price = last ? last.price : null;
  const marketValue = price === null ? null : round2_(h.quantity * price);
  const unrealized = marketValue === null ? null : round2_(marketValue - h.costBasis);
  const refDate = asOfDate || today;
  return {
    quantity: h.quantity,
    costBasis: h.costBasis,
    averageCost: h.averageCost,
    realizedPL: h.realizedPL,
    totalInvested: h.totalInvested,
    totalProceeds: h.totalProceeds,
    feesPaid: h.feesPaid,
    price: price,
    priceDate: last ? last.date : '',
    priceSource: last ? last.source : 'none',
    priceAgeDays: last && refDate ? daysBetween_(last.date, refDate) : null,
    stale: !!(last && refDate && h.quantity > 0 && daysBetween_(last.date, refDate) > STALE_PRICE_DAYS),
    marketValue: marketValue,
    unrealizedPL: unrealized,
    returnPct: unrealized !== null && h.costBasis > 0 ? unrealized / h.costBasis : null,
    totalReturn: unrealized === null ? h.realizedPL : round2_(unrealized + h.realizedPL)
  };
}

/** Outstanding balance of a debt as of a date: opening balance minus principal repaid. */
function debtOutstanding_(debt, payments, asOfDate) {
  if (asOfDate && debt.startDate && debt.startDate > asOfDate) return 0;
  const paid = payments.reduce(function (sum, p) {
    if (p.debtId !== debt.id || (asOfDate && p.date > asOfDate)) return sum;
    return sum + (Number(p.principal) || 0);
  }, 0);
  return round2_(Math.max(0, (Number(debt.openingBalance) || 0) - paid));
}

/** Next due date on or after `today` for a monthly due day (clamped to month length). */
function nextDueDate_(dueDay, today) {
  if (!dueDay) return '';
  const p = parseYmd_(today);
  const thisDay = Math.min(dueDay, daysInMonth_(p.y, p.m));
  if (thisDay >= p.d) return ymd_(p.y, p.m, thisDay);
  const next = addMonths_(today.slice(0, 7), 1);
  const ny = Number(next.slice(0, 4)), nm = Number(next.slice(5, 7));
  return ymd_(ny, nm, Math.min(dueDay, daysInMonth_(ny, nm)));
}

/** Income and expenses per month (base currency). Transfers are excluded. */
function monthlyFlows_(txns, months, convert) {
  const byMonth = {};
  months.forEach(function (m) { byMonth[m] = { month: m, income: 0, expenses: 0 }; });
  txns.forEach(function (t) {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const row = byMonth[monthOf_(t.date)];
    if (!row) return;
    const v = convert(t.amount, t.currency);
    if (v === null) return;
    if (t.type === 'income') row.income += v; else row.expenses += v;
  });
  return months.map(function (m) {
    const r = byMonth[m];
    const income = round2_(r.income), expenses = round2_(r.expenses);
    const savings = round2_(income - expenses);
    return { month: m, income: income, expenses: expenses, savings: savings, savingsRate: income > 0 ? savings / income : null };
  });
}

/** Expense totals per category between two dates (inclusive), in base currency. */
function expensesByCategory_(txns, categories, fromDate, toDate, convert) {
  const totals = {};
  txns.forEach(function (t) {
    if (t.type !== 'expense' || t.date < fromDate || t.date > toDate) return;
    const v = convert(t.amount, t.currency);
    if (v === null) return;
    const key = t.categoryId || '';
    totals[key] = (totals[key] || 0) + v;
  });
  const catById = indexBy_(categories, 'id');
  return Object.keys(totals).map(function (id) {
    const c = catById[id];
    return { categoryId: id, name: c ? c.name : 'Uncategorised', color: c ? c.color : '#94a3b8', amount: round2_(totals[id]) };
  }).sort(function (a, b) { return b.amount - a.amount; });
}

/**
 * Balance-sheet snapshot as of a date (base currency).
 * Assets: positive account balances + investment market value.
 * Liabilities: negative account balances (e.g. credit cards) + debt outstanding.
 */
function balanceSheet_(data, asOfDate, today, convert) {
  const balances = accountBalances_(data.accounts, data.transactions, asOfDate);
  let cash = 0, accountAssets = 0, accountLiabilities = 0;
  data.accounts.forEach(function (a) {
    const v = convert(balances[a.id], a.currency);
    if (v === null) return;
    if (a.type !== 'credit_card') cash += v;
    if (v >= 0) accountAssets += v; else accountLiabilities += -v;
  });
  let portfolio = 0, portfolioCost = 0;
  data.investments.forEach(function (inv) {
    const h = computeHolding_(inv, data.investmentTransactions, data.priceHistory, asOfDate, today);
    const mv = convert(h.marketValue === null ? 0 : h.marketValue, inv.currency);
    const cb = convert(h.costBasis, inv.currency);
    if (mv !== null) portfolio += mv;
    if (cb !== null) portfolioCost += cb;
  });
  let debts = 0;
  data.debts.forEach(function (d) {
    const v = convert(debtOutstanding_(d, data.debtPayments, asOfDate), d.currency);
    if (v !== null) debts += v;
  });
  const assets = accountAssets + portfolio;
  const liabilities = accountLiabilities + debts;
  return {
    balances: balances,
    cashBalance: round2_(cash),
    accountAssets: round2_(accountAssets),
    accountLiabilities: round2_(accountLiabilities),
    portfolioValue: round2_(portfolio),
    portfolioCost: round2_(portfolioCost),
    debtOutstanding: round2_(debts),
    totalAssets: round2_(assets),
    totalLiabilities: round2_(liabilities),
    netWorth: round2_(assets - liabilities)
  };
}

/** Next due date of a recurring series, based on its last occurrence. */
function recurringNextDue_(template, occurrences) {
  if (!template.recurrence) return '';
  let last = template.date;
  occurrences.forEach(function (o) { if (o.date > last) last = o.date; });
  return addPeriod_(last, template.recurrence, parseYmd_(template.date).d);
}

// ===================================================================== Auth.gs

/**
 * Authentication: username + password, checked on the server, then an opaque
 * server-side session.
 *
 * Passwords are never stored in plain text anywhere. They are hashed with
 * PBKDF2-HMAC-SHA256 (random 16-byte salt per user) and only the hash and
 * salt are kept in the private Users sheet. The usernames and first
 * passwords are entered once in the private Apps Script settings (script
 * property USERS); setup() hashes them and then deletes that property.
 *
 * Brute force: after MAX_FAILED_LOGINS wrong passwords an account is locked
 * for LOCKOUT_MINUTES. Error messages never reveal whether a username exists.
 *
 * Sessions: a random token (two v4 UUIDs, ~244 random bits) is returned to the
 * browser once. Only its SHA-256 hash is stored in the Sessions sheet, so a
 * leaked spreadsheet does not leak usable sessions.
 */

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function hexToBytes_(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) {
    const v = parseInt(hex.substr(i, 2), 16);
    out.push(v > 127 ? v - 256 : v);
  }
  return out;
}

function newSaltHex_() {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now(), Utilities.Charset.UTF_8);
  return bytesToHex_(bytes.slice(0, 16));
}

/** PBKDF2-HMAC-SHA256, one 32-byte block (RFC 8018). Returns hex. */
function pbkdf2Hex_(password, saltHex, iterations) {
  const alg = Utilities.MacAlgorithm.HMAC_SHA_256;
  const key = Utilities.newBlob(password).getBytes();
  let u = Utilities.computeHmacSignature(alg, hexToBytes_(saltHex).concat([0, 0, 0, 1]), key);
  const t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSignature(alg, u, key);
    for (let j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return bytesToHex_(t);
}

/** Compares two equal-length hex strings without short-circuiting. */
function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function vUsername_(v) {
  const s = vString_(v, 'Username', { required: true, max: 32 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(s)) throw apiError_('VALIDATION', 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore.');
  return s;
}

function vPassword_(v, field) {
  if (typeof v !== 'string' || v.length < MIN_PASSWORD_LENGTH) {
    throw apiError_('VALIDATION', (field || 'Password') + ' must be at least ' + MIN_PASSWORD_LENGTH + ' characters.');
  }
  if (v.length > 200) throw apiError_('VALIDATION', (field || 'Password') + ' is too long.');
  return v;
}

/** Fields to store for a new password. */
function passwordFields_(password) {
  const salt = newSaltHex_();
  return {
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    passwordHash: pbkdf2Hex_(password, salt, PASSWORD_ITERATIONS),
    failedLogins: 0,
    lockedUntil: ''
  };
}

function passwordMatches_(user, password) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  return safeEqual_(pbkdf2Hex_(password, user.passwordSalt, Number(user.passwordIterations) || PASSWORD_ITERATIONS), user.passwordHash);
}

function registrationEnabled_() {
  const row = allRecords_('AppSettings').find(function (s) { return s.userId === '' && s.key === 'registrationEnabled'; });
  return !!row && row.value === 'true';
}

function publicUser_(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    role: user.role,
    preferredCurrency: user.preferredCurrency || DEFAULT_CURRENCY,
    theme: user.theme || 'system',
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

/** Seeds default categories the first time a user signs in. Callers hold the lock. */
function seedUserDefaults_(userId) {
  if (listForUser_('Categories', userId).length) return;
  const now = nowIso_();
  insertRecords_('Categories', DEFAULT_CATEGORIES.map(function (c, i) {
    return {
      id: newId_('Categories'), userId: userId, name: c.name, kind: c.kind, color: c.color, icon: c.icon,
      essential: c.essential, archived: false, sortOrder: i, createdAt: now, updatedAt: now
    };
  }));
}

/** Creates a user with a hashed password. Callers hold the lock. */
function createUser_(username, password, displayName, role) {
  if (allRecords_('Users').some(function (u) { return u.username === username; })) {
    throw apiError_('CONFLICT', 'The username "' + username + '" is already taken.');
  }
  const now = nowIso_();
  return insertRecord_('Users', Object.assign({
    id: newId_('Users'), username: username, email: '', displayName: displayName || username,
    status: 'active', role: role, preferredCurrency: DEFAULT_CURRENCY, theme: 'system',
    createdAt: now, updatedAt: now, lastLoginAt: ''
  }, passwordFields_(password)));
}

/** Creates a session for the user and returns the login response. Callers hold the lock. */
function startSession_(user, userAgent) {
  const now = nowIso_();
  user = updateById_('Users', user.id, { lastLoginAt: now, failedLogins: 0, lockedUntil: '' });
  seedUserDefaults_(user.id);
  // Housekeeping: drop expired sessions.
  deleteWhere_('Sessions', function (s) { return s.expiresAt < now; });
  const token = newSessionToken_();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  insertRecord_('Sessions', {
    id: newId_('Sessions'), tokenHash: sha256Hex_(token), userId: user.id,
    createdAt: now, expiresAt: expiresAt, userAgent: userAgent
  });
  return { token: token, expiresAt: expiresAt, user: publicUser_(user) };
}

const BAD_LOGIN = 'Incorrect username or password.';

/** action: login (public). */
function handleLogin_(ctx, payload) {
  vPayload_(payload, ['username', 'password', 'userAgent']);
  const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const userAgent = vString_(payload.userAgent, 'userAgent', { max: 300 });
  if (!username || !password || password.length > 200) throw apiError_('AUTH', BAD_LOGIN);

  return withLock_(function () {
    const user = allRecords_('Users').find(function (u) { return u.username === username; });
    if (!user) {
      // Spend the same effort as a real check so timing does not reveal valid usernames.
      pbkdf2Hex_(password, '00000000000000000000000000000000', PASSWORD_ITERATIONS);
      throw apiError_('AUTH', BAD_LOGIN);
    }
    const now = nowIso_();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw apiError_('LOCKED', 'Too many wrong passwords. Try again in ' + LOCKOUT_MINUTES + ' minutes.');
    }
    if (!passwordMatches_(user, password)) {
      const failed = (Number(user.failedLogins) || 0) + 1;
      if (failed >= MAX_FAILED_LOGINS) {
        updateById_('Users', user.id, { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString() });
        throw apiError_('LOCKED', 'Too many wrong passwords. Try again in ' + LOCKOUT_MINUTES + ' minutes.');
      }
      updateById_('Users', user.id, { failedLogins: failed });
      throw apiError_('AUTH', BAD_LOGIN);
    }
    if (user.status !== 'active') throw apiError_('FORBIDDEN', 'This account has been disabled by the administrator.');
    return startSession_(user, userAgent);
  });
}

/** action: register (public) — only works when the administrator enabled self-registration. */
function handleRegister_(ctx, payload) {
  vPayload_(payload, ['username', 'password', 'displayName', 'userAgent']);
  const username = vUsername_(payload.username);
  const password = vPassword_(payload.password);
  const displayName = vString_(payload.displayName, 'Display name', { max: 80 });
  const userAgent = vString_(payload.userAgent, 'userAgent', { max: 300 });
  return withLock_(function () {
    if (!registrationEnabled_()) throw apiError_('FORBIDDEN', 'Registration is closed. Ask the administrator to create your account.');
    return startSession_(createUser_(username, password, displayName, 'member'), userAgent);
  });
}

/** action: health (public) — no user data, just what the login screen needs. */
function handleHealth_() {
  let registration = false;
  try {
    registration = registrationEnabled_();
  } catch (e) {
    registration = false;
  }
  return { name: 'Financial Cal API', version: APP_VERSION, registrationEnabled: registration };
}

/** Changes the caller's password and signs out their other devices. */
function handleChangePassword_(ctx, payload) {
  vPayload_(payload, ['currentPassword', 'newPassword']);
  if (!passwordMatches_(ctx.user, typeof payload.currentPassword === 'string' ? payload.currentPassword : '')) {
    throw apiError_('VALIDATION', 'Your current password is incorrect.');
  }
  const newPassword = vPassword_(payload.newPassword, 'New password');
  updateById_('Users', ctx.userId, passwordFields_(newPassword));
  const removed = deleteWhere_('Sessions', function (s) { return s.userId === ctx.userId && s.id !== ctx.sessionId; });
  return { changed: true, otherSessionsSignedOut: removed };
}

/**
 * Resolves the session token to an active user, or throws AUTH. This is the
 * only way handlers learn who the caller is.
 */
function requireSession_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw apiError_('AUTH', 'Please sign in.');
  }
  const hash = sha256Hex_(token);
  // Sessions are read from the sheet on every request (no cache) so that
  // logout, "sign out everywhere" and revocation take effect immediately.
  const session = allRecords_('Sessions').find(function (s) { return s.tokenHash === hash; });
  if (!session || session.expiresAt < nowIso_()) {
    throw apiError_('AUTH', 'Your session has expired. Please sign in again.');
  }
  // The user row is always read fresh so disabling an account takes effect immediately.
  const user = allRecords_('Users').find(function (u) { return u.id === session.userId; });
  if (!user || user.status !== 'active') {
    throw apiError_('AUTH', 'Your account is not active. Please contact the administrator.');
  }
  return { user: user, userId: user.id, sessionId: session.id, tokenHash: hash };
}

function handleLogout_(ctx) {
  deleteWhere_('Sessions', function (s) { return s.id === ctx.sessionId && s.userId === ctx.userId; });
  return { signedOut: true };
}

/** Signs the user out of every browser/device by deleting all their sessions. */
function handleLogoutAll_(ctx) {
  const removed = deleteWhere_('Sessions', function (s) { return s.userId === ctx.userId; });
  return { signedOut: true, sessionsRemoved: removed };
}

function handleGetSessions_(ctx) {
  return allRecords_('Sessions')
    .filter(function (s) { return s.userId === ctx.userId; })
    .map(function (s) {
      return { id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, userAgent: s.userAgent, current: s.id === ctx.sessionId };
    });
}

/* ---------------------------------------------------------------- Profile */

function userExchangeRates_(userId) {
  const rates = {};
  allRecords_('AppSettings').forEach(function (s) {
    if (s.userId === userId && s.key.indexOf('fx:') === 0) {
      const r = Number(s.value);
      if (isFinite(r) && r > 0) rates[s.key.slice(3)] = r;
    }
  });
  return rates;
}

function handleGetProfile_(ctx) {
  return {
    user: publicUser_(ctx.user),
    exchangeRates: userExchangeRates_(ctx.userId),
    registrationEnabled: ctx.user.role === 'admin' ? registrationEnabled_() : undefined,
    sessions: handleGetSessions_(ctx)
  };
}

function handleUpdateProfile_(ctx, payload) {
  vPayload_(payload, ['displayName', 'email', 'preferredCurrency', 'theme']);
  const changes = {};
  if (payload.email !== undefined) changes.email = isBlank_(payload.email) ? '' : vEmail_(payload.email, 'Email');
  if (payload.displayName !== undefined) changes.displayName = vString_(payload.displayName, 'Display name', { required: true, max: 80 });
  if (payload.preferredCurrency !== undefined) changes.preferredCurrency = vCurrency_(payload.preferredCurrency, 'Preferred currency', { required: true });
  if (payload.theme !== undefined) changes.theme = vEnum_(payload.theme, 'Theme', ENUMS.theme);
  if (changes.preferredCurrency && changes.preferredCurrency !== ctx.user.preferredCurrency) {
    // Rates are stored relative to the preferred currency, so they no longer apply.
    deleteWhere_('AppSettings', function (s) { return s.userId === ctx.userId && s.key.indexOf('fx:') === 0; });
  }
  const user = updateById_('Users', ctx.userId, changes);
  return publicUser_(user);
}

/**
 * Stores "1 <currency> = rate <preferred currency>". Rates are explicit,
 * user-entered values; nothing is fetched from external services.
 */
function handleSetExchangeRate_(ctx, payload) {
  vPayload_(payload, ['currency', 'rate']);
  const currency = vCurrency_(payload.currency, 'Currency', { required: true });
  const base = ctx.user.preferredCurrency || DEFAULT_CURRENCY;
  if (currency === base) throw apiError_('VALIDATION', 'Currency is already your preferred currency.');
  const rate = vNumber_(payload.rate, 'Rate', { required: true, positive: true, decimals: 8, max: 1e9 });
  setUserSetting_(ctx.userId, 'fx:' + currency, String(rate));
  return userExchangeRates_(ctx.userId);
}

function handleDeleteExchangeRate_(ctx, payload) {
  vPayload_(payload, ['currency']);
  const currency = vCurrency_(payload.currency, 'Currency', { required: true });
  deleteWhere_('AppSettings', function (s) { return s.userId === ctx.userId && s.key === 'fx:' + currency; });
  return userExchangeRates_(ctx.userId);
}

/** Upserts a setting row. userId '' means a global (admin) setting. Callers hold the lock. */
function setUserSetting_(userId, key, value) {
  const existing = allRecords_('AppSettings').find(function (s) { return s.userId === userId && s.key === key; });
  if (existing) return updateById_('AppSettings', existing.id, { value: value });
  return insertRecord_('AppSettings', { id: newId_('AppSettings'), userId: userId, key: key, value: value, updatedAt: nowIso_() });
}

/* ------------------------------------------------------------------ Admin */
/* Admins manage who may sign in. They can never read other users' finances. */

function handleAdminListUsers_() {
  return {
    registrationEnabled: registrationEnabled_(),
    users: allRecords_('Users').map(publicUser_)
  };
}

function handleAdminCreateUser_(ctx, payload) {
  vPayload_(payload, ['username', 'password', 'displayName', 'role']);
  const username = vUsername_(payload.username);
  const password = vPassword_(payload.password);
  const displayName = vString_(payload.displayName, 'Display name', { max: 80 });
  const role = vEnum_(payload.role, 'Role', ENUMS.userRole, { defaultValue: 'member' });
  return publicUser_(createUser_(username, password, displayName, role));
}

/** Sets a new password for a user (e.g. a forgotten password) and signs them out everywhere. */
function handleAdminResetPassword_(ctx, payload) {
  vPayload_(payload, ['id', 'password']);
  const id = vId_(payload.id, 'User ID', 'Users');
  const password = vPassword_(payload.password, 'New password');
  if (!allRecords_('Users').some(function (u) { return u.id === id; })) throw apiError_('NOT_FOUND', 'User not found.');
  updateById_('Users', id, passwordFields_(password));
  deleteWhere_('Sessions', function (s) { return s.userId === id && s.id !== ctx.sessionId; });
  return { reset: true };
}

function handleAdminUpdateUser_(ctx, payload) {
  vPayload_(payload, ['id', 'status', 'role', 'displayName']);
  const id = vId_(payload.id, 'User ID', 'Users');
  const target = allRecords_('Users').find(function (u) { return u.id === id; });
  if (!target) throw apiError_('NOT_FOUND', 'User not found.');
  const changes = {};
  if (payload.status !== undefined) changes.status = vEnum_(payload.status, 'Status', ENUMS.userStatus);
  if (payload.role !== undefined) changes.role = vEnum_(payload.role, 'Role', ENUMS.userRole);
  if (payload.displayName !== undefined) changes.displayName = vString_(payload.displayName, 'Display name', { required: true, max: 80 });
  if (id === ctx.userId && (changes.status === 'disabled' || changes.role === 'member')) {
    throw apiError_('VALIDATION', 'You cannot disable or demote your own account.');
  }
  const updated = updateById_('Users', id, changes);
  if (changes.status === 'disabled') {
    deleteWhere_('Sessions', function (s) { return s.userId === id; });
  }
  return publicUser_(updated);
}

function handleAdminSetRegistration_(ctx, payload) {
  vPayload_(payload, ['enabled']);
  const enabled = vBool_(payload.enabled, 'Enabled');
  setUserSetting_('', 'registrationEnabled', enabled ? 'true' : 'false');
  return { registrationEnabled: enabled };
}

// ===================================================================== Accounts.gs

/**
 * Accounts: cash, bank, savings and credit-card accounts.
 * Balances are always derived from the opening balance plus transactions,
 * never stored, so they cannot drift.
 */

function loadUserData_(userId) {
  return {
    accounts: listForUser_('Accounts', userId),
    transactions: listForUser_('Transactions', userId),
    categories: listForUser_('Categories', userId),
    budgets: listForUser_('Budgets', userId),
    goals: listForUser_('SavingsGoals', userId),
    goalContributions: listForUser_('GoalContributions', userId),
    debts: listForUser_('Debts', userId),
    debtPayments: listForUser_('DebtPayments', userId),
    investments: listForUser_('Investments', userId),
    investmentTransactions: listForUser_('InvestmentTransactions', userId),
    priceHistory: listForUser_('PriceHistory', userId)
  };
}

function userConverter_(ctx) {
  return makeConverter_(ctx.user.preferredCurrency || DEFAULT_CURRENCY, userExchangeRates_(ctx.userId));
}

function accountsWithBalances_(userId) {
  const accounts = listForUser_('Accounts', userId);
  const txns = listForUser_('Transactions', userId);
  const balances = accountBalances_(accounts, txns);
  const counts = {};
  txns.forEach(function (t) {
    if (t.accountId) counts[t.accountId] = (counts[t.accountId] || 0) + 1;
    if (t.toAccountId) counts[t.toAccountId] = (counts[t.toAccountId] || 0) + 1;
  });
  return accounts.map(function (a) {
    const out = toPublic_(a);
    out.balance = balances[a.id];
    out.transactionCount = counts[a.id] || 0;
    return out;
  }).sort(function (a, b) { return a.archived - b.archived || a.name.localeCompare(b.name); });
}

function handleGetAccounts_(ctx) {
  return accountsWithBalances_(ctx.userId);
}

/** Fetches an account owned by the user; optionally requires it to be open. */
function requireAccount_(userId, id, field, opts) {
  opts = opts || {};
  const accountId = vId_(id, field, 'Accounts', { required: opts.required !== false });
  if (!accountId) return null;
  const acc = findForUser_('Accounts', userId, accountId);
  if (!acc) throw apiError_('VALIDATION', field + ' does not exist.');
  if (opts.open && acc.archived) throw apiError_('VALIDATION', field + ' "' + acc.name + '" is archived.');
  return acc;
}

function handleAddAccount_(ctx, payload) {
  vPayload_(payload, ['name', 'type', 'currency', 'openingBalance', 'openingDate', 'institution']);
  const now = nowIso_();
  const rec = {
    id: newId_('Accounts'),
    userId: ctx.userId,
    name: vString_(payload.name, 'Name', { required: true, max: 80 }),
    type: vEnum_(payload.type, 'Type', ENUMS.accountType),
    currency: vCurrency_(payload.currency, 'Currency', { defaultValue: ctx.user.preferredCurrency || DEFAULT_CURRENCY }),
    openingBalance: vNumber_(payload.openingBalance, 'Opening balance', { min: -1e11, defaultValue: 0 }),
    openingDate: vDate_(payload.openingDate, 'Opening date') || todayStr_(),
    institution: vString_(payload.institution, 'Institution', { max: 80 }),
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  insertRecord_('Accounts', rec);
  return toPublic_(rec);
}

function handleUpdateAccount_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'currency', 'openingBalance', 'openingDate', 'institution', 'archived', 'type']);
  const acc = requireAccount_(ctx.userId, payload.id, 'Account');
  const changes = {};
  if (payload.name !== undefined) changes.name = vString_(payload.name, 'Name', { required: true, max: 80 });
  if (payload.institution !== undefined) changes.institution = vString_(payload.institution, 'Institution', { max: 80 });
  if (payload.openingBalance !== undefined) changes.openingBalance = vNumber_(payload.openingBalance, 'Opening balance', { min: -1e11, required: true });
  if (payload.openingDate !== undefined) changes.openingDate = vDate_(payload.openingDate, 'Opening date', { required: true });
  if (payload.archived !== undefined) changes.archived = vBool_(payload.archived, 'Archived');
  if (payload.type !== undefined) changes.type = vEnum_(payload.type, 'Type', ENUMS.accountType);
  if (payload.currency !== undefined) {
    const currency = vCurrency_(payload.currency, 'Currency', { required: true });
    if (currency !== acc.currency) {
      if (accountIsReferenced_(ctx.userId, acc.id)) {
        throw apiError_('CONFLICT', 'The currency of an account with transactions cannot be changed.');
      }
      changes.currency = currency;
    }
  }
  return toPublic_(updateForUser_('Accounts', ctx.userId, acc.id, changes));
}

function accountIsReferenced_(userId, accountId) {
  return listForUser_('Transactions', userId).some(function (t) { return t.accountId === accountId || t.toAccountId === accountId; }) ||
    listForUser_('DebtPayments', userId).some(function (p) { return p.accountId === accountId; }) ||
    listForUser_('InvestmentTransactions', userId).some(function (t) { return t.cashAccountId === accountId; }) ||
    listForUser_('SavingsGoals', userId).some(function (g) { return g.accountId === accountId; });
}

/** Deleting is only allowed for unused accounts; used accounts must be archived so history stays intact. */
function handleDeleteAccount_(ctx, payload) {
  vPayload_(payload, ['id']);
  const acc = requireAccount_(ctx.userId, payload.id, 'Account');
  if (accountIsReferenced_(ctx.userId, acc.id)) {
    throw apiError_('CONFLICT', 'This account has history. Archive it instead of deleting it.');
  }
  deleteForUser_('Accounts', ctx.userId, acc.id);
  return { deleted: acc.id };
}

// ===================================================================== Transactions.gs

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

// ===================================================================== Categories.gs

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

// ===================================================================== Budgets.gs

/**
 * Monthly budgets per expense category, expressed in the user's preferred
 * currency. Actual spending is converted with the user's stored exchange rates.
 */

function budgetReport_(ctx, month) {
  const convert = userConverter_(ctx);
  const categories = listForUser_('Categories', ctx.userId);
  const catById = indexBy_(categories, 'id');
  const budgets = listForUser_('Budgets', ctx.userId).filter(function (b) { return b.month === month; });
  const spent = {};
  listForUser_('Transactions', ctx.userId).forEach(function (t) {
    if (t.type !== 'expense' || monthOf_(t.date) !== month) return;
    const v = convert(t.amount, t.currency);
    if (v !== null) spent[t.categoryId] = (spent[t.categoryId] || 0) + v;
  });
  const items = budgets.map(function (b) {
    const c = catById[b.categoryId] || {};
    const actual = round2_(spent[b.categoryId] || 0);
    return {
      id: b.id, categoryId: b.categoryId, categoryName: c.name || 'Unknown', color: c.color || '#94a3b8',
      month: b.month, amount: b.amount, spent: actual, remaining: round2_(b.amount - actual),
      percentUsed: b.amount > 0 ? actual / b.amount : null
    };
  }).sort(function (a, b) { return b.spent - a.spent; });
  const budgeted = {};
  budgets.forEach(function (b) { budgeted[b.categoryId] = true; });
  const unbudgeted = Object.keys(spent).filter(function (id) { return !budgeted[id]; }).map(function (id) {
    const c = catById[id] || {};
    return { categoryId: id, categoryName: c.name || 'Uncategorised', color: c.color || '#94a3b8', spent: round2_(spent[id]) };
  }).sort(function (a, b) { return b.spent - a.spent; });
  const totalBudget = round2_(items.reduce(function (s, i) { return s + i.amount; }, 0));
  const totalSpent = round2_(items.reduce(function (s, i) { return s + i.spent; }, 0));
  return {
    month: month, currency: convert.base, items: items, unbudgeted: unbudgeted,
    totalBudget: totalBudget, totalSpent: totalSpent, totalRemaining: round2_(totalBudget - totalSpent),
    missingRates: convert.missing()
  };
}

function handleGetBudgets_(ctx, payload) {
  vPayload_(payload, ['month']);
  const month = vMonth_(payload.month, 'Month') || todayStr_().slice(0, 7);
  return budgetReport_(ctx, month);
}

/** Creates or updates the budget for a category and month. */
function handleSetBudget_(ctx, payload) {
  vPayload_(payload, ['categoryId', 'month', 'amount']);
  const cat = requireCategory_(ctx.userId, payload.categoryId, 'expense');
  const month = vMonth_(payload.month, 'Month', { required: true });
  const amount = vAmount_(payload.amount, 'Budget amount');
  const existing = listForUser_('Budgets', ctx.userId).find(function (b) { return b.categoryId === cat.id && b.month === month; });
  if (existing) {
    updateForUser_('Budgets', ctx.userId, existing.id, { amount: amount });
  } else {
    const now = nowIso_();
    insertRecord_('Budgets', { id: newId_('Budgets'), userId: ctx.userId, categoryId: cat.id, month: month, amount: amount, createdAt: now, updatedAt: now });
  }
  return budgetReport_(ctx, month);
}

function handleDeleteBudget_(ctx, payload) {
  vPayload_(payload, ['id']);
  const b = getForUser_('Budgets', ctx.userId, vId_(payload.id, 'Budget', 'Budgets'));
  deleteForUser_('Budgets', ctx.userId, b.id);
  return budgetReport_(ctx, b.month);
}

/** Copies budgets from one month to another, skipping categories that already have a budget. */
function handleCopyBudgets_(ctx, payload) {
  vPayload_(payload, ['fromMonth', 'toMonth']);
  const fromMonth = vMonth_(payload.fromMonth, 'From month', { required: true });
  const toMonth = vMonth_(payload.toMonth, 'To month', { required: true });
  if (fromMonth === toMonth) throw apiError_('VALIDATION', 'Choose two different months.');
  const all = listForUser_('Budgets', ctx.userId);
  const existing = {};
  all.forEach(function (b) { if (b.month === toMonth) existing[b.categoryId] = true; });
  const now = nowIso_();
  const copies = all.filter(function (b) { return b.month === fromMonth && !existing[b.categoryId]; }).map(function (b) {
    return { id: newId_('Budgets'), userId: ctx.userId, categoryId: b.categoryId, month: toMonth, amount: b.amount, createdAt: now, updatedAt: now };
  });
  insertRecords_('Budgets', copies);
  return budgetReport_(ctx, toMonth);
}

// ===================================================================== Goals.gs

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

// ===================================================================== Debts.gs

/**
 * Debts and repayments.
 *
 * Outstanding balance = opening balance - sum of principal repaid. Each
 * repayment is a distinct DebtPayments row; the liability is reduced only by
 * that row, never by the linked cash transactions as well.
 *
 * When a repayment is paid from an account, two linked transactions are
 * created so the account balance stays correct:
 *  - principal: a transfer out of the account (not an expense)
 *  - interest:  an expense in the chosen category
 *
 * Credit-card balances tracked as credit_card accounts are reported here
 * read-only (from the account balance) and are not stored as debts, so they
 * are never counted twice.
 */

function debtDetail_(debt, payments, today) {
  const own = payments.filter(function (p) { return p.debtId === debt.id; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  const outstanding = debtOutstanding_(debt, payments);
  const paidPrincipal = round2_(own.reduce(function (s, p) { return s + (Number(p.principal) || 0); }, 0));
  const paidInterest = round2_(own.reduce(function (s, p) { return s + (Number(p.interest) || 0); }, 0));
  const base = Number(debt.originalPrincipal) || Number(debt.openingBalance) || 0;
  const out = toPublic_(debt);
  out.outstanding = outstanding;
  out.paidPrincipal = paidPrincipal;
  out.paidInterest = paidInterest;
  out.progress = base > 0 ? Math.min(1, Math.max(0, (base - outstanding) / base)) : 0;
  out.nextDueDate = outstanding > 0 && !debt.archived ? nextDueDate_(debt.dueDay, today) : '';
  out.monthlyInterestEstimate = round2_(outstanding * (Number(debt.interestRate) || 0) / 100 / 12);
  out.payments = own.map(toPublic_);
  return out;
}

function handleGetDebts_(ctx) {
  const today = todayStr_();
  const convert = userConverter_(ctx);
  const debts = listForUser_('Debts', ctx.userId);
  const payments = listForUser_('DebtPayments', ctx.userId);
  const items = debts.map(function (d) { return debtDetail_(d, payments, today); })
    .sort(function (a, b) { return a.archived - b.archived || b.outstanding - a.outstanding; });

  const creditCards = accountsWithBalances_(ctx.userId)
    .filter(function (a) { return a.type === 'credit_card' && !a.archived; })
    .map(function (a) { return { id: a.id, name: a.name, currency: a.currency, owed: round2_(Math.max(0, -a.balance)), balance: a.balance }; });

  const endMonth = today.slice(0, 7);
  const history = monthRange_(endMonth, 12).map(function (m) {
    const asOf = m === endMonth ? today : lastDayOfMonth_(m);
    return { month: m, outstanding: sumConverted_(debts, convert, function (d) { return debtOutstanding_(d, payments, asOf); }, function (d) { return d.currency; }) };
  });

  const upcoming = items.filter(function (d) { return d.nextDueDate; })
    .map(function (d) { return { debtId: d.id, name: d.name, dueDate: d.nextDueDate, minimumPayment: d.minimumPayment, currency: d.currency }; })
    .sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });

  return {
    currency: convert.base,
    debts: items,
    creditCards: creditCards,
    totalOutstanding: sumConverted_(items, convert, function (d) { return d.outstanding; }, function (d) { return d.currency; }),
    totalCreditCardOwed: sumConverted_(creditCards, convert, function (c) { return c.owed; }, function (c) { return c.currency; }),
    upcoming: upcoming,
    history: history,
    missingRates: convert.missing()
  };
}

function debtFields_(ctx, payload, existing) {
  const out = {};
  const has = function (k) { return !existing || payload[k] !== undefined; };
  if (has('name')) out.name = vString_(payload.name, 'Name', { required: true, max: 80 });
  if (has('type')) out.type = vEnum_(payload.type, 'Type', ENUMS.debtType);
  if (has('lender')) out.lender = vString_(payload.lender, 'Lender', { max: 80 });
  if (has('originalPrincipal')) out.originalPrincipal = vAmount_(payload.originalPrincipal, 'Original principal');
  if (has('openingBalance')) {
    const fallback = out.originalPrincipal !== undefined ? out.originalPrincipal : existing && existing.openingBalance;
    out.openingBalance = vNumber_(payload.openingBalance, 'Current balance', { defaultValue: fallback });
    if (out.openingBalance === null || out.openingBalance === undefined) throw apiError_('VALIDATION', 'Current balance is required.');
  }
  if (has('interestRate')) out.interestRate = vNumber_(payload.interestRate, 'Interest rate', { max: 100, decimals: 4, defaultValue: 0 });
  if (has('minimumPayment')) out.minimumPayment = vNumber_(payload.minimumPayment, 'Minimum payment', { defaultValue: 0 });
  if (has('dueDay')) out.dueDay = vInt_(payload.dueDay, 'Due day', { min: 1, max: 31 }) || '';
  if (has('startDate')) out.startDate = vDate_(payload.startDate, 'Start date') || todayStr_();
  if (has('notes')) out.notes = vString_(payload.notes, 'Notes', { max: 500 });
  if (payload.archived !== undefined) out.archived = vBool_(payload.archived, 'Archived');
  if (payload.currency !== undefined || !existing) {
    const currency = vCurrency_(payload.currency, 'Currency', { defaultValue: ctx.user.preferredCurrency || DEFAULT_CURRENCY });
    if (existing && currency !== existing.currency && listForUser_('DebtPayments', ctx.userId).some(function (p) { return p.debtId === existing.id; })) {
      throw apiError_('CONFLICT', 'The currency of a debt with payments cannot be changed.');
    }
    out.currency = currency;
  }
  return out;
}

function handleAddDebt_(ctx, payload) {
  vPayload_(payload, ['name', 'type', 'lender', 'currency', 'originalPrincipal', 'openingBalance', 'interestRate', 'minimumPayment', 'dueDay', 'startDate', 'notes']);
  const now = nowIso_();
  const rec = Object.assign({ id: newId_('Debts'), userId: ctx.userId, archived: false, createdAt: now, updatedAt: now }, debtFields_(ctx, payload, null));
  insertRecord_('Debts', rec);
  return toPublic_(rec);
}

function handleUpdateDebt_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'type', 'lender', 'currency', 'originalPrincipal', 'openingBalance', 'interestRate', 'minimumPayment', 'dueDay', 'startDate', 'notes', 'archived']);
  const debt = getForUser_('Debts', ctx.userId, vId_(payload.id, 'Debt', 'Debts'));
  return toPublic_(updateForUser_('Debts', ctx.userId, debt.id, debtFields_(ctx, payload, debt)));
}

function handleDeleteDebt_(ctx, payload) {
  vPayload_(payload, ['id']);
  const debt = getForUser_('Debts', ctx.userId, vId_(payload.id, 'Debt', 'Debts'));
  const paymentIds = listForUser_('DebtPayments', ctx.userId).filter(function (p) { return p.debtId === debt.id; }).map(function (p) { return p.id; });
  deleteLinkedTransactions_(ctx.userId, 'debt_payment', paymentIds);
  deleteWhere_('DebtPayments', function (p) { return p.userId === ctx.userId && p.debtId === debt.id; });
  deleteForUser_('Debts', ctx.userId, debt.id);
  return { deleted: debt.id };
}

function defaultExpenseCategory_(userId) {
  const cats = listForUser_('Categories', userId).filter(function (c) { return c.kind === 'expense' && !c.archived; });
  return cats.find(function (c) { return c.name === 'Other'; }) || cats[0] || null;
}

function handleAddDebtPayment_(ctx, payload) {
  vPayload_(payload, ['debtId', 'date', 'amount', 'interest', 'accountId', 'interestCategoryId', 'note']);
  const debt = getForUser_('Debts', ctx.userId, vId_(payload.debtId, 'Debt', 'Debts'));
  const amount = vAmount_(payload.amount, 'Payment amount');
  const interest = vNumber_(payload.interest, 'Interest portion', { defaultValue: 0 });
  if (interest > amount) throw apiError_('VALIDATION', 'Interest portion cannot exceed the payment amount.');
  const principal = round2_(amount - interest);
  const outstanding = debtOutstanding_(debt, listForUser_('DebtPayments', ctx.userId));
  if (principal > outstanding + 0.005) {
    throw apiError_('VALIDATION', 'Principal (' + principal + ') exceeds the outstanding balance (' + outstanding + ').');
  }
  const date = vDate_(payload.date, 'Date') || todayStr_();
  const account = requireAccount_(ctx.userId, payload.accountId, 'Paid from account', { required: false, open: true });
  let interestCategory = null;
  if (account) {
    if (account.currency !== debt.currency) throw apiError_('VALIDATION', 'The paying account must be in ' + debt.currency + '.');
    if (interest > 0) {
      interestCategory = payload.interestCategoryId ? requireCategory_(ctx.userId, payload.interestCategoryId, 'expense') : defaultExpenseCategory_(ctx.userId);
      if (!interestCategory) throw apiError_('VALIDATION', 'Choose an expense category for the interest.');
    }
  }
  const rec = {
    id: newId_('DebtPayments'), userId: ctx.userId, debtId: debt.id, date: date, amount: amount,
    principal: principal, interest: interest, accountId: account ? account.id : '',
    interestCategoryId: interestCategory ? interestCategory.id : '', note: vString_(payload.note, 'Note', { max: 200 }), createdAt: nowIso_()
  };
  insertRecord_('DebtPayments', rec);
  if (account) {
    if (principal > 0) {
      insertLinkedTransaction_(ctx.userId, {
        type: 'transfer', amount: principal, currency: account.currency, accountId: account.id, date: date,
        description: 'Repayment: ' + debt.name, linkType: 'debt_payment', linkId: rec.id
      });
    }
    if (interest > 0) {
      insertLinkedTransaction_(ctx.userId, {
        type: 'expense', amount: interest, currency: account.currency, accountId: account.id, categoryId: interestCategory.id,
        date: date, description: 'Interest: ' + debt.name, linkType: 'debt_payment', linkId: rec.id
      });
    }
  }
  return toPublic_(rec);
}

function handleDeleteDebtPayment_(ctx, payload) {
  vPayload_(payload, ['id']);
  const p = getForUser_('DebtPayments', ctx.userId, vId_(payload.id, 'Payment', 'DebtPayments'));
  deleteLinkedTransactions_(ctx.userId, 'debt_payment', [p.id]);
  deleteForUser_('DebtPayments', ctx.userId, p.id);
  return { deleted: p.id };
}

// ===================================================================== Investments.gs

/**
 * Investments: holdings, buy/sell trades and manually entered prices.
 *
 * Trades live in InvestmentTransactions, separate from ordinary expenses.
 * If a trade names a cash account, a linked transfer moves the cash so
 * account balances stay right — purchases are never counted as spending.
 * Prices are only ever what the user entered (or the price of a recorded
 * trade); nothing is fetched or invented. See Calc.gs for cost-basis rules.
 */

function handleGetInvestments_(ctx) {
  const today = todayStr_();
  const convert = userConverter_(ctx);
  const investments = listForUser_('Investments', ctx.userId);
  const itx = listForUser_('InvestmentTransactions', ctx.userId);
  const prices = listForUser_('PriceHistory', ctx.userId);

  const holdings = investments.map(function (inv) {
    const out = toPublic_(inv);
    out.metrics = computeHolding_(inv, itx, prices, '', today);
    out.transactions = sortInvTxns_(itx.filter(function (t) { return t.investmentId === inv.id; })).reverse().map(toPublic_);
    out.prices = prices.filter(function (p) { return p.investmentId === inv.id; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(toPublic_);
    return out;
  }).sort(function (a, b) { return a.archived - b.archived || (b.metrics.marketValue || 0) - (a.metrics.marketValue || 0); });

  const totals = { marketValue: 0, costBasis: 0, unrealizedPL: 0, realizedPL: 0 };
  const byType = {};
  const byHolding = [];
  holdings.forEach(function (h) {
    const m = h.metrics;
    const mv = convert(m.marketValue || 0, h.currency);
    const cb = convert(m.costBasis, h.currency);
    const rl = convert(m.realizedPL, h.currency);
    if (mv !== null) totals.marketValue += mv;
    if (cb !== null) totals.costBasis += cb;
    if (rl !== null) totals.realizedPL += rl;
    if (mv !== null && mv > 0) {
      byType[h.assetType] = (byType[h.assetType] || 0) + mv;
      byHolding.push({ id: h.id, name: h.name, ticker: h.ticker, value: round2_(mv) });
    }
  });
  totals.unrealizedPL = totals.marketValue - totals.costBasis;
  Object.keys(totals).forEach(function (k) { totals[k] = round2_(totals[k]); });
  totals.returnPct = totals.costBasis > 0 ? totals.unrealizedPL / totals.costBasis : null;

  return {
    currency: convert.base,
    holdings: holdings,
    totals: totals,
    allocationByType: Object.keys(byType).map(function (t) { return { assetType: t, value: round2_(byType[t]) }; })
      .sort(function (a, b) { return b.value - a.value; }),
    allocationByHolding: byHolding.sort(function (a, b) { return b.value - a.value; }),
    history: portfolioHistory_(investments, itx, prices, today, 12, convert),
    staleCount: holdings.filter(function (h) { return h.metrics.stale; }).length,
    stalePriceDays: STALE_PRICE_DAYS,
    missingRates: convert.missing()
  };
}

/** Month-end portfolio value vs cost basis, using only prices known on each date. */
function portfolioHistory_(investments, itx, prices, today, months, convert) {
  const endMonth = today.slice(0, 7);
  return monthRange_(endMonth, months).map(function (m) {
    const asOf = m === endMonth ? today : lastDayOfMonth_(m);
    let value = 0, cost = 0;
    investments.forEach(function (inv) {
      const h = computeHolding_(inv, itx, prices, asOf, today);
      const v = convert(h.marketValue || 0, inv.currency);
      const c = convert(h.costBasis, inv.currency);
      if (v !== null) value += v;
      if (c !== null) cost += c;
    });
    return { month: m, value: round2_(value), costBasis: round2_(cost) };
  });
}

function investmentFields_(ctx, payload, existing) {
  const out = {};
  const has = function (k) { return !existing || payload[k] !== undefined; };
  if (has('name')) out.name = vString_(payload.name, 'Name', { required: true, max: 80 });
  if (has('ticker')) out.ticker = vString_(payload.ticker, 'Ticker', { max: 20 }).toUpperCase();
  if (has('assetType')) out.assetType = vEnum_(payload.assetType, 'Asset type', ENUMS.assetType);
  if (has('notes')) out.notes = vString_(payload.notes, 'Notes', { max: 500 });
  if (payload.archived !== undefined) out.archived = vBool_(payload.archived, 'Archived');
  if (payload.currency !== undefined || !existing) {
    const currency = vCurrency_(payload.currency, 'Currency', { defaultValue: ctx.user.preferredCurrency || DEFAULT_CURRENCY });
    if (existing && currency !== existing.currency && listForUser_('InvestmentTransactions', ctx.userId).some(function (t) { return t.investmentId === existing.id; })) {
      throw apiError_('CONFLICT', 'The currency of an investment with trades cannot be changed.');
    }
    out.currency = currency;
  }
  return out;
}

function handleAddInvestment_(ctx, payload) {
  vPayload_(payload, ['name', 'ticker', 'assetType', 'currency', 'notes']);
  const now = nowIso_();
  const rec = Object.assign({
    id: newId_('Investments'), userId: ctx.userId, currentPrice: '', priceUpdatedAt: '', archived: false, createdAt: now, updatedAt: now
  }, investmentFields_(ctx, payload, null));
  insertRecord_('Investments', rec);
  return toPublic_(rec);
}

function handleUpdateInvestment_(ctx, payload) {
  vPayload_(payload, ['id', 'name', 'ticker', 'assetType', 'currency', 'notes', 'archived']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.id, 'Investment', 'Investments'));
  return toPublic_(updateForUser_('Investments', ctx.userId, inv.id, investmentFields_(ctx, payload, inv)));
}

/** Deletes a holding with its trades, prices and linked cash transfers. */
function handleDeleteInvestment_(ctx, payload) {
  vPayload_(payload, ['id']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.id, 'Investment', 'Investments'));
  const tradeIds = listForUser_('InvestmentTransactions', ctx.userId).filter(function (t) { return t.investmentId === inv.id; }).map(function (t) { return t.id; });
  deleteLinkedTransactions_(ctx.userId, 'investment', tradeIds);
  deleteWhere_('InvestmentTransactions', function (t) { return t.userId === ctx.userId && t.investmentId === inv.id; });
  deleteWhere_('PriceHistory', function (p) { return p.userId === ctx.userId && p.investmentId === inv.id; });
  deleteForUser_('Investments', ctx.userId, inv.id);
  return { deleted: inv.id };
}

function handleAddInvestmentTransaction_(ctx, payload) {
  vPayload_(payload, ['investmentId', 'type', 'date', 'quantity', 'price', 'fees', 'cashAccountId', 'note']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.investmentId, 'Investment', 'Investments'));
  const rec = {
    id: newId_('InvestmentTransactions'), userId: ctx.userId, investmentId: inv.id,
    type: vEnum_(payload.type, 'Type', ENUMS.investmentTxnType),
    date: vDate_(payload.date, 'Date') || todayStr_(),
    quantity: vNumber_(payload.quantity, 'Quantity', { required: true, positive: true, decimals: 8 }),
    price: vNumber_(payload.price, 'Price per unit', { required: true, decimals: 8 }),
    fees: vNumber_(payload.fees, 'Fees', { defaultValue: 0 }),
    cashAccountId: '', note: vString_(payload.note, 'Note', { max: 200 }), createdAt: nowIso_()
  };
  const account = requireAccount_(ctx.userId, payload.cashAccountId, 'Cash account', { required: false, open: true });
  if (account && account.currency !== inv.currency) {
    throw apiError_('VALIDATION', 'The cash account must be in ' + inv.currency + ' to link this trade.');
  }
  // Replaying with the new trade rejects sales larger than the quantity held on that date.
  const own = listForUser_('InvestmentTransactions', ctx.userId).filter(function (t) { return t.investmentId === inv.id; });
  replayHolding_(own.concat([rec]), '');
  if (rec.type === 'sell' && rec.quantity * rec.price - rec.fees < 0) {
    throw apiError_('VALIDATION', 'Fees cannot exceed the sale proceeds.');
  }
  rec.cashAccountId = account ? account.id : '';
  insertRecord_('InvestmentTransactions', rec);
  if (account) {
    const gross = rec.quantity * rec.price;
    const label = (rec.type === 'buy' ? 'Buy ' : 'Sell ') + (inv.ticker || inv.name);
    insertLinkedTransaction_(ctx.userId, rec.type === 'buy'
      ? { type: 'transfer', amount: gross + rec.fees, currency: account.currency, accountId: account.id, date: rec.date, description: label, linkType: 'investment', linkId: rec.id }
      : { type: 'transfer', amount: gross - rec.fees, currency: account.currency, toAccountId: account.id, date: rec.date, description: label, linkType: 'investment', linkId: rec.id });
  }
  return toPublic_(rec);
}

function handleDeleteInvestmentTransaction_(ctx, payload) {
  vPayload_(payload, ['id']);
  const t = getForUser_('InvestmentTransactions', ctx.userId, vId_(payload.id, 'Trade', 'InvestmentTransactions'));
  const remaining = listForUser_('InvestmentTransactions', ctx.userId).filter(function (x) { return x.investmentId === t.investmentId && x.id !== t.id; });
  try {
    replayHolding_(remaining, '');
  } catch (e) {
    throw apiError_('CONFLICT', 'Deleting this purchase would leave a later sale larger than the quantity held. Delete the sale first.');
  }
  deleteLinkedTransactions_(ctx.userId, 'investment', [t.id]);
  deleteForUser_('InvestmentTransactions', ctx.userId, t.id);
  return { deleted: t.id };
}

/** Records a manually entered market price for a holding. */
function handleUpdateInvestmentPrice_(ctx, payload) {
  vPayload_(payload, ['investmentId', 'price', 'date']);
  const inv = getForUser_('Investments', ctx.userId, vId_(payload.investmentId, 'Investment', 'Investments'));
  const price = vNumber_(payload.price, 'Price', { required: true, decimals: 8 });
  const date = vDate_(payload.date, 'Price date') || todayStr_();
  if (date > todayStr_()) throw apiError_('VALIDATION', 'Price date cannot be in the future.');
  insertRecord_('PriceHistory', { id: newId_('PriceHistory'), userId: ctx.userId, investmentId: inv.id, date: date, price: price, createdAt: nowIso_() });
  if (!inv.priceUpdatedAt || date >= inv.priceUpdatedAt) {
    updateForUser_('Investments', ctx.userId, inv.id, { currentPrice: price, priceUpdatedAt: date });
  }
  return { investmentId: inv.id, price: price, date: date };
}

function handleDeletePrice_(ctx, payload) {
  vPayload_(payload, ['id']);
  const p = getForUser_('PriceHistory', ctx.userId, vId_(payload.id, 'Price', 'PriceHistory'));
  deleteForUser_('PriceHistory', ctx.userId, p.id);
  const latest = listForUser_('PriceHistory', ctx.userId).filter(function (x) { return x.investmentId === p.investmentId; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
  updateForUser_('Investments', ctx.userId, p.investmentId, { currentPrice: latest ? latest.price : '', priceUpdatedAt: latest ? latest.date : '' });
  return { deleted: p.id };
}

// ===================================================================== Dashboard.gs

/**
 * Dashboard and reports. All figures are in the user's preferred currency;
 * amounts in currencies without a stored exchange rate are excluded and
 * listed in `missingRates` so the UI can say so.
 */

function handleGetDashboard_(ctx) {
  const today = todayStr_();
  const month = today.slice(0, 7);
  const convert = userConverter_(ctx);
  const data = loadUserData_(ctx.userId);
  const sheet = balanceSheet_(data, '', today, convert);
  const months = monthRange_(month, 6);
  const flows = monthlyFlows_(data.transactions, months, convert);
  const current = flows[flows.length - 1];
  const catById = indexBy_(data.categories, 'id');
  const accById = indexBy_(data.accounts, 'id');

  const inv = data.investments.map(function (i) {
    return { inv: i, m: computeHolding_(i, data.investmentTransactions, data.priceHistory, '', today) };
  });
  const allocation = {};
  inv.forEach(function (x) {
    const v = convert(x.m.marketValue || 0, x.inv.currency);
    if (v) allocation[x.inv.assetType] = (allocation[x.inv.assetType] || 0) + v;
  });

  const recent = data.transactions.slice()
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1); })
    .slice(0, 8)
    .map(function (t) {
      const out = toPublic_(t);
      out.categoryName = t.categoryId && catById[t.categoryId] ? catById[t.categoryId].name : '';
      out.categoryColor = t.categoryId && catById[t.categoryId] ? catById[t.categoryId].color : '';
      out.accountName = accById[t.accountId] ? accById[t.accountId].name : '';
      out.toAccountName = accById[t.toAccountId] ? accById[t.toAccountId].name : '';
      return out;
    });

  const debts = handleGetDebts_(ctx);
  const goals = handleGetSavingsGoals_(ctx).filter(function (g) { return !g.archived; }).slice(0, 4);
  const budgets = budgetReport_(ctx, month);

  // Collect missing rates from every sub-calculation.
  const missing = {};
  convert.missing().concat(debts.missingRates, budgets.missingRates).forEach(function (c) { missing[c] = true; });

  return {
    currency: convert.base,
    asOf: today,
    month: month,
    kpis: {
      cashBalance: sheet.cashBalance,
      totalAssets: sheet.totalAssets,
      totalLiabilities: sheet.totalLiabilities,
      netWorth: sheet.netWorth,
      monthIncome: current.income,
      monthExpenses: current.expenses,
      monthSavings: current.savings,
      savingsRate: current.savingsRate,
      portfolioValue: sheet.portfolioValue,
      portfolioCost: sheet.portfolioCost,
      debtOutstanding: sheet.debtOutstanding
    },
    monthly: flows,
    expensesByCategory: expensesByCategory_(data.transactions, data.categories, month + '-01', lastDayOfMonth_(month), convert),
    allocation: Object.keys(allocation).map(function (k) { return { assetType: k, value: round2_(allocation[k]) }; })
      .sort(function (a, b) { return b.value - a.value; }),
    portfolioHistory: portfolioHistory_(data.investments, data.investmentTransactions, data.priceHistory, today, 6, convert),
    recentTransactions: recent,
    budgets: budgets.items.slice(0, 5),
    upcomingDebtPayments: debts.upcoming.slice(0, 5),
    goals: goals.map(function (g) {
      return { id: g.id, name: g.name, saved: g.saved, targetAmount: g.targetAmount, currency: g.currency, progress: g.progress, targetDate: g.targetDate };
    }),
    stalePrices: inv.filter(function (x) { return x.m.stale; }).map(function (x) { return { id: x.inv.id, name: x.inv.name, priceDate: x.m.priceDate }; }),
    counts: {
      accounts: data.accounts.length,
      transactions: data.transactions.length,
      investments: data.investments.length,
      debts: data.debts.length,
      goals: data.goals.length
    },
    missingRates: Object.keys(missing).sort()
  };
}

/** Monthly report series over the last `months` months (default 12). */
function handleGetReports_(ctx, payload) {
  vPayload_(payload, ['months', 'endMonth']);
  const count = vInt_(payload.months, 'Months', { min: 1, max: 60, defaultValue: 12 });
  const today = todayStr_();
  const endMonth = vMonth_(payload.endMonth, 'End month') || today.slice(0, 7);
  const convert = userConverter_(ctx);
  const data = loadUserData_(ctx.userId);
  const months = monthRange_(endMonth, count);
  const flows = monthlyFlows_(data.transactions, months, convert);

  const series = flows.map(function (f) {
    const asOf = f.month === today.slice(0, 7) ? today : lastDayOfMonth_(f.month);
    const bs = asOf > today ? null : balanceSheet_(data, asOf, today, convert);
    return Object.assign({}, f, bs ? {
      netWorth: bs.netWorth, totalAssets: bs.totalAssets, totalLiabilities: bs.totalLiabilities,
      cashBalance: bs.cashBalance, debtOutstanding: bs.debtOutstanding,
      portfolioValue: bs.portfolioValue, portfolioCost: bs.portfolioCost
    } : {});
  });

  const from = months[0] + '-01';
  const to = lastDayOfMonth_(months[months.length - 1]);
  const totals = series.reduce(function (acc, s) {
    acc.income += s.income;
    acc.expenses += s.expenses;
    return acc;
  }, { income: 0, expenses: 0 });
  totals.income = round2_(totals.income);
  totals.expenses = round2_(totals.expenses);
  totals.savings = round2_(totals.income - totals.expenses);
  totals.savingsRate = totals.income > 0 ? totals.savings / totals.income : null;

  const holdings = data.investments.map(function (i) {
    const m = computeHolding_(i, data.investmentTransactions, data.priceHistory, '', today);
    return {
      id: i.id, name: i.name, ticker: i.ticker, assetType: i.assetType, currency: i.currency,
      quantity: m.quantity, costBasis: m.costBasis, marketValue: m.marketValue, unrealizedPL: m.unrealizedPL,
      realizedPL: m.realizedPL, returnPct: m.returnPct, priceDate: m.priceDate, stale: m.stale
    };
  });

  const debtPaymentsInRange = data.debtPayments.filter(function (p) { return p.date >= from && p.date <= to; });
  const debtCurrency = function (p) {
    const d = data.debts.find(function (x) { return x.id === p.debtId; });
    return d ? d.currency : convert.base;
  };
  return {
    currency: convert.base,
    from: from,
    to: to,
    series: series,
    totals: totals,
    spendingByCategory: expensesByCategory_(data.transactions, data.categories, from, to, convert),
    investmentPerformance: holdings,
    debtReduction: {
      principalRepaid: sumConverted_(debtPaymentsInRange, convert, function (p) { return p.principal; }, debtCurrency),
      interestPaid: sumConverted_(debtPaymentsInRange, convert, function (p) { return p.interest; }, debtCurrency)
    },
    missingRates: convert.missing()
  };
}

// ===================================================================== Code.gs

/**
 * Financial Cal — Apps Script Web App entry point.
 *
 * Transport: the browser sends POST requests with Content-Type text/plain and
 * a JSON body { action, token, payload }. text/plain keeps the request a CORS
 * "simple request" (no preflight, which Apps Script cannot answer). The
 * session token travels in the body, never in the URL, so it does not end up
 * in logs or browser history. Apps Script always answers HTTP 200, so the
 * JSON body carries { ok, data } or { ok: false, error: { code, message } }.
 *
 * Only actions listed in routes_() can be called. Every route except `login`,
 * `register` and `health` requires a valid session; handlers receive the authenticated
 * user from the session, never from the request payload.
 */

/**
 * The explicit API allowlist.
 *  write: runs inside the script lock (read-modify-write)
 *  auth:  false only for public actions
 *  admin: requires role=admin
 *
 * Built on first use because Apps Script evaluates files one after another,
 * so handlers defined in later files do not exist yet at load time.
 */
let ROUTES_ = null;

function routes_() {
  if (ROUTES_) return ROUTES_;
  ROUTES_ = {
    health: { handler: handleHealth_, auth: false },
    login: { handler: handleLogin_, auth: false },
    register: { handler: handleRegister_, auth: false },
    changePassword: { handler: handleChangePassword_, write: true },
    logout: { handler: handleLogout_, write: true },
    logoutAll: { handler: handleLogoutAll_, write: true },

    getBootstrap: { handler: handleGetBootstrap_ },
    getProfile: { handler: handleGetProfile_ },
    updateProfile: { handler: handleUpdateProfile_, write: true },
    setExchangeRate: { handler: handleSetExchangeRate_, write: true },
    deleteExchangeRate: { handler: handleDeleteExchangeRate_, write: true },

    getDashboard: { handler: handleGetDashboard_ },
    getReports: { handler: handleGetReports_ },

    getAccounts: { handler: handleGetAccounts_ },
    addAccount: { handler: handleAddAccount_, write: true },
    updateAccount: { handler: handleUpdateAccount_, write: true },
    deleteAccount: { handler: handleDeleteAccount_, write: true },

    getTransactions: { handler: handleGetTransactions_ },
    addTransaction: { handler: handleAddTransaction_, write: true },
    updateTransaction: { handler: handleUpdateTransaction_, write: true },
    deleteTransaction: { handler: handleDeleteTransaction_, write: true },
    recordRecurring: { handler: handleRecordRecurring_, write: true },

    getCategories: { handler: handleGetCategories_ },
    addCategory: { handler: handleAddCategory_, write: true },
    updateCategory: { handler: handleUpdateCategory_, write: true },

    getBudgets: { handler: handleGetBudgets_ },
    setBudget: { handler: handleSetBudget_, write: true },
    deleteBudget: { handler: handleDeleteBudget_, write: true },
    copyBudgets: { handler: handleCopyBudgets_, write: true },

    getSavingsGoals: { handler: handleGetSavingsGoals_ },
    addSavingsGoal: { handler: handleAddSavingsGoal_, write: true },
    updateSavingsGoal: { handler: handleUpdateSavingsGoal_, write: true },
    deleteSavingsGoal: { handler: handleDeleteSavingsGoal_, write: true },
    addGoalContribution: { handler: handleAddGoalContribution_, write: true },
    deleteGoalContribution: { handler: handleDeleteGoalContribution_, write: true },

    getDebts: { handler: handleGetDebts_ },
    addDebt: { handler: handleAddDebt_, write: true },
    updateDebt: { handler: handleUpdateDebt_, write: true },
    deleteDebt: { handler: handleDeleteDebt_, write: true },
    addDebtPayment: { handler: handleAddDebtPayment_, write: true },
    deleteDebtPayment: { handler: handleDeleteDebtPayment_, write: true },

    getInvestments: { handler: handleGetInvestments_ },
    addInvestment: { handler: handleAddInvestment_, write: true },
    updateInvestment: { handler: handleUpdateInvestment_, write: true },
    deleteInvestment: { handler: handleDeleteInvestment_, write: true },
    addInvestmentTransaction: { handler: handleAddInvestmentTransaction_, write: true },
    deleteInvestmentTransaction: { handler: handleDeleteInvestmentTransaction_, write: true },
    updateInvestmentPrice: { handler: handleUpdateInvestmentPrice_, write: true },
    deletePrice: { handler: handleDeletePrice_, write: true },

    adminListUsers: { handler: handleAdminListUsers_, admin: true },
    adminCreateUser: { handler: handleAdminCreateUser_, write: true, admin: true },
    adminResetPassword: { handler: handleAdminResetPassword_, write: true, admin: true },
    adminUpdateUser: { handler: handleAdminUpdateUser_, write: true, admin: true },
    adminSetRegistration: { handler: handleAdminSetRegistration_, write: true, admin: true }
  };
  return ROUTES_;
}

function handleGetBootstrap_(ctx) {
  return {
    user: publicUser_(ctx.user),
    exchangeRates: userExchangeRates_(ctx.userId),
    accounts: accountsWithBalances_(ctx.userId),
    categories: handleGetCategories_(ctx),
    stalePriceDays: STALE_PRICE_DAYS,
    today: todayStr_()
  };
}

/** GET is a health check only; it never returns user data. */
function doGet() {
  resetDbCache_();
  return jsonOutput_({ ok: true, data: handleHealth_() });
}

function doPost(e) {
  let request = null;
  const body = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (body.length > MAX_REQUEST_BYTES) {
    return jsonOutput_({ ok: false, error: { code: 'BAD_REQUEST', message: 'Request is too large.' } });
  }
  try {
    request = JSON.parse(body);
  } catch (err) {
    return jsonOutput_({ ok: false, error: { code: 'BAD_REQUEST', message: 'Request body must be JSON.' } });
  }
  return jsonOutput_(handleRequest_(request));
}

/** Validates, authenticates and dispatches one API request. Returns the response object. */
function handleRequest_(request) {
  resetDbCache_();
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw apiError_('BAD_REQUEST', 'Request must be a JSON object.');
    }
    const action = request.action;
    const routes = routes_();
    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(routes, action)) {
      throw apiError_('UNKNOWN_ACTION', 'Unknown action.');
    }
    const route = routes[action];
    const payload = request.payload === undefined || request.payload === null ? {} : request.payload;
    if (typeof payload !== 'object' || Array.isArray(payload)) throw apiError_('BAD_REQUEST', 'Payload must be an object.');

    let ctx = {};
    if (route.auth !== false) {
      ctx = requireSession_(request.token);
      if (route.admin && ctx.user.role !== 'admin') throw apiError_('FORBIDDEN', 'Administrator access is required.');
    }
    const data = route.write
      ? withLock_(function () {
        // Re-resolve the session inside the lock so a concurrent logout/disable is honoured.
        const fresh = requireSession_(request.token);
        if (route.admin && fresh.user.role !== 'admin') throw apiError_('FORBIDDEN', 'Administrator access is required.');
        return route.handler(fresh, payload);
      })
      : route.handler(ctx, payload);
    return { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    return errorResponse_(err);
  }
}

function errorResponse_(err) {
  if (err && err.apiCode) {
    return { ok: false, error: { code: err.apiCode, message: err.message } };
  }
  // Unexpected errors (including spreadsheet service failures) are logged but not leaked.
  console.error(err && err.stack ? err.stack : err);
  const message = err && /Service|spreadsheet|Exceeded|timed out/i.test(String(err.message))
    ? 'Google Sheets is temporarily unavailable. Please try again in a moment.'
    : 'Something went wrong on the server. Please try again.';
  return { ok: false, error: { code: 'INTERNAL', message: message } };
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ===================================================================== Setup.gs

/**
 * One-time setup and administration helpers. Run these from the Apps Script
 * editor (select the function, click Run). They are not reachable through the
 * web app: only doGet/doPost are exposed over HTTP.
 */

/**
 * Prepares the database. Safe to run repeatedly: it only adds what is missing.
 * If SPREADSHEET_ID is not set, a new spreadsheet is created and its ID stored.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP.SPREADSHEET_ID);
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Financial Cal Database');
    id = ss.getId();
    props.setProperty(PROP.SPREADSHEET_ID, id);
    console.log('Created spreadsheet ' + ss.getUrl());
  }
  SPREADSHEET_ = ss;

  Object.keys(SCHEMA).forEach(function (name) { ensureSheet_(ss, name, SCHEMA[name]); });

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) ss.deleteSheet(defaultSheet);

  withLock_(function () {
    if (!allRecords_('AppSettings').some(function (s) { return s.userId === '' && s.key === 'registrationEnabled'; })) {
      setUserSetting_('', 'registrationEnabled', 'false');
    }
    applyUsersProperty_();
  });

  console.log('Setup complete. Spreadsheet: ' + ss.getUrl());
}

function ensureSheet_(ss, name, columns) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  const existing = header.filter(function (h) { return h !== ''; });
  const missing = columns.filter(function (c) { return existing.indexOf(c) < 0; });
  if (missing.length) {
    const start = existing.length + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
  }
  const finalHeader = existing.concat(missing);
  sheet.getRange(1, 1, 1, finalHeader.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  // Store text columns as plain text so Sheets never reinterprets dates, IDs or formulas.
  finalHeader.forEach(function (col, i) {
    if (!NUMBER_COLUMNS[col] && !BOOLEAN_COLUMNS[col]) {
      sheet.getRange(2, i + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    }
  });
}

/**
 * Reads the USERS script property ("username:password, username:password"),
 * creates missing users (the first one listed becomes admin if there is no
 * admin yet) or resets the password of existing ones, then deletes the
 * property so no plain-text password stays anywhere. Callers hold the lock.
 */
function applyUsersProperty_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(PROP.USERS);
  if (!raw) {
    if (!allRecords_('Users').length) console.warn('No users yet: add a USERS script property such as "rony:YourPassword, wife:HerPassword" and run setup() again.');
    return;
  }
  const entries = raw.split(/[,\n]+/).map(function (e) { return e.trim(); }).filter(Boolean);
  let hasAdmin = allRecords_('Users').some(function (u) { return u.role === 'admin'; });
  const done = [];
  entries.forEach(function (entry) {
    const i = entry.indexOf(':');
    if (i < 1) throw new Error('USERS entry "' + entry.split(':')[0] + '" must look like username:password');
    const username = vUsername_(entry.slice(0, i));
    const password = vPassword_(entry.slice(i + 1).trim(), 'Password for ' + username);
    const existing = allRecords_('Users').find(function (u) { return u.username === username; });
    if (existing) {
      updateById_('Users', existing.id, Object.assign({ status: 'active' }, passwordFields_(password)));
      deleteWhere_('Sessions', function (s) { return s.userId === existing.id; });
      done.push(username + ' (password reset)');
    } else {
      createUser_(username, password, username.charAt(0).toUpperCase() + username.slice(1), hasAdmin ? 'member' : 'admin');
      done.push(username + (hasAdmin ? '' : ' (admin)'));
      hasAdmin = true;
    }
  });
  props.deleteProperty(PROP.USERS);
  console.log('Users ready: ' + done.join(', ') + '. The USERS property was deleted; passwords are stored only as hashes.');
}

/** Same as the user part of setup(): apply the USERS property (add users or reset passwords). */
function applyUsers() {
  withLock_(applyUsersProperty_);
}

/** Logs all users (no financial data). */
function listUsers() {
  resetDbCache_();
  allRecords_('Users').forEach(function (u) {
    console.log([u.username, u.displayName, u.status, u.role, u.lockedUntil > nowIso_() ? 'locked' : ''].join(' | '));
  });
}

function enableRegistration() {
  withLock_(function () { setUserSetting_('', 'registrationEnabled', 'true'); });
  console.log('Self-registration enabled: anyone with the site link can create an account.');
}

function disableRegistration() {
  withLock_(function () { setUserSetting_('', 'registrationEnabled', 'false'); });
  console.log('Self-registration disabled: only users created by the administrator can sign in.');
}

/** Removes expired sessions. Optional: attach to a daily time-driven trigger. */
function purgeExpiredSessions() {
  withLock_(function () {
    const now = nowIso_();
    const n = deleteWhere_('Sessions', function (s) { return s.expiresAt < now; });
    console.log('Removed ' + n + ' expired sessions.');
  });
}

/** Signs every user out. */
function revokeAllSessions() {
  withLock_(function () {
    const n = deleteWhere_('Sessions', function () { return true; });
    console.log('Removed ' + n + ' sessions.');
  });
}
