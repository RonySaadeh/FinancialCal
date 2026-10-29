/**
 * Input validation. Every handler validates its payload with these helpers
 * before touching the spreadsheet. Each helper returns the normalised value
 * or throws a VALIDATION error naming the field.
 */

function invalid_(field, message) {
  return apiError_('VALIDATION', field + ' ' + message);
}

function isBlank_(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function vString_(v, field, opts) {
  opts = opts || {};
  const max = opts.max || 200;
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw invalid_(field, 'must be text.');
  const s = String(v).trim();
  if (s.length > max) throw invalid_(field, 'must be at most ' + max + ' characters.');
  // Reject control characters other than tab/newline.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s)) throw invalid_(field, 'contains invalid characters.');
  return s;
}

function vEnum_(v, field, allowed, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.defaultValue !== undefined) return opts.defaultValue;
    if (opts.required !== false && allowed.indexOf('') < 0) throw invalid_(field, 'is required.');
    return '';
  }
  if (allowed.indexOf(v) < 0) throw invalid_(field, 'must be one of: ' + allowed.filter(Boolean).join(', ') + '.');
  return v;
}

/**
 * Validates a number. Options: required, min, max, allowZero (default true when min<0
 * or when min is 0 and allowZero not false), decimals (default 2).
 */
function vNumber_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return opts.defaultValue !== undefined ? opts.defaultValue : null;
  }
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
  if (!isFinite(n)) throw invalid_(field, 'must be a number.');
  const min = opts.min === undefined ? 0 : opts.min;
  const max = opts.max === undefined ? 1e12 : opts.max;
  if (n < min) throw invalid_(field, 'must be at least ' + min + '.');
  if (n > max) throw invalid_(field, 'must be at most ' + max + '.');
  if (opts.positive && n <= 0) throw invalid_(field, 'must be greater than zero.');
  const decimals = opts.decimals === undefined ? 2 : opts.decimals;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function vAmount_(v, field, opts) {
  opts = opts || {};
  return vNumber_(v, field, {
    required: opts.required !== false,
    positive: opts.positive !== false,
    min: opts.min === undefined ? 0 : opts.min,
    max: 1e11,
    defaultValue: opts.defaultValue
  });
}

function vInt_(v, field, opts) {
  const n = vNumber_(v, field, Object.assign({}, opts, { decimals: 0 }));
  if (!isBlank_(v) && Math.floor(Number(v)) !== Number(v)) throw invalid_(field, 'must be a whole number.');
  return n;
}

function isValidYmd_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = parseYmd_(s);
  return p.y >= 1900 && p.y <= 2200 && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= daysInMonth_(p.y, p.m);
}

function vDate_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (!isValidYmd_(v)) throw invalid_(field, 'must be a valid date (YYYY-MM-DD).');
  return v;
}

function vMonth_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw invalid_(field, 'must be a month (YYYY-MM).');
  return v;
}

function vCurrency_(v, field, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.defaultValue) return opts.defaultValue;
    if (opts.required) throw invalid_(field, 'is required.');
    return '';
  }
  if (typeof v !== 'string' || !/^[A-Z]{3}$/.test(v)) throw invalid_(field, 'must be a 3-letter currency code such as AED.');
  return v;
}

function vId_(v, field, sheetName, opts) {
  opts = opts || {};
  if (isBlank_(v)) {
    if (opts.required !== false) throw invalid_(field, 'is required.');
    return '';
  }
  const prefix = ID_PREFIX[sheetName];
  if (typeof v !== 'string' || !new RegExp('^' + prefix + '_[a-f0-9]{20}$').test(v)) throw invalid_(field, 'is not a valid ID.');
  return v;
}

function vBool_(v, field, opts) {
  opts = opts || {};
  if (v === undefined || v === null || v === '') return opts.defaultValue === undefined ? false : opts.defaultValue;
  if (typeof v !== 'boolean') throw invalid_(field, 'must be true or false.');
  return v;
}

function vColor_(v, field) {
  if (isBlank_(v)) return '#64748b';
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw invalid_(field, 'must be a hex colour like #22c55e.');
  return v.toLowerCase();
}

function vEmail_(v, field) {
  const s = vString_(v, field, { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw invalid_(field, 'must be a valid email address.');
  return s;
}

/** Ensures the payload is a plain object and only contains known keys. */
function vPayload_(payload, allowedKeys) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw apiError_('VALIDATION', 'Request payload must be an object.');
  }
  Object.keys(payload).forEach(function (k) {
    if (allowedKeys.indexOf(k) < 0) throw apiError_('VALIDATION', 'Unknown field: ' + k);
  });
  return payload;
}
