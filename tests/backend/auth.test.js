import { describe, expect, it } from 'vitest';
import { idToken, newEnv, signIn } from './helpers.js';

describe('authentication', () => {
  it('rejects tokens Google does not validate', () => {
    const env = newEnv();
    const res = env.call('login', { idToken: 'not-a-real-google-token-at-all' });
    expect(res).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it.each(['wrong-aud', 'wrong-iss', 'expired', 'unverified'])('rejects a token with %s', (flag) => {
    const env = newEnv();
    const res = env.call('login', { idToken: idToken('111', 'rony@example.com', flag) });
    expect(res).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('refuses unregistered accounts while registration is disabled', () => {
    const env = newEnv();
    const res = env.call('login', { idToken: idToken('999', 'stranger@example.com') });
    expect(res).toMatchObject({ ok: false, error: { code: 'NOT_REGISTERED' } });
    expect(env.rows('Users').map((u) => u.email)).not.toContain('stranger@example.com');
  });

  it('activates an invited user on first sign-in and binds the Google subject', () => {
    const env = newEnv();
    const a = signIn(env, 'sub-rony', 'rony@example.com');
    expect(a.user).toMatchObject({ email: 'rony@example.com', status: 'active', role: 'admin' });
    const row = env.rows('Users').find((u) => u.email === 'rony@example.com');
    expect(row.googleSub).toBe('sub-rony');
    // Default categories are seeded once.
    expect(a.ok('getCategories')).toHaveLength(19);
    signIn(env, 'sub-rony', 'rony@example.com');
    expect(a.ok('getCategories')).toHaveLength(19);
  });

  it('rejects a different Google account claiming an already-bound email', () => {
    const env = newEnv();
    signIn(env, 'sub-rony', 'rony@example.com');
    const res = env.call('login', { idToken: idToken('sub-imposter', 'rony@example.com') });
    expect(res).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('stores only a hash of the session token', () => {
    const env = newEnv();
    const a = signIn(env, 'sub-rony', 'rony@example.com');
    const sessions = env.rows('Sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessions[0].tokenHash).not.toBe(a.token);
    expect(JSON.stringify(env.database().sheets.map((s) => s.data))).not.toContain(a.token);
  });

  it('requires a valid session for data actions', () => {
    const env = newEnv();
    expect(env.call('getDashboard', {})).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(env.call('getDashboard', {}, 'f'.repeat(64))).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('logout invalidates the session immediately; logoutAll signs out every device', () => {
    const env = newEnv();
    const s1 = signIn(env, 'sub-rony', 'rony@example.com');
    const s2 = signIn(env, 'sub-rony', 'rony@example.com');
    expect(s1.call('logout').ok).toBe(true);
    expect(s1.call('getProfile')).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(s2.call('getProfile').ok).toBe(true);
    const s3 = signIn(env, 'sub-rony', 'rony@example.com');
    expect(s3.ok('logoutAll').sessionsRemoved).toBe(2);
    expect(s2.call('getProfile').ok).toBe(false);
    expect(s3.call('getProfile').ok).toBe(false);
  });

  it('lets an admin enable self-registration, and blocks disabled users at once', () => {
    const env = newEnv();
    const admin = signIn(env, 'sub-rony', 'rony@example.com');
    admin.ok('adminSetRegistration', { enabled: true });
    const guest = signIn(env, 'sub-guest', 'guest@example.com');
    expect(guest.user).toMatchObject({ role: 'member', status: 'active' });

    admin.ok('adminUpdateUser', { id: guest.user.id, status: 'disabled' });
    expect(guest.call('getDashboard')).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    expect(env.call('login', { idToken: idToken('sub-guest', 'guest@example.com') })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('keeps admin actions away from members', () => {
    const env = newEnv();
    const wife = signIn(env, 'sub-wife', 'wife@example.com');
    expect(wife.call('adminListUsers')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(wife.call('adminSetRegistration', { enabled: true })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('prevents an admin from disabling themselves', () => {
    const env = newEnv();
    const admin = signIn(env, 'sub-rony', 'rony@example.com');
    expect(admin.call('adminUpdateUser', { id: admin.user.id, status: 'disabled' }).ok).toBe(false);
  });
});

describe('request handling', () => {
  it('only dispatches allow-listed actions', () => {
    const env = newEnv();
    const a = signIn(env, 'sub-rony', 'rony@example.com');
    for (const action of ['setup', 'listForUser_', 'toString', '__proto__', 'constructor', 'deleteWhere_']) {
      expect(env.call(action, {}, a.token)).toMatchObject({ ok: false, error: { code: 'UNKNOWN_ACTION' } });
    }
  });

  it('rejects malformed bodies and payloads', () => {
    const env = newEnv();
    const a = signIn(env, 'sub-rony', 'rony@example.com');
    expect(env.post('not json')).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(env.post('[]')).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(env.call('getTransactions', [1, 2], a.token)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(env.post('x'.repeat(200000))).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('GET returns only a health check', () => {
    const env = newEnv();
    const out = JSON.parse(env.context.doGet({ parameter: { action: 'getDashboard' } }).getContent());
    expect(out).toEqual({ ok: true, data: { name: 'Financial Cal API', version: '1.0.0' } });
  });

  it('hides internal error details', () => {
    const env = newEnv();
    const a = signIn(env, 'sub-rony', 'rony@example.com');
    env.database().getSheetByName('Transactions').getDataRange = () => { throw new Error('secret internal detail'); };
    const res = a.call('getTransactions');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(res.error.message).not.toContain('secret');
  });
});
