/**
 * Financial Cal — Apps Script Web App entry point.
 *
 * Transport: the browser sends POST requests with Content-Type text/plain and
 * a JSON body { action, token, payload }. text/plain keeps the request a CORS
 * "simple request" (no preflight, which Apps Script cannot answer). The
 * session token travels in the body, never in the URL, so it does not end up
 * in logs or browser history. Apps Script always answers HTTP 200, so the
 * JSON body carries { ok, data } or { ok: false, error: { code, message } }.
 *
 * Only actions listed in routes_() can be called. Every route except `login`,
 * `register` and `health` requires a valid session; handlers receive the authenticated
 * user from the session, never from the request payload.
 */

/**
 * The explicit API allowlist.
 *  write: runs inside the script lock (read-modify-write)
 *  auth:  false only for public actions
 *  admin: requires role=admin
 *
 * Built on first use because Apps Script evaluates files one after another,
 * so handlers defined in later files do not exist yet at load time.
 */
let ROUTES_ = null;

function routes_() {
  if (ROUTES_) return ROUTES_;
  ROUTES_ = {
    health: { handler: handleHealth_, auth: false },
    login: { handler: handleLogin_, auth: false },
    register: { handler: handleRegister_, auth: false },
    changePassword: { handler: handleChangePassword_, write: true },
    logout: { handler: handleLogout_, write: true },
    logoutAll: { handler: handleLogoutAll_, write: true },

    getBootstrap: { handler: handleGetBootstrap_ },
    getProfile: { handler: handleGetProfile_ },
    updateProfile: { handler: handleUpdateProfile_, write: true },
    setExchangeRate: { handler: handleSetExchangeRate_, write: true },
    deleteExchangeRate: { handler: handleDeleteExchangeRate_, write: true },

    getDashboard: { handler: handleGetDashboard_ },
    getReports: { handler: handleGetReports_ },

    getAccounts: { handler: handleGetAccounts_ },
    addAccount: { handler: handleAddAccount_, write: true },
    updateAccount: { handler: handleUpdateAccount_, write: true },
    deleteAccount: { handler: handleDeleteAccount_, write: true },

    getTransactions: { handler: handleGetTransactions_ },
    addTransaction: { handler: handleAddTransaction_, write: true },
    updateTransaction: { handler: handleUpdateTransaction_, write: true },
    deleteTransaction: { handler: handleDeleteTransaction_, write: true },
    recordRecurring: { handler: handleRecordRecurring_, write: true },

    getCategories: { handler: handleGetCategories_ },
    addCategory: { handler: handleAddCategory_, write: true },
    updateCategory: { handler: handleUpdateCategory_, write: true },

    getBudgets: { handler: handleGetBudgets_ },
    setBudget: { handler: handleSetBudget_, write: true },
    deleteBudget: { handler: handleDeleteBudget_, write: true },
    copyBudgets: { handler: handleCopyBudgets_, write: true },

    getSavingsGoals: { handler: handleGetSavingsGoals_ },
    addSavingsGoal: { handler: handleAddSavingsGoal_, write: true },
    updateSavingsGoal: { handler: handleUpdateSavingsGoal_, write: true },
    deleteSavingsGoal: { handler: handleDeleteSavingsGoal_, write: true },
    addGoalContribution: { handler: handleAddGoalContribution_, write: true },
    deleteGoalContribution: { handler: handleDeleteGoalContribution_, write: true },

    getDebts: { handler: handleGetDebts_ },
    addDebt: { handler: handleAddDebt_, write: true },
    updateDebt: { handler: handleUpdateDebt_, write: true },
    deleteDebt: { handler: handleDeleteDebt_, write: true },
    addDebtPayment: { handler: handleAddDebtPayment_, write: true },
    deleteDebtPayment: { handler: handleDeleteDebtPayment_, write: true },

    getInvestments: { handler: handleGetInvestments_ },
    addInvestment: { handler: handleAddInvestment_, write: true },
    updateInvestment: { handler: handleUpdateInvestment_, write: true },
    deleteInvestment: { handler: handleDeleteInvestment_, write: true },
    addInvestmentTransaction: { handler: handleAddInvestmentTransaction_, write: true },
    deleteInvestmentTransaction: { handler: handleDeleteInvestmentTransaction_, write: true },
    updateInvestmentPrice: { handler: handleUpdateInvestmentPrice_, write: true },
    deletePrice: { handler: handleDeletePrice_, write: true },

    adminListUsers: { handler: handleAdminListUsers_, admin: true },
    adminCreateUser: { handler: handleAdminCreateUser_, write: true, admin: true },
    adminResetPassword: { handler: handleAdminResetPassword_, write: true, admin: true },
    adminUpdateUser: { handler: handleAdminUpdateUser_, write: true, admin: true },
    adminSetRegistration: { handler: handleAdminSetRegistration_, write: true, admin: true }
  };
  return ROUTES_;
}

function handleGetBootstrap_(ctx) {
  return {
    user: publicUser_(ctx.user),
    exchangeRates: userExchangeRates_(ctx.userId),
    accounts: accountsWithBalances_(ctx.userId),
    categories: handleGetCategories_(ctx),
    stalePriceDays: STALE_PRICE_DAYS,
    today: todayStr_()
  };
}

/** GET is a health check only; it never returns user data. */
function doGet() {
  resetDbCache_();
  return jsonOutput_({ ok: true, data: handleHealth_() });
}

function doPost(e) {
  let request = null;
  const body = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (body.length > MAX_REQUEST_BYTES) {
    return jsonOutput_({ ok: false, error: { code: 'BAD_REQUEST', message: 'Request is too large.' } });
  }
  try {
    request = JSON.parse(body);
  } catch (err) {
    return jsonOutput_({ ok: false, error: { code: 'BAD_REQUEST', message: 'Request body must be JSON.' } });
  }
  return jsonOutput_(handleRequest_(request));
}

/** Validates, authenticates and dispatches one API request. Returns the response object. */
function handleRequest_(request) {
  resetDbCache_();
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw apiError_('BAD_REQUEST', 'Request must be a JSON object.');
    }
    const action = request.action;
    const routes = routes_();
    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(routes, action)) {
      throw apiError_('UNKNOWN_ACTION', 'Unknown action.');
    }
    const route = routes[action];
    const payload = request.payload === undefined || request.payload === null ? {} : request.payload;
    if (typeof payload !== 'object' || Array.isArray(payload)) throw apiError_('BAD_REQUEST', 'Payload must be an object.');

    let ctx = {};
    if (route.auth !== false) {
      ctx = requireSession_(request.token);
      if (route.admin && ctx.user.role !== 'admin') throw apiError_('FORBIDDEN', 'Administrator access is required.');
    }
    const data = route.write
      ? withLock_(function () {
        // Re-resolve the session inside the lock so a concurrent logout/disable is honoured.
        const fresh = requireSession_(request.token);
        if (route.admin && fresh.user.role !== 'admin') throw apiError_('FORBIDDEN', 'Administrator access is required.');
        return route.handler(fresh, payload);
      })
      : route.handler(ctx, payload);
    return { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    return errorResponse_(err);
  }
}

function errorResponse_(err) {
  if (err && err.apiCode) {
    return { ok: false, error: { code: err.apiCode, message: err.message } };
  }
  // Unexpected errors (including spreadsheet service failures) are logged but not leaked.
  console.error(err && err.stack ? err.stack : err);
  const message = err && /Service|spreadsheet|Exceeded|timed out/i.test(String(err.message))
    ? 'Google Sheets is temporarily unavailable. Please try again in a moment.'
    : 'Something went wrong on the server. Please try again.';
  return { ok: false, error: { code: 'INTERNAL', message: message } };
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
