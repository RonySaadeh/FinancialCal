/**
 * Authentication: Google Sign-In ID tokens verified server-side, then an
 * opaque server-side session.
 *
 * Why not Session.getActiveUser()? This web app is deployed "Execute as: Me /
 * Anyone", so the script runs as the owner and getActiveUser() is empty for
 * other visitors. Instead the browser obtains a Google ID token (Google
 * Identity Services) and we verify it with Google's tokeninfo endpoint,
 * checking audience, issuer, expiry and email verification. Users are bound to
 * the token's stable `sub` claim, never to an ID supplied by the frontend.
 *
 * Sessions: a random token (two v4 UUIDs, ~244 random bits) is returned to the browser once. Only its
 * SHA-256 hash is stored in the Sessions sheet, so a leaked spreadsheet does
 * not leak usable sessions.
 */

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/** Verifies a Google ID token and returns the verified identity. */
function verifyGoogleIdToken_(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) {
    throw apiError_('AUTH', 'Missing or malformed Google credential.');
  }
  const clientId = getProp_(PROP.GOOGLE_CLIENT_ID);
  if (!clientId) throw apiError_('CONFIG', 'The backend is not configured: GOOGLE_CLIENT_ID script property is missing.');

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
    muteHttpExceptions: true,
    followRedirects: false
  });
  if (resp.getResponseCode() !== 200) throw apiError_('AUTH', 'Google sign-in could not be verified. Please sign in again.');
  let info;
  try {
    info = JSON.parse(resp.getContentText());
  } catch (e) {
    throw apiError_('AUTH', 'Google sign-in could not be verified.');
  }
  if (info.aud !== clientId) throw apiError_('AUTH', 'This Google credential was not issued for Financial Cal.');
  if (GOOGLE_ISSUERS.indexOf(info.iss) < 0) throw apiError_('AUTH', 'Unexpected credential issuer.');
  if (!(Number(info.exp) * 1000 > Date.now())) throw apiError_('AUTH', 'Your Google sign-in has expired. Please sign in again.');
  if (String(info.email_verified) !== 'true') throw apiError_('AUTH', 'Your Google account email is not verified.');
  if (!info.sub || !info.email) throw apiError_('AUTH', 'Google credential is missing required claims.');
  return { sub: String(info.sub), email: String(info.email).toLowerCase(), name: String(info.name || '') };
}

function registrationEnabled_() {
  const row = allRecords_('AppSettings').find(function (s) { return s.userId === '' && s.key === 'registrationEnabled'; });
  return !!row && row.value === 'true';
}

function publicUser_(user) {
  return {
    id: user.id,
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

/**
 * action: login. Public (no session). The token verification network call
 * happens before taking the lock so slow Google responses do not block writers.
 */
function handleLogin_(ctx, payload) {
  vPayload_(payload, ['idToken', 'userAgent']);
  const identity = verifyGoogleIdToken_(payload.idToken);
  const userAgent = vString_(payload.userAgent, 'userAgent', { max: 300 });

  return withLock_(function () {
    const users = allRecords_('Users');
    let user = users.find(function (u) { return u.googleSub === identity.sub; });
    const now = nowIso_();

    if (!user) {
      const byEmail = users.find(function (u) { return u.email === identity.email; });
      if (byEmail && byEmail.googleSub) {
        // The email now belongs to a different Google account than the one bound earlier.
        throw apiError_('AUTH', 'This email is linked to a different Google account. Ask the administrator for help.');
      }
      if (byEmail) {
        user = updateById_('Users', byEmail.id, { googleSub: identity.sub });
      } else if (registrationEnabled_()) {
        user = insertRecord_('Users', {
          id: newId_('Users'), googleSub: identity.sub, email: identity.email,
          displayName: identity.name || identity.email.split('@')[0], status: 'active', role: 'member',
          preferredCurrency: DEFAULT_CURRENCY, theme: 'system', createdAt: now, updatedAt: now, lastLoginAt: ''
        });
      } else {
        throw apiError_('NOT_REGISTERED', 'This Google account is not registered for Financial Cal. Ask the administrator to invite ' + identity.email + '.');
      }
    }

    if (user.status === 'disabled') throw apiError_('FORBIDDEN', 'This account has been disabled by the administrator.');

    const changes = { lastLoginAt: now };
    if (user.status === 'invited') changes.status = 'active';
    if (!user.displayName) changes.displayName = identity.name || identity.email.split('@')[0];
    user = updateById_('Users', user.id, changes);
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
  });
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
  vPayload_(payload, ['displayName', 'preferredCurrency', 'theme']);
  const changes = {};
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

function handleAdminInviteUser_(ctx, payload) {
  vPayload_(payload, ['email', 'displayName', 'role']);
  const email = vEmail_(payload.email, 'Email');
  const displayName = vString_(payload.displayName, 'Display name', { max: 80 });
  const role = vEnum_(payload.role, 'Role', ENUMS.userRole, { defaultValue: 'member' });
  return publicUser_(inviteUser_(email, displayName, role));
}

/** Creates an invited user that becomes active on first Google sign-in. Callers hold the lock. */
function inviteUser_(email, displayName, role) {
  if (allRecords_('Users').some(function (u) { return u.email === email; })) {
    throw apiError_('CONFLICT', 'A user with this email already exists.');
  }
  const now = nowIso_();
  return insertRecord_('Users', {
    id: newId_('Users'), googleSub: '', email: email, displayName: displayName || email.split('@')[0],
    status: 'invited', role: role, preferredCurrency: DEFAULT_CURRENCY, theme: 'system',
    createdAt: now, updatedAt: now, lastLoginAt: ''
  });
}

function handleAdminUpdateUser_(ctx, payload) {
  vPayload_(payload, ['id', 'status', 'role', 'displayName']);
  const id = vId_(payload.id, 'User ID', 'Users');
  const target = allRecords_('Users').find(function (u) { return u.id === id; });
  if (!target) throw apiError_('NOT_FOUND', 'User not found.');
  const changes = {};
  if (payload.status !== undefined) changes.status = vEnum_(payload.status, 'Status', ['active', 'disabled', 'invited']);
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
