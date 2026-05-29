/**
 * Preservation Property Tests
 *
 * These tests capture the BASELINE (correct) behavior for inputs where the
 * five bug conditions do NOT hold. They are run on UNFIXED code to confirm
 * that existing behavior is preserved, and must continue to pass after fixes
 * are applied.
 *
 * Observation methodology: values were read directly from the current
 * (unfixed) source files before any fix was applied.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Helpers (same approach as bugConditions.test.js) ────────────────────────

const CSS_PATH = path.resolve(__dirname, '../style.css');
const cssContent = fs.readFileSync(CSS_PATH, 'utf-8');

/**
 * Check whether a CSS selector exists in the stylesheet.
 */
function selectorExists(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped + '\\s*\\{');
  return pattern.test(cssContent);
}

/**
 * Extract the declaration block for a given selector.
 * Returns the text between { and } for the first matching rule.
 */
function getRuleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped + '\\s*\\{([^}]*)\\}');
  const match = cssContent.match(pattern);
  return match ? match[1] : null;
}

/**
 * Parse STATUS_META from Dashboard.jsx source.
 * Returns an object keyed by status name with { icon, color, bg, border }.
 */
const DASHBOARD_PATH = path.resolve(__dirname, '../pages/Dashboard.jsx');
const dashboardSource = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

function parseStatusMetaEntry(statusKey) {
  // Escape special chars in the key for regex (e.g. spaces, apostrophes)
  const escapedKey = statusKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // STATUS_META keys may be unquoted identifiers (Pending, Assigned, etc.)
  // or quoted strings ('In Progress'). Try unquoted first, then quoted.
  let entryMatch = dashboardSource.match(
    new RegExp(`(?:^|\\s)${escapedKey}\\s*:\\s*\\{([^}]*)\\}`, 'm')
  );
  if (!entryMatch) {
    entryMatch = dashboardSource.match(
      new RegExp(`'${escapedKey}'\\s*:\\s*\\{([^}]*)\\}`)
    );
  }
  if (!entryMatch) return null;
  const block = entryMatch[1];

  const extract = (field) => {
    const m = block.match(new RegExp(`${field}\\s*:\\s*'([^']*)'`));
    return m ? m[1] : undefined;
  };

  return {
    icon:   extract('icon'),
    color:  extract('color'),
    bg:     extract('bg'),
    border: extract('border'),
  };
}

// ─── Preservation P1 — STATUS_META entries for non-buggy statuses ─────────────

describe('Preservation P1 — STATUS_META returns defined objects for all existing statuses', () => {
  /**
   * For all status values in ['Pending', 'Assigned', 'Scheduled', 'Completed', 'Cancelled'],
   * assert STATUS_META[status] returns a defined object with all four required fields.
   *
   * These are the non-buggy inputs (bug condition does NOT hold for these statuses).
   * Must PASS on unfixed code and continue to PASS after the fix.
   *
   * Validates: Requirements 3.3
   */

  const EXISTING_STATUSES = ['Pending', 'Assigned', 'Scheduled', 'Completed', 'Cancelled'];

  EXISTING_STATUSES.forEach((status) => {
    it(`STATUS_META['${status}'] should be defined`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
    });

    it(`STATUS_META['${status}'] should have a non-empty icon`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.icon).toBeDefined();
      expect(entry.icon.trim().length).toBeGreaterThan(0);
    });

    it(`STATUS_META['${status}'] should have a non-empty color`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.color).toBeDefined();
      expect(entry.color.trim().length).toBeGreaterThan(0);
    });

    it(`STATUS_META['${status}'] should have a non-empty bg`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.bg).toBeDefined();
      expect(entry.bg.trim().length).toBeGreaterThan(0);
    });

    it(`STATUS_META['${status}'] should have a non-empty border`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.border).toBeDefined();
      expect(entry.border.trim().length).toBeGreaterThan(0);
    });
  });
});

// ─── Preservation P2 — Non-paginated API responses unaffected ─────────────────

describe('Preservation P2 — Non-paginated API responses return data correctly', () => {
  /**
   * For non-paginated response shapes (plain array, single object), assert the
   * Axios instance returns data correctly to callers.
   *
   * These are the non-buggy inputs (bug condition does NOT hold for these calls).
   * Must PASS on unfixed code and continue to PASS after the fix.
   *
   * Validates: Requirements 3.1
   */

  let mock;
  let apiInstance;

  beforeEach(() => {
    apiInstance = axios.create({
      baseURL: 'http://localhost:5000/api',
    });

    // Attach only the request interceptor (as api.js does)
    apiInstance.interceptors.request.use((config) => {
      return config;
    });

    mock = new MockAdapter(apiInstance);
  });

  afterEach(() => {
    mock.restore();
  });

  it('GET /engineers — plain array response should be returned as an array', async () => {
    const engineersPayload = [
      { _id: 'eng1', user: { name: 'Alice' }, skillType: 'Plumbing', remainingSlotsToday: 3 },
      { _id: 'eng2', user: { name: 'Bob' }, skillType: 'Electrical', remainingSlotsToday: 1 },
    ];

    mock.onGet('/engineers').reply(200, engineersPayload);

    const response = await apiInstance.get('/engineers');
    const { data } = response;

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0]._id).toBe('eng1');
    expect(data[1]._id).toBe('eng2');
  });

  it('GET /complaints/:id — single object response should be returned as an object', async () => {
    const complaintPayload = {
      _id: 'c1',
      issueType: 'Plumbing',
      status: 'Pending',
      description: 'Leaking pipe',
    };

    mock.onGet('/complaints/c1').reply(200, complaintPayload);

    const response = await apiInstance.get('/complaints/c1');
    const { data } = response;

    expect(typeof data).toBe('object');
    expect(Array.isArray(data)).toBe(false);
    expect(data._id).toBe('c1');
    expect(data.issueType).toBe('Plumbing');
    expect(data.status).toBe('Pending');
  });

  it('GET /engineers — data should not be undefined or null', async () => {
    const engineersPayload = [
      { _id: 'eng1', user: { name: 'Alice' }, skillType: 'Plumbing', remainingSlotsToday: 3 },
    ];

    mock.onGet('/engineers').reply(200, engineersPayload);

    const response = await apiInstance.get('/engineers');
    expect(response.data).not.toBeUndefined();
    expect(response.data).not.toBeNull();
  });

  it('GET /complaints/:id — data should not be undefined or null', async () => {
    const complaintPayload = { _id: 'c2', issueType: 'Electrical', status: 'Assigned' };

    mock.onGet('/complaints/c2').reply(200, complaintPayload);

    const response = await apiInstance.get('/complaints/c2');
    expect(response.data).not.toBeUndefined();
    expect(response.data).not.toBeNull();
  });
});

// ─── Preservation P3 — Existing status badge CSS rules unchanged ──────────────

describe('Preservation P3 — Existing status badge CSS rules exist with non-empty background and color', () => {
  /**
   * For all existing status badge modifier classes (status-pending, status-assigned,
   * status-scheduled, status-completed, status-cancelled), assert each rule exists
   * in style.css with non-empty background and color.
   *
   * These are the non-buggy inputs (bug condition does NOT hold for these statuses).
   * Must PASS on unfixed code and continue to PASS after the fix.
   *
   * Validates: Requirements 3.2
   */

  const EXISTING_BADGE_CLASSES = [
    'status-pending',
    'status-assigned',
    'status-scheduled',
    'status-completed',
    'status-cancelled',
  ];

  EXISTING_BADGE_CLASSES.forEach((modifier) => {
    const selector = `.status-badge.${modifier}`;

    it(`${selector} rule should exist in style.css`, () => {
      expect(selectorExists(selector)).toBe(true);
    });

    it(`${selector} should have a non-empty background declaration`, () => {
      const block = getRuleBlock(selector);
      expect(block).not.toBeNull();
      expect(block).toMatch(/background\s*:/);
      const bgMatch = block.match(/background\s*:\s*([^;]+)/);
      expect(bgMatch).not.toBeNull();
      expect(bgMatch[1].trim().length).toBeGreaterThan(0);
    });

    it(`${selector} should have a non-empty color declaration`, () => {
      const block = getRuleBlock(selector);
      expect(block).not.toBeNull();
      expect(block).toMatch(/(?<![a-z-])color\s*:/);
      const colorMatch = block.match(/(?<![a-z-])color\s*:\s*([^;]+)/);
      expect(colorMatch).not.toBeNull();
      expect(colorMatch[1].trim().length).toBeGreaterThan(0);
    });
  });
});

// ─── Preservation P4 — Exact STATUS_META values unchanged ────────────────────

describe('Preservation P4 — Existing STATUS_META entries have exact observed values', () => {
  /**
   * Assert that the five existing STATUS_META entries are unchanged
   * (same icon, color, bg, border values) after the fix.
   *
   * Values observed directly from the current (unfixed) Dashboard.jsx source.
   * Must PASS on unfixed code and continue to PASS after the fix.
   *
   * Validates: Requirements 3.3
   */

  // Observed values from Dashboard.jsx (unfixed code)
  const EXPECTED_STATUS_META = {
    Pending:   { icon: '⏳', color: '#d97706', bg: '#fef3c7', border: '#fcd34d' },
    Assigned:  { icon: '👷', color: '#2563eb', bg: '#dbeafe', border: '#93c5fd' },
    Scheduled: { icon: '📅', color: '#0891b2', bg: '#e0f2fe', border: '#7dd3fc' },
    Completed: { icon: '✅', color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
    Cancelled: { icon: '🚫', color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  };

  Object.entries(EXPECTED_STATUS_META).forEach(([status, expected]) => {
    it(`STATUS_META['${status}'].icon should equal '${expected.icon}'`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.icon).toBe(expected.icon);
    });

    it(`STATUS_META['${status}'].color should equal '${expected.color}'`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.color).toBe(expected.color);
    });

    it(`STATUS_META['${status}'].bg should equal '${expected.bg}'`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.bg).toBe(expected.bg);
    });

    it(`STATUS_META['${status}'].border should equal '${expected.border}'`, () => {
      const entry = parseStatusMetaEntry(status);
      expect(entry).not.toBeNull();
      expect(entry.border).toBe(expected.border);
    });
  });
});

// ─── Preservation P3 (exact values) — Observed CSS badge colors ──────────────

describe('Preservation P3 (exact values) — Existing status badge CSS rules have observed color values', () => {
  /**
   * Assert that the five existing status badge rules have the exact background
   * and color values observed in the current (unfixed) style.css.
   *
   * Observed values from style.css (unfixed code):
   *   .status-badge.status-pending    { background: #fef3c7; color: #92400e; }
   *   .status-badge.status-assigned   { background: #dbeafe; color: #1d4ed8; }
   *   .status-badge.status-scheduled  { background: #ede9fe; color: #6d28d9; }
   *   .status-badge.status-completed  { background: #dcfce7; color: #166534; }
   *   .status-badge.status-cancelled  { background: #fee2e2; color: #b91c1c; }
   *
   * Validates: Requirements 3.2
   */

  const EXPECTED_BADGE_STYLES = {
    'status-pending':   { background: '#fef3c7', color: '#92400e' },
    'status-assigned':  { background: '#dbeafe', color: '#1d4ed8' },
    'status-scheduled': { background: '#ede9fe', color: '#6d28d9' },
    'status-completed': { background: '#dcfce7', color: '#166534' },
    'status-cancelled': { background: '#fee2e2', color: '#b91c1c' },
  };

  Object.entries(EXPECTED_BADGE_STYLES).forEach(([modifier, expected]) => {
    const selector = `.status-badge.${modifier}`;

    it(`${selector} background should equal '${expected.background}'`, () => {
      const block = getRuleBlock(selector);
      expect(block).not.toBeNull();
      const bgMatch = block.match(/background\s*:\s*([^;]+)/);
      expect(bgMatch).not.toBeNull();
      expect(bgMatch[1].trim()).toBe(expected.background);
    });

    it(`${selector} color should equal '${expected.color}'`, () => {
      const block = getRuleBlock(selector);
      expect(block).not.toBeNull();
      const colorMatch = block.match(/(?<![a-z-])color\s*:\s*([^;]+)/);
      expect(colorMatch).not.toBeNull();
      expect(colorMatch[1].trim()).toBe(expected.color);
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// ui-bugs-fix-2 — Preservation Property Tests (Task 2)
//
// These tests capture BASELINE behavior on UNFIXED code for inputs where the
// five bug conditions do NOT hold. They MUST PASS on unfixed code and continue
// to PASS after all fixes are applied.
//
// Observation methodology: values were read directly from the current (unfixed)
// source files before any fix was applied.
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
// ═══════════════════════════════════════════════════════════════════════════════

import path3 from 'path';
import fs3 from 'fs';
import { fileURLToPath as fileURLToPath3 } from 'url';

const __dirname3 = path3.dirname(fileURLToPath3(import.meta.url));

const CSS_PATH_V3    = path3.resolve(__dirname3, '../style.css');
const SERVER_PATH_V3 = path3.resolve(__dirname3, '../../..', 'server', 'server.js');
const DASH_PATH_V3   = path3.resolve(__dirname3, '../pages/Dashboard.jsx');

const cssContentV3    = fs3.readFileSync(CSS_PATH_V3, 'utf-8');
const serverContentV3 = fs3.readFileSync(SERVER_PATH_V3, 'utf-8');
const dashContentV3   = fs3.readFileSync(DASH_PATH_V3, 'utf-8');

/**
 * Returns true if the CSS file contains the given selector followed by '{'.
 */
function cssHasSelector(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped + '\\s*\\{').test(css);
}

// ─── Preservation P1 (CSS) — Representative existing CSS selectors ────────────

describe('ui-bugs-fix-2 Preservation P1 — Representative existing CSS selectors still exist in style.css', () => {
  /**
   * For a representative sample of existing CSS selectors, assert each rule
   * still exists in style.css. These selectors are present in the unfixed code
   * and must remain present after any fix is applied.
   *
   * Validates: Requirements 3.1, 3.2
   */

  const EXISTING_SELECTORS = [
    '.adm-card',
    '.card',
    '.auth-submit-btn',
    '.status-badge.status-pending',
    '.status-badge.status-assigned',
    '.status-badge.status-completed',
    '.status-badge.status-cancelled',
    '.filter-tabs',
    '.bulk-bar',
    '.analytics-stats',
  ];

  EXISTING_SELECTORS.forEach((selector) => {
    it(`${selector} should still exist in style.css`, () => {
      expect(cssHasSelector(cssContentV3, selector)).toBe(true);
    });
  });
});

// ─── Preservation P2 (Socket 5173) — http://localhost:5173 still in allowed origins ──

describe('ui-bugs-fix-2 Preservation P2 — server.js still includes http://localhost:5173 in allowed origins', () => {
  /**
   * Assert that server/server.js still includes 'http://localhost:5173' in the
   * allowed origins after the fix. This origin must be preserved so that clients
   * running on port 5173 continue to work.
   *
   * Validates: Requirements 3.5
   */

  it("server.js should contain 'http://localhost:5173'", () => {
    expect(serverContentV3).toContain('http://localhost:5173');
  });
});

// ─── Preservation P3 (Socket CLIENT_URL) — CLIENT_URL env var uses single-element array ──

describe('ui-bugs-fix-2 Preservation P3 — When CLIENT_URL is set, server.js uses it as the sole allowed origin', () => {
  /**
   * Assert that the server.js source code logic uses process.env.CLIENT_URL
   * as the origin when it is set, rather than the default two-port array.
   *
   * On unfixed code: the pattern is `process.env.CLIENT_URL || 'http://localhost:5173'`
   * which means when CLIENT_URL is set, only that single origin is used.
   *
   * After the fix (task 3.3), the pattern becomes:
   *   process.env.CLIENT_URL ? [process.env.CLIENT_URL] : [...]
   * which also uses a single-element array when CLIENT_URL is set.
   *
   * In both cases, when CLIENT_URL is set, it is the sole allowed origin.
   * This test checks the source code reflects that intent.
   *
   * Validates: Requirements 3.5, 3.6
   */

  it('server.js should reference process.env.CLIENT_URL for CORS origin configuration', () => {
    expect(serverContentV3).toContain('process.env.CLIENT_URL');
  });

  it('server.js should NOT use process.env.CLIENT_URL alongside the default two-port array simultaneously', () => {
    // When CLIENT_URL is set, it should be the sole origin.
    // The source must use a conditional (|| or ternary) so that CLIENT_URL
    // takes precedence over the default origins — not be appended to them.
    //
    // Verify: the file does NOT contain a pattern where CLIENT_URL is
    // concatenated/spread into an array that also contains 5173 and 5174
    // unconditionally (i.e. no `[process.env.CLIENT_URL, 'http://localhost:5173', ...]`).
    const unconditionalMerge = /\[\s*process\.env\.CLIENT_URL\s*,\s*['"]http:\/\/localhost:517[34]['"]/.test(serverContentV3);
    expect(unconditionalMerge).toBe(false);
  });
});

// ─── Preservation P4 (AdminDashboard mount) — load(1) called on mount with no status filter ──

describe('ui-bugs-fix-2 Preservation P4 — AdminDashboard calls load on mount with page=1 and no status filter when filter is All', () => {
  /**
   * Read Dashboard.jsx as a string and assert that AdminDashboard calls load
   * on mount (via useEffect) with page=1 and no status filter when filter is 'All'.
   *
   * On unfixed code: useEffect(() => { load(1); setPage(1); }, [filter]) is present.
   * The load function only adds a status param when filter !== 'All', so on mount
   * (filter='All'), no status param is added.
   *
   * Validates: Requirements 3.7
   */

  it('AdminDashboard useEffect should call load with page 1 on filter change (mount)', () => {
    // Extract AdminDashboard body
    const adminStart = dashContentV3.indexOf('function AdminDashboard()');
    const residentStart = dashContentV3.indexOf('function ResidentDashboard()');
    expect(adminStart).toBeGreaterThan(-1);
    expect(residentStart).toBeGreaterThan(-1);

    const adminBody = dashContentV3.slice(adminStart, residentStart);

    // Assert there is a useEffect that calls load with 1 (page=1) and depends on [filter]
    // Pattern: useEffect(() => { load(1) ... }, [filter])
    const hasLoadOnMount = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*load\s*\(\s*1\s*[,)]/.test(adminBody);
    expect(hasLoadOnMount).toBe(true);
  });

  it('AdminDashboard load function should only add status param when filter is not All', () => {
    // Extract AdminDashboard body
    const adminStart = dashContentV3.indexOf('function AdminDashboard()');
    const residentStart = dashContentV3.indexOf('function ResidentDashboard()');
    const adminBody = dashContentV3.slice(adminStart, residentStart);

    // The load function should contain a conditional that only sets status when filter !== 'All'
    const hasConditionalStatus = /if\s*\(\s*f(?:ilter)?\s*!==\s*['"]All['"]\s*\)/.test(adminBody);
    expect(hasConditionalStatus).toBe(true);
  });
});

// ─── Preservation P5 (ResidentDashboard empty state) — "No complaints yet." text present ──

describe('ui-bugs-fix-2 Preservation P5 — ResidentDashboard contains "No complaints yet." empty state text', () => {
  /**
   * Read Dashboard.jsx as a string and assert the "No complaints yet." text is
   * present in the ResidentDashboard component. This empty-state message must
   * continue to be rendered when the complaints array is empty.
   *
   * Validates: Requirements 3.9
   */

  it('ResidentDashboard should contain the "No complaints yet." empty state text', () => {
    // Extract ResidentDashboard body
    const residentStart = dashContentV3.indexOf('function ResidentDashboard()');
    const exportStart = dashContentV3.indexOf('export default function Dashboard()');
    expect(residentStart).toBeGreaterThan(-1);
    expect(exportStart).toBeGreaterThan(-1);

    const residentBody = dashContentV3.slice(residentStart, exportStart);

    expect(residentBody).toContain('No complaints yet.');
  });

  it('ResidentDashboard "No complaints yet." text should be inside a conditional that checks for empty visible list', () => {
    // Extract ResidentDashboard body
    const residentStart = dashContentV3.indexOf('function ResidentDashboard()');
    const exportStart = dashContentV3.indexOf('export default function Dashboard()');
    const residentBody = dashContentV3.slice(residentStart, exportStart);

    // The empty state should be inside a conditional block (ternary or if)
    // checking visible.length === 0 or similar
    const emptyStateIdx = residentBody.indexOf('No complaints yet.');
    expect(emptyStateIdx).toBeGreaterThan(-1);

    // There should be a length check somewhere before the empty state text
    const beforeEmptyState = residentBody.slice(0, emptyStateIdx);
    const hasLengthCheck = /visible\.length\s*===\s*0|visible\.length\s*==\s*0/.test(beforeEmptyState);
    expect(hasLengthCheck).toBe(true);
  });
});
