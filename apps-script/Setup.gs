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

  const names = allRecords_('Users').map(function (u) { return u.username + (u.role === 'admin' ? ' (admin)' : ''); });
  console.log('Setup complete. Database spreadsheet: ' + ss.getUrl());
  console.log(names.length ? 'Accounts that can sign in: ' + names.join(', ') : 'No accounts yet: add the USERS script property and run setup again.');
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
