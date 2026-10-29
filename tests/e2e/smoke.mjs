#!/usr/bin/env node
/**
 * End-to-end smoke test of the real UI against the local dev backend.
 *
 *   npm run dev:backend   (fresh .dev-data)
 *   VITE_API_URL=http://localhost:8787 VITE_DEV_AUTH=true npm run dev
 *   node tests/e2e/smoke.mjs [screenshotDir]
 *
 * Signs in as two independent users and checks that each sees only their own
 * data, exercising every page along the way. Requires Playwright + Chromium.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(require.resolve('playwright', { paths: ['/usr/lib/node_modules', '/usr/local/lib/node_modules'] }));
}

const BASE = process.env.APP_URL || 'http://localhost:5173/';
const SHOTS = process.argv[2] || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function signIn(browser, email, theme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${email}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${email}] pageerror ${e.message}`));
  await page.goto(BASE);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }).waitFor();
  return { ctx, page };
}

async function go(page, hash, heading) {
  await page.goto(BASE + '#' + hash);
  await page.getByRole('heading', { name: heading, level: 1 }).waitFor();
}

/** Selects the first option whose visible text contains `text`. */
async function selectByText(select, text) {
  const value = await select.evaluate((el, t) => [...el.options].find((o) => o.text.includes(t))?.value, text);
  if (value === undefined) throw new Error('No option containing ' + text);
  await select.selectOption(value);
}

async function modalSubmit(page, buttonName) {
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: buttonName }).click();
  await dialog.waitFor({ state: 'detached' }).catch(() => {});
  await page.locator('dialog[open]').waitFor({ state: 'hidden', timeout: 10000 });
}

const browser = await playwright.chromium.launch();
try {
  console.log('User A (rony@example.com)');
  const { page: a } = await signIn(browser, 'rony@example.com');
  await shot(a, '01-dashboard-empty');
  assert(await a.getByText('Welcome to Financial Cal').isVisible(), 'new user sees onboarding empty state');

  // Accounts
  await go(a, '/accounts', 'Accounts');
  for (const [name, type, opening] of [['Main Bank', 'bank', '20000'], ['Visa Card', 'credit_card', '0'], ['Savings', 'savings', '5000']]) {
    await a.getByRole('button', { name: 'Add account' }).first().click();
    const d = a.locator('dialog[open]');
    await d.getByLabel('Account name').fill(name);
    await d.getByLabel('Type').selectOption(type);
    await d.getByLabel('Opening balance').fill(opening);
    await d.getByLabel('Opening date').fill('2026-01-01');
    await modalSubmit(a, 'Add account');
  }
  await a.getByText('Main Bank').waitFor();
  assert(await a.getByText('AED 20,000.00').first().isVisible(), 'bank account shows opening balance');

  // Transactions via the global quick-add button
  const addTxn = async ({ type, amount, account, category, toAccount, description, date }) => {
    await a.getByRole('button', { name: 'Add transaction' }).first().click();
    const d = a.locator('dialog[open]');
    await d.getByRole('radio', { name: type }).click();
    await d.getByLabel(/^Amount/).fill(amount);
    await d.getByLabel('Date').fill(date);
    await selectByText(d.getByLabel(type === 'Transfer' ? 'From account' : 'Account'), account);
    if (toAccount) await selectByText(d.getByLabel('To account'), toAccount);
    if (category) await d.getByLabel('Category').selectOption({ label: category });
    await d.getByLabel('Description').fill(description);
    await modalSubmit(a, 'Add transaction');
  };
  const today = new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const thisMonth = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  await addTxn({ type: 'Income', amount: '15000', account: 'Main Bank', category: 'Salary', description: 'Salary', date: thisMonth });
  await addTxn({ type: 'Expense', amount: '650', account: 'Main Bank', category: 'Groceries', description: 'Carrefour', date: thisMonth });
  await addTxn({ type: 'Expense', amount: '1200', account: 'Visa Card', category: 'Shopping', description: 'Laptop bag', date: thisMonth });
  await addTxn({ type: 'Transfer', amount: '1200', account: 'Main Bank', toAccount: 'Visa Card', description: 'Pay Visa', date: thisMonth });
  await addTxn({ type: 'Expense', amount: '300', account: 'Main Bank', category: 'Restaurants', description: 'Dinner', date: thisMonth });

  await go(a, '/transactions', 'Transactions');
  await a.getByText('Carrefour').waitFor();
  await a.getByPlaceholder(/Search description/).fill('dinner');
  assert(await a.getByText('1 transaction ·').isVisible(), 'search filters transactions');
  await a.getByPlaceholder(/Search description/).fill('');
  await a.getByLabel('Type').selectOption('transfer');
  assert(await a.getByText('Pay Visa').isVisible(), 'type filter shows transfers');
  await a.getByRole('button', { name: 'Clear filters' }).click();
  // Edit
  await a.getByRole('row', { name: /Dinner/ }).getByRole('button', { name: 'Edit transaction' }).click();
  await a.locator('dialog[open]').getByLabel(/^Amount/).fill('350');
  await modalSubmit(a, 'Save changes');
  await a.getByText('−AED 350.00').waitFor();
  assert(true, 'edit transaction updates amount');
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Export CSV' }).click()]);
  assert(download.suggestedFilename().endsWith('.csv'), 'transactions CSV export downloads');
  await shot(a, '02-transactions');

  // Budgets
  await go(a, '/budgets', 'Budgets');
  const groceriesBudget = a.getByLabel(/Groceries budget for/);
  await groceriesBudget.fill('1000');
  await groceriesBudget.press('Enter');
  await a.getByText(/65% · AED 350.00 left/).waitFor();
  assert(true, 'budget shows spent and remaining');
  await shot(a, '03-budgets');

  // Goals
  await go(a, '/goals', 'Savings goals');
  await a.getByRole('button', { name: 'New goal' }).click();
  let d = a.locator('dialog[open]');
  await d.getByLabel('Goal name').fill('Emergency fund');
  await d.getByLabel('Target amount').fill('30000');
  await d.getByLabel('Already saved').fill('5000');
  await modalSubmit(a, 'Create goal');
  await a.getByRole('button', { name: 'Add / withdraw' }).click();
  d = a.locator('dialog[open]');
  await d.getByLabel(/Amount \(AED\)/).fill('2500');
  await modalSubmit(a, 'Save');
  await a.getByText('AED 7,500.00').first().waitFor();
  assert(true, 'goal contribution updates saved amount');

  // Debts
  await go(a, '/debts', 'Debts');
  await a.getByRole('button', { name: 'Add debt' }).first().click();
  d = a.locator('dialog[open]');
  await d.getByLabel('Name').fill('Car loan');
  await d.getByLabel('Type').selectOption('car_loan');
  await d.getByLabel('Original principal').fill('60000');
  await d.getByLabel('Balance when you start tracking').fill('40000');
  await d.getByLabel('Interest rate (% per year)').fill('4');
  await d.getByLabel('Minimum monthly payment').fill('2000');
  await d.getByLabel('Due day of month').fill('28');
  await d.getByLabel('Tracking start date').fill('2026-01-01');
  await modalSubmit(a, 'Add debt');
  await a.getByRole('button', { name: 'Record repayment' }).click();
  d = a.locator('dialog[open]');
  await d.getByLabel(/Total paid/).fill('2000');
  await d.getByLabel('Of which interest').fill('150');
  await modalSubmit(a, 'Record repayment');
  await a.getByText('AED 38,150.00').first().waitFor();
  assert(true, 'repayment reduces outstanding by principal only (40,000 − 1,850)');
  await shot(a, '04-debts');

  // Investments
  await go(a, '/investments', 'Investments');
  await a.getByRole('button', { name: 'Add holding' }).first().click();
  d = a.locator('dialog[open]');
  await d.getByLabel('Asset name').fill('S&P 500 ETF');
  await d.getByLabel('Ticker (optional)').fill('VOO');
  await d.getByLabel('Asset type').selectOption('etf');
  await modalSubmit(a, 'Add holding');
  await a.getByRole('button', { name: 'Record trade', exact: true }).click();
  d = a.locator('dialog[open]');
  await d.getByLabel('Quantity').fill('10');
  await d.getByLabel(/Price per unit/).fill('100');
  await d.getByLabel('Fees').fill('5');
  await selectByText(d.getByLabel(/Paid from cash account/), 'Main Bank');
  await modalSubmit(a, 'Save trade');
  await a.getByRole('button', { name: 'Update S&P 500 ETF price' }).click();
  d = a.locator('dialog[open]');
  await d.getByLabel(/Price per unit/).fill('110');
  await modalSubmit(a, 'Save price');
  await a.getByText('AED 1,100.00').first().waitFor();
  assert(await a.getByText('+AED 95.00').first().isVisible(), 'unrealised P/L = 1,100 − 1,005');
  await a.getByRole('button', { name: /^S&P 500 ETF/ }).click();
  assert(await a.getByText('Manual price history').isVisible(), 'holding expands to trades and prices');
  await shot(a, '05-investments');

  // Dashboard numbers
  await go(a, '/', /Good (morning|afternoon|evening)/);
  // Cached data renders first while fresh data loads; wait for the refreshed figures.
  await a.getByText('AED 34,795.00').first().waitFor({ timeout: 15000 }).catch(() => {});
  const text = await a.locator('main').innerText();
  // Cash: bank 20000 +15000 −650 −1200 −350 −1850 −150 −1005 = 29795 ; savings 5000 → 34795
  assert(text.includes('AED 34,795.00'), 'cash balance accounts for every flow exactly once');
  assert(text.includes('AED 15,000.00'), 'monthly income shown');
  // Expenses: 650 + 1200 + 350 + 150 interest = 2350 (card repayment & principal & investment excluded)
  assert(text.includes('AED 2,350.00'), 'monthly expenses exclude transfers, repayments and investments');
  // Net worth: 34795 + 1100 (investments) − 38150 (loan) = −2255
  assert(text.includes('-AED 2,255.00') || text.includes('−AED 2,255.00'), 'net worth = accounts + investments − debts');
  await shot(a, '06-dashboard');

  // Spending analytics + category drill-down
  await go(a, '/spending', 'Spending');
  await a.getByRole('button', { name: /^Shopping/ }).first().click();
  const modal = a.locator('dialog[open]');
  await modal.getByText('Laptop bag').waitFor({ timeout: 5000 });
  assert(true, 'clicking a category opens its transactions');
  await modal.getByRole('button', { name: 'Close' }).click();
  await a.getByRole('radio', { name: 'Year' }).click();
  await a.getByRole('radio', { name: 'Quarter' }).click();
  await a.getByRole('radio', { name: 'Custom' }).click();
  await a.getByRole('radio', { name: 'Month' }).click();
  assert(await a.getByText('Insights').isVisible(), 'insights render');
  await shot(a, '07-spending');

  // Categories: rename keeps history
  await go(a, '/categories', 'Categories');
  await a.getByRole('button', { name: 'Edit Restaurants' }).click();
  await a.locator('dialog[open]').getByLabel('Name').fill('Dining out');
  await modalSubmit(a, 'Save');
  await go(a, '/transactions', 'Transactions');
  assert(await a.getByRole('cell', { name: 'Dining out' }).isVisible(), 'renamed category shows on existing transactions');

  await go(a, '/reports', 'Reports');
  await a.getByText('Monthly summary').waitFor();
  await shot(a, '08-reports');
  await go(a, '/profile', 'Profile');
  await a.getByLabel('1 USD in AED').fill('3.6725');
  await a.getByRole('button', { name: 'Save rate' }).click();
  await a.getByText('1 USD = 3.6725 AED').waitFor();
  assert(true, 'exchange rate saved');
  await shot(a, '09-profile');
  await go(a, '/admin', 'Users');
  assert(await a.getByText('wife@example.com').isVisible(), 'admin sees invited user (metadata only)');

  // Deep link refresh works with hash routing
  await a.goto(BASE + '#/investments');
  await a.reload();
  await a.getByRole('heading', { name: 'Investments', level: 1 }).waitFor();
  assert(true, 'refreshing a nested route works (hash routing)');

  console.log('User B (wife@example.com)');
  const { page: b, ctx: bctx } = await signIn(browser, 'wife@example.com', 'dark');
  assert(await b.getByText('Welcome to Financial Cal').isVisible(), 'second user starts empty');
  const bText = await b.locator('main').innerText();
  assert(!bText.includes('34,795') && !bText.includes('Carrefour'), 'second user cannot see first user data on dashboard');
  await shot(b, '10-user-b-dark');
  await go(b, '/transactions', 'Transactions');
  assert(await b.getByText('No transactions yet').waitFor({ timeout: 10000 }).then(() => true, () => false), 'second user has no transactions');
  await go(b, '/investments', 'Investments');
  assert(await b.getByText('No investments yet').waitFor({ timeout: 10000 }).then(() => true, () => false), 'second user has no investments');
  await b.goto(BASE + '#/admin');
  await b.getByRole('heading', { level: 1 }).waitFor();
  assert(!(await b.getByRole('heading', { name: 'Users', level: 1 }).isVisible()), 'member cannot open admin page');
  // Mobile layout
  await b.setViewportSize({ width: 390, height: 844 });
  await go(b, '/', /Good (morning|afternoon|evening)/);
  await b.getByRole('button', { name: 'Open menu' }).click();
  await b.getByRole('link', { name: 'Budgets' }).click();
  await b.getByRole('heading', { name: 'Budgets', level: 1 }).waitFor();
  assert(true, 'mobile menu navigation works');
  await shot(b, '11-mobile');

  // Sign out invalidates the session
  await b.setViewportSize({ width: 1440, height: 1000 });
  await b.getByRole('button', { name: 'Sign out' }).click();
  await b.getByRole('button', { name: 'Sign in' }).waitFor();
  assert(true, 'sign out returns to login');
  await bctx.close();

  const relevant = errors.filter((e) => !/favicon|fonts\.googleapis|Failed to load resource/.test(e));
  assert(relevant.length === 0, 'no console errors' + (relevant.length ? ': ' + relevant.join('\n') : ''));
  console.log('\nE2E smoke test passed');
} catch (err) {
  console.error(err);
  console.error('Console errors so far:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
