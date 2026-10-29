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
