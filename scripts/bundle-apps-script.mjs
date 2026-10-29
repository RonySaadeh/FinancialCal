#!/usr/bin/env node
/**
 * Combines apps-script/*.gs into ONE file, paste-into-apps-script/Code.gs,
 * so the backend can be installed by pasting a single file into the Apps
 * Script editor. Run after changing any .gs file:
 *
 *   npm run bundle
 *
 * A test fails if the bundle is out of date.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Config first (constants), Setup last; handlers are looked up lazily so the rest can be in any order.
export const ORDER = ['Config', 'Util', 'Db', 'Validation', 'Calc', 'Auth', 'Accounts', 'Transactions', 'Categories',
  'Budgets', 'Goals', 'Debts', 'Investments', 'Dashboard', 'Code', 'Setup'];

export function buildBundle() {
  const parts = ORDER.map((name) => {
    const src = readFileSync(join(ROOT, 'apps-script', name + '.gs'), 'utf8').trimEnd();
    return `// ===================================================================== ${name}.gs\n\n${src}\n`;
  });
  return `/**
 * FINANCIAL CAL — BACKEND (single file)
 *
 * HOW TO INSTALL: in the Apps Script editor open Code.gs, delete everything,
 * paste this whole file, and save. Then follow the README steps (USERS
 * property, run setup, deploy).
 *
 * This file is generated from the apps-script/ folder by
 * scripts/bundle-apps-script.mjs — do not edit it by hand.
 */

${parts.join('\n')}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(ROOT, 'paste-into-apps-script'), { recursive: true });
  writeFileSync(join(ROOT, 'paste-into-apps-script', 'Code.gs'), buildBundle());
  console.log('Wrote paste-into-apps-script/Code.gs');
}
