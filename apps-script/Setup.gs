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
    syncInvitedUsersInternal_();
  });

  console.log('Setup complete. Spreadsheet: ' + ss.getUrl());
  if (!props.getProperty(PROP.GOOGLE_CLIENT_ID)) {
    console.warn('GOOGLE_CLIENT_ID script property is not set yet. Sign-in will fail until it is.');
  }
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

/** Invites the emails listed in the ADMIN_EMAILS / INVITE_EMAILS script properties. */
function syncInvitedUsers() {
  withLock_(syncInvitedUsersInternal_);
}

function syncInvitedUsersInternal_() {
  const parse = function (key) {
    return (getProp_(key) || '').split(/[,;\s]+/).map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);
  };
  const admins = parse(PROP.ADMIN_EMAILS);
  const members = parse(PROP.INVITE_EMAILS);
  const invite = function (email, role) {
    const existing = allRecords_('Users').find(function (u) { return u.email === email; });
    if (!existing) {
      inviteUser_(email, '', role);
      console.log('Invited ' + email + ' as ' + role);
    } else if (role === 'admin' && existing.role !== 'admin') {
      updateById_('Users', existing.id, { role: 'admin' });
      console.log('Promoted ' + email + ' to admin');
    }
  };
  admins.forEach(function (e) { invite(e, 'admin'); });
  members.forEach(function (e) { if (admins.indexOf(e) < 0) invite(e, 'member'); });
}

/** Logs all users (no financial data). */
function listUsers() {
  resetDbCache_();
  allRecords_('Users').forEach(function (u) {
    console.log([u.email, u.displayName, u.status, u.role, u.googleSub ? 'linked' : 'not yet signed in'].join(' | '));
  });
}

function enableRegistration() {
  withLock_(function () { setUserSetting_('', 'registrationEnabled', 'true'); });
  console.log('Self-registration enabled: any verified Google account can create a Financial Cal account.');
}

function disableRegistration() {
  withLock_(function () { setUserSetting_('', 'registrationEnabled', 'false'); });
  console.log('Self-registration disabled: only invited users can sign in.');
}

/** Removes expired sessions. Optional: attach to a daily time-driven trigger. */
function purgeExpiredSessions() {
  withLock_(function () {
    const now = nowIso_();
    const n = deleteWhere_('Sessions', function (s) { return s.expiresAt < now; });
    console.log('Removed ' + n + ' expired sessions.');
  });
}

/** Signs every user out (e.g. after rotating GOOGLE_CLIENT_ID). */
function revokeAllSessions() {
  withLock_(function () {
    const n = deleteWhere_('Sessions', function () { return true; });
    console.log('Removed ' + n + ' sessions.');
  });
}
