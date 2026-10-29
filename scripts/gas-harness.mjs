/**
 * Runs the real Apps Script sources (apps-script/*.gs) inside Node with
 * in-memory fakes of the Google services they use. Used by the backend tests
 * and by the local development backend (scripts/dev-backend.mjs).
 *
 * The fakes are intentionally strict where it matters for safety: writing a
 * string that Sheets would evaluate as a formula throws, so tests catch any
 * unescaped user input.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps-script');

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.numRows) throw new Error('setValues: row count mismatch');
    values.forEach((line, r) => {
      if (line.length !== this.numCols) throw new Error('setValues: column count mismatch');
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      line.forEach((v, c) => {
        if (typeof v === 'string' && /^[=+\-@]/.test(v)) {
          throw new Error('Unsafe write: "' + v + '" would be interpreted as a formula');
        }
        // Sheets treats a leading apostrophe as a "quote prefix" and does not return it.
        this.sheet.data[idx][this.col - 1 + c] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
      });
    });
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
  }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) {
      if ((this.data[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    return this.data.reduce((m, row) => Math.max(m, (row || []).length), 0);
  }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new FakeRange(this, row, col, numRows, numCols);
  }
  deleteRow(row) { this.data.splice(row - 1, 1); }
  setFrozenRows() {}
}

class FakeSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = [new FakeSheet('Sheet1')];
  }
  getId() { return this.id; }
  getUrl() { return 'memory://' + this.id; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(name) { return this.sheets.find((s) => s.name === name) || null; }
  insertSheet(name) {
    const s = new FakeSheet(name);
    this.sheets.push(s);
    return s;
  }
  deleteSheet(sheet) { this.sheets = this.sheets.filter((s) => s !== sheet); }
}

const toSigned = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const toBuffer = (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b)));

function formatDate(date, tz, fmt) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value])
  );
  if (fmt === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (fmt === 'yyyy-MM') return `${parts.year}-${parts.month}`;
  throw new Error('Unsupported date format in harness: ' + fmt);
}

/**
 * Creates an isolated Apps Script environment.
 * @param {object} opts
 * @param {Record<string,string>} [opts.properties]  Initial script properties.
 * @param {() => string} [opts.today]  Overrides "today" (yyyy-MM-dd) for deterministic tests.
 */
export function createGasEnvironment(opts = {}) {
  const spreadsheets = new Map();
  const properties = new Map(Object.entries(opts.properties || {}));
  let lockHeld = false;

  const sandbox = {
    console: opts.quiet ? { log() {}, warn() {}, error() {} } : console,
    SpreadsheetApp: {
      openById(id) {
        const ss = spreadsheets.get(id);
        if (!ss) throw new Error('Spreadsheet not found: ' + id);
        return ss;
      },
      create(name) {
        const ss = new FakeSpreadsheet('ss_' + randomUUID().slice(0, 8), name);
        spreadsheets.set(ss.id, ss);
        return ss;
      },
      flush() {}
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (properties.has(k) ? properties.get(k) : null),
        setProperty: (k, v) => { properties.set(k, String(v)); },
        deleteProperty: (k) => { properties.delete(k); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          if (lockHeld) return false;
          lockHeld = true;
          return true;
        },
        waitLock() { this.tryLock(); },
        releaseLock() { lockHeld = false; }
      })
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put() {}, remove() {} })
    },
    Session: { getScriptTimeZone: () => 'Asia/Dubai' },
    Utilities: {
      getUuid: () => randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      MacAlgorithm: { HMAC_SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest(alg, text) {
        return toSigned(createHash(alg).update(text, 'utf8').digest());
      },
      computeHmacSignature(alg, value, key) {
        return toSigned(createHmac(alg, toBuffer(key)).update(toBuffer(value)).digest());
      },
      newBlob(text) {
        return { getBytes: () => toSigned(Buffer.from(String(text), 'utf8')) };
      },
      formatDate
    },
    UrlFetchApp: {
      fetch(url) {
        throw new Error('The backend should not make network requests: ' + url);
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return { content, setMimeType() { return this; }, getContent() { return content; } };
      }
    }
  };
  const context = vm.createContext(sandbox);
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.gs')).sort();
  for (const f of files) {
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), context, { filename: f });
  }
  if (opts.today) {
    const todayFn = opts.today;
    context.__todayOverride = todayFn;
    vm.runInContext('todayStr_ = function () { return __todayOverride(); };', context);
  }

  const env = {
    context,
    properties,
    spreadsheets,
    /** Evaluates an expression (e.g. a global function name) inside the Apps Script context. */
    get(name) {
      return vm.runInContext(name, context);
    },
    /** Calls doPost exactly like the web app runtime would and parses the JSON output. */
    post(body) {
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      const out = context.doPost({ postData: { contents: raw, type: 'text/plain' } });
      return JSON.parse(out.getContent());
    },
    call(action, payload, token) {
      return env.post({ action, payload, token });
    },
    /** The single spreadsheet used as the database. */
    database() {
      return spreadsheets.get(properties.get('SPREADSHEET_ID'));
    },
    /** Rows of a sheet as objects (for assertions). */
    rows(sheetName) {
      const sheet = env.database().getSheetByName(sheetName);
      const [header, ...rest] = sheet.data;
      return rest.filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
    }
  };
  return env;
}
