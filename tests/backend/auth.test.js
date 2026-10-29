import { describe, expect, it } from 'vitest';
import { newEnv, PASSWORDS, signIn } from './helpers.js';

describe('setup', () => {
  it('creates users from the USERS property, hashes passwords and deletes the plain text', () => {
    const env = newEnv();
    expect(env.properties.has('USERS')).toBe(false);
    const users = env.rows('Users');
    expect(users.map((u) => [u.username, u.role, u.status])).toEqual([['rony', 'admin', 'active'], ['wife', 'member', 'active']]);
    const dump = JSON.stringify(env.database().sheets.map((s) => s.data));
    expect(dump).not.toContain(PASSWORDS.rony);
    expect(dump).not.toContain(PASSWORDS.wife);
    expect(users[0].passwordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(users[0].passwordSalt).toMatch(/^[a-f0-9]{32}$/);
    expect(users[0].passwordSalt).not.toBe(users[1].passwordSalt);
  });

  it('resets a password when setup runs again with an existing username', () => {
    const env = newEnv();
    const old = signIn(env, 'wife');
    env.properties.set('USERS', 'wife:brand-new-pass');
    env.get('setup')();
    expect(old.call('getProfile').ok).toBe(false); // sessions revoked
    expect(env.call('login', { username: 'wife', password: PASSWORDS.wife }).ok).toBe(false);
    expect(signIn(env, 'wife', 'brand-new-pass').user.role).toBe('member');
    expect(env.rows('Users')).toHaveLength(2);
  });

  it('rejects short passwords in USERS', () => {
    const env = newEnv();
    env.properties.set('USERS', 'kid:short');
    expect(() => env.get('setup')()).toThrow(/at least 8/);
  });
});

describe('login', () => {
  it('signs in with the right password and seeds default categories once', () => {
    const env = newEnv();
    const a = signIn(env, 'rony');
    expect(a.user).toMatchObject({ username: 'rony', role: 'admin', status: 'active' });
    expect(a.user).not.toHaveProperty('passwordHash');
    expect(a.ok('getCategories')).toHaveLength(19);
    signIn(env, 'RONY ', PASSWORDS.rony); // usernames are case-insensitive
    expect(a.ok('getCategories')).toHaveLength(19);
  });

  it('gives the same error for a wrong password and an unknown user', () => {
    const env = newEnv();
    const wrong = env.call('login', { username: 'rony', password: 'not-the-password' });
    const unknown = env.call('login', { username: 'nobody', password: 'not-the-password' });
    expect(wrong).toEqual({ ok: false, error: { code: 'AUTH', message: 'Incorrect username or password.' } });
    expect(unknown).toEqual(wrong);
    expect(env.call('login', {}).ok).toBe(false);
  });

  it('locks an account after 5 wrong passwords', () => {
    const env = newEnv();
    for (let i = 0; i < 4; i++) expect(env.call('login', { username: 'wife', password: 'guess-' + i }).error.code).toBe('AUTH');
    expect(env.call('login', { username: 'wife', password: 'guess-5' }).error.code).toBe('LOCKED');
    // Even the right password is refused while locked.
    expect(env.call('login', { username: 'wife', password: PASSWORDS.wife }).error.code).toBe('LOCKED');
    // The other user is unaffected.
    expect(signIn(env, 'rony').user.username).toBe('rony');
  });

  it('stores only a hash of the session token', () => {
    const env = newEnv();
    const a = signIn(env, 'rony');
    const sessions = env.rows('Sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(env.database().sheets.map((s) => s.data))).not.toContain(a.token);
  });

  it('requires a valid session for data actions', () => {
    const env = newEnv();
    expect(env.call('getDashboard', {})).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(env.call('getDashboard', {}, 'f'.repeat(64))).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('logout invalidates the session immediately; logoutAll signs out every device', () => {
    const env = newEnv();
    const s1 = signIn(env, 'rony');
    const s2 = signIn(env, 'rony');
    expect(s1.call('logout').ok).toBe(true);
    expect(s1.call('getProfile')).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(s2.call('getProfile').ok).toBe(true);
    const s3 = signIn(env, 'rony');
    expect(s3.ok('logoutAll').sessionsRemoved).toBe(2);
    expect(s2.call('getProfile').ok).toBe(false);
  });
});

describe('passwords', () => {
  it('changes the password with the current one and signs out other devices', () => {
    const env = newEnv();
    const phone = signIn(env, 'wife');
    const laptop = signIn(env, 'wife');
    expect(laptop.call('changePassword', { currentPassword: 'wrong-pass', newPassword: 'another-pass' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(laptop.call('changePassword', { currentPassword: PASSWORDS.wife, newPassword: 'short' }).ok).toBe(false);
    expect(laptop.ok('changePassword', { currentPassword: PASSWORDS.wife, newPassword: 'another-pass' })).toEqual({ changed: true, otherSessionsSignedOut: 1 });
    expect(laptop.call('getProfile').ok).toBe(true);
    expect(phone.call('getProfile').ok).toBe(false);
    expect(env.call('login', { username: 'wife', password: PASSWORDS.wife }).ok).toBe(false);
    signIn(env, 'wife', 'another-pass');
  });

  it('lets the admin reset a forgotten password', () => {
    const env = newEnv();
    const admin = signIn(env, 'rony');
    const wife = signIn(env, 'wife');
    admin.ok('adminResetPassword', { id: wife.user.id, password: 'reset-by-admin' });
    expect(wife.call('getProfile').ok).toBe(false);
    const again = signIn(env, 'wife', 'reset-by-admin');
    expect(again.call('adminResetPassword', { id: admin.user.id, password: 'hijack-pass' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});

describe('administration', () => {
  it('creates users; registration works only when enabled', () => {
    const env = newEnv();
    const admin = signIn(env, 'rony');
    admin.ok('adminCreateUser', { username: 'kid', password: 'kid-password', displayName: 'Kid' });
    expect(signIn(env, 'kid', 'kid-password').user).toMatchObject({ displayName: 'Kid', role: 'member' });
    expect(admin.call('adminCreateUser', { username: 'kid', password: 'kid-password' })).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    expect(env.call('register', { username: 'guest', password: 'guest-pass' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(env.call('health').data.registrationEnabled).toBe(false);
    admin.ok('adminSetRegistration', { enabled: true });
    expect(env.call('health').data.registrationEnabled).toBe(true);
    const reg = env.call('register', { username: 'guest', password: 'guest-pass', displayName: 'Guest' });
    expect(reg.data.user).toMatchObject({ username: 'guest', role: 'member' });
    expect(env.call('register', { username: 'guest', password: 'guest-pass' }).error.code).toBe('CONFLICT');
  });

  it('blocks disabled users at once', () => {
    const env = newEnv();
    const admin = signIn(env, 'rony');
    const wife = signIn(env, 'wife');
    admin.ok('adminUpdateUser', { id: wife.user.id, status: 'disabled' });
    expect(wife.call('getDashboard')).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(env.call('login', { username: 'wife', password: PASSWORDS.wife })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('keeps admin actions away from members and admins cannot lock themselves out', () => {
    const env = newEnv();
    const wife = signIn(env, 'wife');
    expect(wife.call('adminListUsers')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(wife.call('adminCreateUser', { username: 'x-user', password: 'xxxxxxxx' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const admin = signIn(env, 'rony');
    expect(admin.call('adminUpdateUser', { id: admin.user.id, status: 'disabled' }).ok).toBe(false);
    const list = admin.ok('adminListUsers');
    expect(JSON.stringify(list)).not.toMatch(/passwordHash|passwordSalt/);
  });
});

describe('request handling', () => {
  it('only dispatches allow-listed actions', () => {
    const env = newEnv();
    const a = signIn(env, 'rony');
    for (const action of ['setup', 'applyUsers', 'listForUser_', 'toString', '__proto__', 'constructor', 'deleteWhere_', 'pbkdf2Hex_']) {
      expect(env.call(action, {}, a.token)).toMatchObject({ ok: false, error: { code: 'UNKNOWN_ACTION' } });
    }
  });

  it('rejects malformed bodies and payloads', () => {
    const env = newEnv();
    const a = signIn(env, 'rony');
    expect(env.post('not json')).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(env.post('[]')).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(env.call('getTransactions', [1, 2], a.token)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(env.post('x'.repeat(200000))).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('GET returns only a health check', () => {
    const env = newEnv();
    const out = JSON.parse(env.context.doGet({ parameter: { action: 'getDashboard' } }).getContent());
    expect(out).toEqual({ ok: true, data: { name: 'Financial Cal API', version: '1.0.0', registrationEnabled: false } });
  });

  it('hides internal error details', () => {
    const env = newEnv();
    const a = signIn(env, 'rony');
    env.database().getSheetByName('Transactions').getDataRange = () => { throw new Error('secret internal detail'); };
    const res = a.call('getTransactions');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(res.error.message).not.toContain('secret');
  });
});
