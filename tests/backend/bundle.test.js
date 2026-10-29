import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/bundle-apps-script.mjs';
import { createGasEnvironment } from '../../scripts/gas-harness.mjs';

const BUNDLE = join(import.meta.dirname, '..', '..', 'paste-into-apps-script', 'Code.gs');

describe('single-file backend (paste-into-apps-script/Code.gs)', () => {
  it('is up to date with apps-script/*.gs (run `npm run bundle` if this fails)', () => {
    expect(readFileSync(BUNDLE, 'utf8')).toBe(buildBundle());
  });

  it('works on its own: setup, login, isolation', () => {
    const env = createGasEnvironment({ quiet: true, files: [BUNDLE], properties: { USERS: 'rony:rony-secret-1, wife:wife-secret-1' } });
    env.get('setup')();
    const a = env.call('login', { username: 'rony', password: 'rony-secret-1' }).data.token;
    const b = env.call('login', { username: 'wife', password: 'wife-secret-1' }).data.token;
    const acc = env.call('addAccount', { name: 'Bank', type: 'bank', openingBalance: 100 }, a);
    expect(acc.ok).toBe(true);
    expect(env.call('getAccounts', {}, b).data).toEqual([]);
    expect(env.call('updateAccount', { id: acc.data.id, name: 'x' }, b).ok).toBe(false);
    expect(env.call('getDashboard', {}, a).data.kpis.cashBalance).toBe(100);
  });
});
