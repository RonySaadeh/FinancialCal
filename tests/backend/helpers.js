import { createGasEnvironment } from '../../scripts/gas-harness.mjs';

export const TODAY = '2026-10-15';
export const PASSWORDS = { rony: 'rony-secret-1', wife: 'wife-secret-1' };

export function newEnv(extraProps = {}) {
  const env = createGasEnvironment({
    quiet: true,
    today: () => TODAY,
    properties: {
      USERS: `rony:${PASSWORDS.rony}, wife:${PASSWORDS.wife}`,
      ...extraProps
    }
  });
  env.get('setup')();
  return env;
}

/** Signs in and returns a small client bound to that session. */
export function signIn(env, username, password = PASSWORDS[username]) {
  const res = env.call('login', { username, password });
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
