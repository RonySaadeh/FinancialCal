import { createGasEnvironment } from '../../scripts/gas-harness.mjs';

export const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
export const TODAY = '2026-10-15';

/**
 * Fake Google tokeninfo. Test ID tokens look like
 * "idtoken-for-tests|<sub>|<email>[|flag]" where flag simulates a bad token.
 */
export function fakeTokenInfo(idToken) {
  const [prefix, sub, email, flag] = idToken.split('|');
  if (prefix !== 'idtoken-for-tests') return null;
  return {
    aud: flag === 'wrong-aud' ? 'someone-else' : CLIENT_ID,
    iss: flag === 'wrong-iss' ? 'evil.example.com' : 'https://accounts.google.com',
    exp: String(Math.floor(Date.now() / 1000) + (flag === 'expired' ? -10 : 3600)),
    email_verified: flag === 'unverified' ? 'false' : 'true',
    sub,
    email,
    name: email.split('@')[0]
  };
}

export function idToken(sub, email, flag) {
  return ['idtoken-for-tests', sub, email, flag].filter(Boolean).join('|');
}

export function newEnv(extraProps = {}) {
  const env = createGasEnvironment({
    quiet: true,
    today: () => TODAY,
    tokenInfo: fakeTokenInfo,
    properties: {
      GOOGLE_CLIENT_ID: CLIENT_ID,
      ADMIN_EMAILS: 'rony@example.com',
      INVITE_EMAILS: 'wife@example.com',
      ...extraProps
    }
  });
  env.get('setup')();
  return env;
}

/** Signs in and returns a small client bound to that session. */
export function signIn(env, sub, email) {
  const res = env.call('login', { idToken: idToken(sub, email) });
  if (!res.ok) throw new Error('login failed: ' + JSON.stringify(res.error));
  const token = res.data.token;
  const client = {
    token,
    user: res.data.user,
    call: (action, payload) => env.call(action, payload, token),
    ok(action, payload) {
      const r = env.call(action, payload, token);
      if (!r.ok) throw new Error(action + ' failed: ' + JSON.stringify(r.error));
      return r.data;
    },
    category(name) {
      return client.ok('getCategories').find((c) => c.name === name);
    }
  };
  return client;
}
