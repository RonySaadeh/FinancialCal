# Financial Cal — Apps Script backend

This folder is the whole backend: a Google Apps Script **Web App** that stores data in a **Google Sheet**. There is no other server or database.

| File | Purpose |
| --- | --- |
| `Code.gs` | `doGet`/`doPost` entry points, the explicit API allow-list (`routes_()`), request validation, error handling |
| `Auth.gs` | Google ID-token verification, sessions, profile, exchange rates, admin user management |
| `Db.gs` | All spreadsheet access: typed rows, per-user filtering, formula escaping, `LockService` wrapper |
| `Validation.gs` | Input validators (amounts, dates, IDs, enums, currencies…) |
| `Calc.gs` | Pure financial calculations (balances, average cost basis, debts, net worth, cash flow) |
| `Accounts.gs`, `Transactions.gs`, `Categories.gs`, `Budgets.gs`, `Goals.gs`, `Debts.gs`, `Investments.gs`, `Dashboard.gs` | Feature handlers |
| `Setup.gs` | `setup()` and admin helpers you run from the editor |
| `Config.gs` | Sheet schema, enums, default categories, constants |
| `appsscript.json` | Manifest: V8 runtime, `Asia/Dubai` time zone, scopes, web-app settings |

## 1. Create a Google OAuth client ID (for "Sign in with Google")

1. Open <https://console.cloud.google.com/>, create (or pick) a project, e.g. `financial-cal`.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and your email. The app only requests `openid email profile`, which are non-sensitive, so no Google verification is needed. While the app is in *Testing*, add your and your family's Gmail addresses as *test users* (or click *Publish app*).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - *Authorized JavaScript origins*: `https://<your-github-username>.github.io` (for this repository `https://ronysaadeh.github.io`) and, for local development, `http://localhost:5173`.
   - No redirect URIs are needed (the button uses popup mode).
4. Copy the **Client ID** (`…apps.googleusercontent.com`). It is public, not a secret.

## 2. Create the spreadsheet and the script

1. In Google Drive create a blank spreadsheet called `Financial Cal Database` and copy its ID from the URL: `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`.
   (Alternatively skip this: `setup()` creates a spreadsheet for you and saves its ID.)
2. Open <https://script.google.com/> → **New project**, name it `Financial Cal API`.
3. Copy the code in, either:
   - **By hand**: in the editor enable *Project Settings → Show "appsscript.json" manifest file*, then create one script file per `.gs` file here (same names, without `.gs`) and paste the contents, and paste `appsscript.json` over the manifest; or
   - **With clasp** (recommended, see below).
4. **Project Settings → Script properties → Add script property**:

   | Property | Value |
   | --- | --- |
   | `SPREADSHEET_ID` | the spreadsheet ID from step 1 (optional if you let `setup()` create one) |
   | `GOOGLE_CLIENT_ID` | the OAuth client ID from section 1 |
   | `ADMIN_EMAILS` | your Google email (comma-separated list allowed) |
   | `INVITE_EMAILS` | other family members' Google emails, e.g. your wife's |

5. In the editor select the function **`setup`** and click **Run**. Google asks for authorization: choose your account → *Advanced* → *Go to Financial Cal API (unsafe)* → *Allow*. (The warning appears because it is your own unverified script.) Scopes requested: Google Sheets (the database) and external requests (to verify Google sign-in tokens).
   `setup()` creates every sheet with headers, formats text columns as plain text, and invites the emails from `ADMIN_EMAILS` / `INVITE_EMAILS`. It is safe to run again at any time (e.g. after changing those properties or upgrading).

## 3. Deploy as a Web App

1. **Deploy → New deployment → ⚙ → Web app**.
2. *Execute as*: **Me**. *Who has access*: **Anyone**.
3. **Deploy** and copy the **Web app URL** ending in `/exec`. This is `VITE_API_URL` for the frontend.

Why "Anyone"? The GitHub Pages site calls the API with `fetch()` from another origin, without Google cookies. With "Anyone with a Google account" Google would answer with a login page instead of JSON. "Anyone" only means the URL is reachable; **every request except `health` and `login` requires a valid Financial Cal session, and every handler only touches the caller's own rows.** The script runs as you, which is why only you need access to the spreadsheet.

Quick check (should return `{"ok":true,"data":{"name":"Financial Cal API",...}}`):

```bash
curl -L "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

And an unauthenticated data request must be refused:

```bash
curl -L -H "Content-Type: text/plain" -d '{"action":"getDashboard"}' "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Expected: `{"ok":false,"error":{"code":"AUTH","message":"Please sign in."}}`.

### Updating the backend later

Edit the code, then **Deploy → Manage deployments → ✏ (edit) → Version: New version → Deploy**. Editing the existing deployment keeps the same `/exec` URL; creating a *new* deployment would give a new URL that you'd have to put into GitHub again.

## Using clasp (optional)

[clasp](https://github.com/google/clasp) syncs this folder with the Apps Script project.

```bash
npm install -g @google/clasp
```

```bash
clasp login
```

Enable the Apps Script API once at <https://script.google.com/home/usersettings>. Then copy the script ID (*Project Settings → IDs → Script ID*) into `apps-script/.clasp.json` (use `.clasp.json.example` as the template; `.clasp.json` is git-ignored), and push:

```bash
npm run clasp:push
```

After pushing, update the deployment as described above (or `npm run clasp:deploy` to create a new version).

## API

All requests are `POST` with `Content-Type: text/plain` and a JSON body:

```json
{ "action": "getTransactions", "token": "<session token>", "payload": { "from": "2026-10-01" } }
```

Responses are always JSON (Apps Script cannot set HTTP status codes):

```json
{ "ok": true, "data": ... }
{ "ok": false, "error": { "code": "VALIDATION", "message": "Amount must be greater than zero." } }
```

Error codes: `AUTH`, `NOT_REGISTERED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `BUSY`, `CONFIG`, `BAD_REQUEST`, `UNKNOWN_ACTION`, `INTERNAL`.

Actions (the complete allow-list is `routes_()` in `Code.gs`; anything else returns `UNKNOWN_ACTION`):

- Auth/profile: `login`, `logout`, `logoutAll`, `getProfile`, `updateProfile`, `setExchangeRate`, `deleteExchangeRate`, `getBootstrap`, `health`
- Dashboard/reports: `getDashboard`, `getReports`
- Accounts: `getAccounts`, `addAccount`, `updateAccount`, `deleteAccount`
- Transactions: `getTransactions`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `recordRecurring`
- Categories: `getCategories`, `addCategory`, `updateCategory`
- Budgets: `getBudgets`, `setBudget`, `deleteBudget`, `copyBudgets`
- Savings goals: `getSavingsGoals`, `addSavingsGoal`, `updateSavingsGoal`, `deleteSavingsGoal`, `addGoalContribution`, `deleteGoalContribution`
- Debts: `getDebts`, `addDebt`, `updateDebt`, `deleteDebt`, `addDebtPayment`, `deleteDebtPayment`
- Investments: `getInvestments`, `addInvestment`, `updateInvestment`, `deleteInvestment`, `addInvestmentTransaction`, `deleteInvestmentTransaction`, `updateInvestmentPrice`, `deletePrice`
- Admin (role `admin` only, user metadata only): `adminListUsers`, `adminInviteUser`, `adminUpdateUser`, `adminSetRegistration`

### Why `text/plain`, and CORS

A `fetch` with `Content-Type: application/json` or an `Authorization` header triggers a CORS preflight (`OPTIONS`), which Apps Script cannot answer. A `text/plain` POST is a "simple request": no preflight; Google redirects (302) to `script.googleusercontent.com`, which serves the `ContentService` output with `Access-Control-Allow-Origin: *`, and the browser follows the redirect. The session token is in the body, so it never appears in URLs or logs.

## Sheets (database schema)

`Users`, `Sessions`, `Accounts`, `Transactions`, `Categories`, `Budgets`, `SavingsGoals`, `GoalContributions`, `Debts`, `DebtPayments`, `Investments`, `InvestmentTransactions`, `PriceHistory`, `AppSettings`. Column lists are in `Config.gs`.

- IDs: `<prefix>_<20 hex>` (e.g. `txn_…`), generated server-side.
- Every financial row has a `userId`; it is always set from the session, never from the request.
- Dates are `yyyy-MM-dd` text, months `yyyy-MM`; timestamps are ISO-8601 UTC. Text columns are formatted as plain text so Sheets doesn't reinterpret them.
- Money is stored as numbers rounded to 2 decimals (quantities/prices up to 8).
- Text starting with `= + - @` is stored with a leading apostrophe so it can never run as a formula.
- `Sessions.tokenHash` is the SHA-256 of the session token; the token itself is never stored.

Please don't edit the sheets by hand while the app is in use; if you do, keep the header row intact.

## Editor helper functions

| Function | What it does |
| --- | --- |
| `setup()` | Creates/upgrades sheets, invites `ADMIN_EMAILS`/`INVITE_EMAILS` |
| `syncInvitedUsers()` | Re-reads `ADMIN_EMAILS`/`INVITE_EMAILS` and invites new addresses |
| `listUsers()` | Logs users (no financial data) |
| `enableRegistration()` / `disableRegistration()` | Toggle self-registration (default: off, invite-only) |
| `purgeExpiredSessions()` | Deletes expired sessions (can be put on a daily time-driven trigger) |
| `revokeAllSessions()` | Signs everyone out |

## Concurrency

Every write runs inside `LockService.getScriptLock()` (15 s timeout) so read-modify-write sequences never interleave; the lock is held only for spreadsheet work. The slow network call that verifies a Google sign-in happens *before* the lock is taken. If the lock can't be acquired the API returns `BUSY` and the client retries once (the write was not applied).

## Testing without Google

`npm test` runs these exact `.gs` files inside Node with in-memory fakes of the Google services (`scripts/gas-harness.mjs`) and checks authentication, two-user data isolation, validation and all financial rules. `npm run dev:backend` serves the same code on `http://localhost:8787` for local UI development.
