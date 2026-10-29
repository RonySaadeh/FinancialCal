# Financial Cal

A private personal-finance app for a family: dashboard, income & expenses, spending analytics, budgets, savings goals, debts, investments and reports.

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Lucide + Recharts, hosted on **GitHub Pages**.
- **Backend**: **Google Apps Script** Web App (`apps-script/`).
- **Database**: a **Google Sheet** you own.
- **Sign-in**: username + password, checked on the server. Passwords are stored only as salted hashes in your private Sheet.

No Firebase, Supabase or paid services.

---

## How it fits together

```
Browser (GitHub Pages)                    Google Apps Script (runs as you)            Google Sheet
  React app ── POST text/plain JSON ──▶  doPost → allow-listed action  ──────────▶  Users, Accounts,
  username + password ── login ──────▶   1. check password hash / session            Transactions, …
                                          2. validate input
                                          3. read/write ONLY rows where
                                             userId = session user
```

### Login, passwords and data isolation

- You choose the usernames and first passwords **once**, in the private Apps Script settings (script property `USERS`). `setup()` stores them as **PBKDF2-SHA256 salted hashes** in the `Users` sheet and then deletes the plain text.
- Why not a `users.json` file? This repository and the GitHub Pages site are public: anyone could read the file, sign in as you and see your finances. The private Apps Script settings are just as quick to edit and nobody else can see them.
- After 5 wrong passwords an account is locked for 15 minutes. The error never reveals whether a username exists.
- After login the server issues a random session token; only its SHA-256 hash is stored. It's sent in the request body on every call, expires after 14 days, and can be revoked ("Sign out" / "Sign out on all devices"). Changing a password signs out your other devices.
- Forgot a password? The administrator resets it on the **Users** page. Anyone can change their own password on the **Profile** page.
- Every handler gets the user from the session, never from the request. All reads and writes filter by that user ID; another user's record IDs behave exactly like non-existent IDs. A `userId` field in a request is rejected outright.
- Admins can create accounts, reset passwords and disable people, but there is no API to read another person's finances.

**Limitation (by design):** the person who owns the Google Sheet and the Apps Script project (the administrator) can open the spreadsheet directly and see every user's rows. Isolation is enforced for everyone using the app, not against the sheet owner. For a family this is usually fine; if not, each person can run their own copy.

### Accounting rules (no double counting)

- Account balance = opening balance + income − expenses ± transfers. Balances are always derived, never stored.
- Transfers (including paying a credit card) are never income or expenses. A credit-card purchase is one expense on the card account; paying the card is a transfer.
- Debt repayments are stored as separate events. The **principal** reduces the debt (and, if paid from an account, leaves it as a transfer); the **interest** is an expense. The debt is reduced once, by the repayment record only.
- Credit-card balances owed come from credit-card accounts and are shown on the Debts page, not stored again as debts.
- Investment trades live apart from expenses. A buy paid from an account is a transfer out of that account; the holding's market value is counted in assets. Sales bring cash back as a transfer and realise profit/loss.
- **Cost basis: weighted average cost.** Buy fees are added to cost; a sale realises `(price × qty − fees) − average cost × qty`. Overselling is rejected.
- Investment prices are only ever what you entered (or a recorded trade price). Prices older than 7 days are labelled **Outdated**. Nothing is fetched or invented.
- Savings goals are earmarks on money already in your accounts; they are never added to assets again.
- Net worth = account balances (positive ones are assets, negative ones such as card debt are liabilities) + investment market value − debts outstanding.
- **Currencies:** AED by default; each user picks a preferred currency. Different currencies are never added together: other currencies are converted only with exchange rates you enter in your profile. If a rate is missing, those amounts are left out of totals and the page tells you which currencies were left out.

---

## Setup — step by step

You'll need: your Google account (the administrator), this GitHub repository, and ~15 minutes.

### Step 1 — Google Sheet + Apps Script

Follow [`apps-script/README.md` § 1](apps-script/README.md#1-create-the-spreadsheet-and-the-script): create the spreadsheet, create the script project, paste the files (or `clasp push`), set the `SPREADSHEET_ID` and `USERS` script properties, run `setup()`.

Example `USERS` value: `rony:Choose-A-Strong-Pass, wife:Her-Own-Pass-123` (you are the admin because you're listed first).

### Step 2 — Deploy the Web App

Follow [`apps-script/README.md` § 2](apps-script/README.md#2-deploy-as-a-web-app): *Execute as Me*, *Who has access: Anyone*, copy the `/exec` URL, and open it in a browser to check it answers.

### Step 3 — Configure and deploy GitHub Pages

1. In GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables tab → New repository variable**: name `VITE_API_URL`, value = the `/exec` URL from step 2.
3. Merge to `main` (or run the workflow manually from the **Actions** tab). The workflow `.github/workflows/deploy.yml` installs dependencies, type-checks, runs the tests, builds and deploys `dist/`.
4. Open `https://ronysaadeh.github.io/FinancialCal/`.

The Vite base path is `/<repository-name>/` (set by the workflow). For a custom domain set `VITE_BASE_PATH=/`. Routing uses URL hashes (`…/FinancialCal/#/transactions`), so refreshing any page works on GitHub Pages.

### Step 4 — Sign in

1. Open the site and sign in with your username and password. Default categories are created on first sign-in.
2. Your wife signs in with hers on her own device. Her data is completely separate.
3. Change your password any time on **Profile**. Add people or reset passwords on **Users** (admins only).
4. Start on **Accounts**: add your bank, cash, savings and credit-card accounts with their current balances, then record transactions.

### Verifying the deployed app

The automated tests run the real backend code with simulated Google services; they cannot reach your Google account. After deploying, check in the browser (DevTools → Network) that signing in works from the GitHub Pages site (a `login` POST to `script.google.com` returns `"ok":true`), that the dashboard loads with no CORS errors in the console, and that the second user sees an empty, separate dashboard.

If you get "unexpected response", the deployment's access isn't set to *Anyone*. If login says "Incorrect username or password" for everyone, check that `setup()` ran after you added `USERS` (the Execution log lists the users it created).

### Updating

- **Frontend**: push to `main`; GitHub Actions redeploys automatically.
- **Backend**: update the `.gs` files (`npm run clasp:push`), then *Deploy → Manage deployments → Edit → New version*. Keep the same deployment so the URL doesn't change.

---

## Local development

```bash
npm install
```

Run the dev backend (the real `.gs` code in Node, in-memory Google fakes, data saved to `.dev-data/`) in one terminal:

```bash
npm run dev:backend
```

And the frontend in another:

```bash
npm run dev:local
```

Open <http://localhost:5173> and sign in as `rony` / `rony-password` (admin) or `wife` / `wife-password`.

To use the real backend locally instead, copy `.env.example` to `.env.local`, fill in `VITE_API_URL`, and run `npm run dev`.

### Checks

```bash
npm run typecheck
```

```bash
npm test
```

`npm test` covers financial calculations (frontend and backend), API validation, the action allow-list, login, password hashing, lockout, password change/reset, session revocation, formula escaping, and two-user data isolation.

With both dev servers running on a fresh `.dev-data/`, the browser end-to-end test drives the UI as two users (needs Playwright + Chromium):

```bash
npm run test:e2e
```

## Project structure

```
apps-script/           Apps Script backend (.gs files, manifest, backend README)
src/
  components/ui/       Buttons, cards, forms, modals, states
  components/charts/   Recharts wrappers (validated colour palette, tooltips, legends)
  components/layout/   Sidebar layout, quick-add
  features/            Auth, theme, shared finance context, transaction form
  lib/                 API client, queries, calculations (analytics, dates, currency, recurring, CSV)
  pages/               Routes: Dashboard, Transactions, Spending, Accounts, Budgets, Goals,
                       Debts, Investments, Reports, Categories, Profile, Users (admin)
scripts/               gas-harness (Apps Script emulator), dev-backend
tests/backend/         Backend tests (auth, isolation, finance)
tests/e2e/             Browser smoke test
.github/workflows/     GitHub Pages deployment
```

## Limits worth knowing

- Apps Script calls take ~1–3 s; the app caches data and shows loading states.
- Apps Script quotas (consumer accounts): 6 min per execution, 30 simultaneous executions — far above family use. Login takes a little longer than other requests because of password hashing.
- Google Sheets comfortably handles tens of thousands of rows; every request reads the user's sheets in full, so very large histories will get slower.
- The session token is stored in `localStorage` so you stay signed in. A Content-Security-Policy restricts scripts to this site to reduce XSS risk. Passwords themselves are never stored in the browser. Use "Sign out on all devices" if a device is lost.
- CSV exports only contain the signed-in user's data (the backend never returns anyone else's rows).
