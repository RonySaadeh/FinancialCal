#!/usr/bin/env node
/**
 * Local development backend: serves the real Apps Script code (apps-script/*.gs)
 * over HTTP using in-memory fakes of Google services (see gas-harness.mjs).
 *
 *   npm run dev:backend            # http://localhost:8787
 *   VITE_API_URL=http://localhost:8787 VITE_DEV_AUTH=true npm run dev
 *
 * Sign-in: instead of Google, it accepts the development token "dev|<email>"
 * produced by the dev sign-in form. This token format is only understood
 * here; the deployed Apps Script verifies every token with Google.
 *
 * Data is kept in .dev-data/db.json so it survives restarts. Never point this
 * at real financial data — it is for development and testing only.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGasEnvironment } from './gas-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, '.dev-data');
const DATA_FILE = join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 8787);
const CLIENT_ID = 'dev-client-id';

const env = createGasEnvironment({
  quiet: false,
  properties: {
    GOOGLE_CLIENT_ID: CLIENT_ID,
    ADMIN_EMAILS: process.env.DEV_ADMIN_EMAILS || 'rony@example.com',
    INVITE_EMAILS: process.env.DEV_INVITE_EMAILS || 'wife@example.com'
  },
  tokenInfo(idToken) {
    const m = /^dev\|([^\s@|]+@[^\s@|]+\.[^\s@|]+)$/.exec(idToken);
    if (!m) return null;
    const email = m[1].toLowerCase();
    return {
      aud: CLIENT_ID, iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600),
      email_verified: 'true', sub: 'dev-' + email, email, name: email.split('@')[0].replace(/[._-]/g, ' ')
    };
  }
});

// Restore or initialise the in-memory spreadsheet.
if (existsSync(DATA_FILE)) {
  const saved = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const ss = env.get('SpreadsheetApp').create('Financial Cal Database');
  ss.sheets = [];
  for (const [name, data] of Object.entries(saved.sheets)) ss.insertSheet(name).data = data;
  env.properties.set('SPREADSHEET_ID', ss.getId());
}
env.get('setup')();

function persist() {
  mkdirSync(DATA_DIR, { recursive: true });
  const ss = env.database();
  writeFileSync(DATA_FILE, JSON.stringify({ sheets: Object.fromEntries(ss.sheets.map((s) => [s.name, s.data])) }));
}
persist();

const server = createServer((req, res) => {
  // Mirrors the deployed web app: responses are readable cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET') {
    res.end(env.context.doGet().getContent());
    return;
  }
  if (req.method !== 'POST') {
    // Apps Script cannot answer preflights either; the client must not trigger one.
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'Only GET and POST are supported.' } }));
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const out = env.context.doPost({ postData: { contents: body, type: req.headers['content-type'] || '' } });
    persist();
    // Small delay to make loading states visible, like the real backend.
    setTimeout(() => res.end(out.getContent()), Number(process.env.DEV_LATENCY_MS || 150));
  });
});

server.listen(PORT, () => {
  console.log(`Financial Cal dev backend on http://localhost:${PORT}`);
  console.log('Invited users: ' + env.properties.get('ADMIN_EMAILS') + ' (admin), ' + env.properties.get('INVITE_EMAILS'));
});
