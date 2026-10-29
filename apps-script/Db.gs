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
