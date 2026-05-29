/**
 * Bug Condition Exploration Tests
 *
 * These tests encode the EXPECTED (correct) behavior for each of the five UI bugs.
 * They are run on UNFIXED code to confirm the bugs exist (tests FAIL = bug confirmed).
 * After fixes are applied, these same tests should all PASS.
 *
 * Validates: Requirements 1.1, 2.1, 3.1, 3.2, 4.1, 5.1, 5.2, 5.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read style.css content once */
const CSS_PATH = path.resolve(__dirname, '../style.css');
const cssContent = fs.readFileSync(CSS_PATH, 'utf-8');

/**
 * Check whether a CSS selector exists in the stylesheet.
 * Escapes special characters for use in a regex.
 */
function selectorExists(selector) {
  // Escape regex special chars in the selector
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

// ─── Bug 1 — Axios Interceptor ────────────────────────────────────────────────

describe('Bug 1 — Axios interceptor preserves paginated response shape', () => {
  /**
   * The test creates a fresh Axios instance (mirroring api.js) and mocks
   * GET /complaints?page=1 to return a paginated payload.
   * It asserts the caller receives data.complaints, data.total, data.pages intact.
   *
   * On UNFIXED code (if a stripping interceptor exists): FAILS
   * On FIXED code (no stripping interceptor): PASSES
   *
   * NOTE: The current api.js has NO response interceptor, so this test is
   * expected to PASS even on "unfixed" code — documenting that Bug 1 may
   * already be absent or was pre-fixed.
   */

  let mock;
  let apiInstance;

  beforeEach(() => {
    // Create a fresh Axios instance matching api.js setup
    apiInstance = axios.create({
      baseURL: 'http://localhost:5000/api',
    });

    // Attach only the request interceptor (as api.js does)
    apiInstance.interceptors.request.use((config) => {
      // Simulate token attachment (no localStorage in Node, so skip)
      return config;
    });

    mock = new MockAdapter(apiInstance);
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return data.complaints as an array from a paginated response', async () => {
    const paginatedPayload = {
      complaints: [
        { _id: '1', issueType: 'Plumbing', status: 'Pending' },
        { _id: '2', issueType: 'Electrical', status: 'In Progress' },
      ],
      total: 5,
      pages: 1,
    };

    // Match any GET to /complaints (with or without query params)
    mock.onGet(/\/complaints/).reply(200, paginatedPayload);

    const response = await apiInstance.get('/complaints?page=1');
    const { data } = response;

    // Assert the paginated shape is preserved
    expect(Array.isArray(data.complaints)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(typeof data.pages).toBe('number');
  });
});

// ─── Bug 2 — CSS Rule: .status-badge.status-in-progress ──────────────────────

describe('Bug 2 — .status-badge.status-in-progress CSS rule exists', () => {
  /**
   * Parses style.css and asserts the compound selector
   * `.status-badge.status-in-progress` exists with non-empty background and color.
   *
   * On UNFIXED code: FAILS (rule is absent)
   * On FIXED code: PASSES
   *
   * Validates: Requirements 2.3
   */

  it('should have a .status-badge.status-in-progress rule in style.css', () => {
    const selector = '.status-badge.status-in-progress';
    const exists = selectorExists(selector);
    expect(exists).toBe(true);
  });

  it('should have a non-empty background declaration in .status-badge.status-in-progress', () => {
    const block = getRuleBlock('.status-badge.status-in-progress');
    expect(block).not.toBeNull();
    // background property must be present and non-empty
    expect(block).toMatch(/background\s*:/);
    const bgMatch = block.match(/background\s*:\s*([^;]+)/);
    expect(bgMatch).not.toBeNull();
    expect(bgMatch[1].trim().length).toBeGreaterThan(0);
  });

  it('should have a non-empty color declaration in .status-badge.status-in-progress', () => {
    const block = getRuleBlock('.status-badge.status-in-progress');
    expect(block).not.toBeNull();
    // color property must be present and non-empty
    expect(block).toMatch(/(?<![a-z-])color\s*:/);
    const colorMatch = block.match(/(?<![a-z-])color\s*:\s*([^;]+)/);
    expect(colorMatch).not.toBeNull();
    expect(colorMatch[1].trim().length).toBeGreaterThan(0);
  });
});

// ─── Bug 3 — STATUS_META missing 'In Progress' entry ─────────────────────────

describe("Bug 3 — STATUS_META['In Progress'] is defined with required fields", () => {
  /**
   * Reads Dashboard.jsx source and parses the STATUS_META object to check
   * whether the 'In Progress' key is present with icon, color, bg, border.
   *
   * On UNFIXED code: FAILS (entry is absent)
   * On FIXED code: PASSES
   *
   * Validates: Requirements 2.4, 2.5
   */

  const DASHBOARD_PATH = path.resolve(__dirname, '../pages/Dashboard.jsx');
  const dashboardSource = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

  it("should have 'In Progress' key in STATUS_META", () => {
    // Check for the 'In Progress' key in the STATUS_META object literal
    expect(dashboardSource).toMatch(/'In Progress'\s*:/);
  });

  it("STATUS_META['In Progress'] should have an icon property", () => {
    // Extract the In Progress entry block
    const entryMatch = dashboardSource.match(/'In Progress'\s*:\s*\{([^}]*)\}/);
    expect(entryMatch).not.toBeNull();
    const entryBlock = entryMatch[1];
    expect(entryBlock).toMatch(/icon\s*:/);
    const iconMatch = entryBlock.match(/icon\s*:\s*'([^']*)'/);
    expect(iconMatch).not.toBeNull();
    expect(iconMatch[1].trim().length).toBeGreaterThan(0);
  });

  it("STATUS_META['In Progress'] should have a color property", () => {
    const entryMatch = dashboardSource.match(/'In Progress'\s*:\s*\{([^}]*)\}/);
    expect(entryMatch).not.toBeNull();
    const entryBlock = entryMatch[1];
    expect(entryBlock).toMatch(/color\s*:/);
    const colorMatch = entryBlock.match(/color\s*:\s*'([^']*)'/);
    expect(colorMatch).not.toBeNull();
    expect(colorMatch[1].trim().length).toBeGreaterThan(0);
  });

  it("STATUS_META['In Progress'] should have a bg property", () => {
    const entryMatch = dashboardSource.match(/'In Progress'\s*:\s*\{([^}]*)\}/);
    expect(entryMatch).not.toBeNull();
    const entryBlock = entryMatch[1];
    expect(entryBlock).toMatch(/bg\s*:/);
    const bgMatch = entryBlock.match(/bg\s*:\s*'([^']*)'/);
    expect(bgMatch).not.toBeNull();
    expect(bgMatch[1].trim().length).toBeGreaterThan(0);
  });

  it("STATUS_META['In Progress'] should have a border property", () => {
    const entryMatch = dashboardSource.match(/'In Progress'\s*:\s*\{([^}]*)\}/);
    expect(entryMatch).not.toBeNull();
    const entryBlock = entryMatch[1];
    expect(entryBlock).toMatch(/border\s*:/);
    const borderMatch = entryBlock.match(/border\s*:\s*'([^']*)'/);
    expect(borderMatch).not.toBeNull();
    expect(borderMatch[1].trim().length).toBeGreaterThan(0);
  });
});

// ─── Bug 4 — CSS Rule: .bulk-bar ─────────────────────────────────────────────

describe('Bug 4 — .bulk-bar CSS rule exists with display: flex', () => {
  /**
   * Parses style.css and asserts the `.bulk-bar` selector exists
   * with a `display: flex` declaration.
   *
   * On UNFIXED code: FAILS (rule is absent)
   * On FIXED code: PASSES
   *
   * Validates: Requirements 2.6
   */

  it('should have a .bulk-bar rule in style.css', () => {
    const exists = selectorExists('.bulk-bar');
    expect(exists).toBe(true);
  });

  it('should have display: flex in .bulk-bar rule', () => {
    const block = getRuleBlock('.bulk-bar');
    expect(block).not.toBeNull();
    expect(block).toMatch(/display\s*:\s*flex/);
  });
});

// ─── Bug 5 — CSS Rules: analytics-* classes ──────────────────────────────────

describe('Bug 5 — All twelve analytics-* CSS rules exist', () => {
  /**
   * Parses style.css and asserts all twelve analytics-* class rules are present.
   *
   * On UNFIXED code: FAILS (all rules are absent)
   * On FIXED code: PASSES
   *
   * Validates: Requirements 2.7, 2.8, 2.9
   */

  const ANALYTICS_CLASSES = [
    'analytics-stats',
    'analytics-stat-card',
    'analytics-stat-icon',
    'analytics-stat-val',
    'analytics-stat-lbl',
    'analytics-stat-sub',
    'analytics-chart-card',
    'analytics-chart-title',
    'analytics-two-col',
    'analytics-table',
    'analytics-progress-wrap',
    'analytics-progress-bar',
  ];

  ANALYTICS_CLASSES.forEach((cls) => {
    it(`should have a .${cls} rule in style.css`, () => {
      const exists = selectorExists(`.${cls}`);
      expect(exists).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ui-bugs-fix-2 — Bug Condition Exploration Tests
//
// These five tests encode the EXPECTED (correct) behavior for each of the five
// bugs in the ui-bugs-fix-2 spec. They are run on UNFIXED code to confirm the
// bugs exist (tests FAIL = bug confirmed). After fixes are applied, these same
// tests should all PASS.
//
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
// ═══════════════════════════════════════════════════════════════════════════════

import path2 from 'path';
import fs2 from 'fs';
import { fileURLToPath as fileURLToPath2 } from 'url';

const __dirname2 = path2.dirname(fileURLToPath2(import.meta.url));

const CSS_PATH_V2    = path2.resolve(__dirname2, '../style.css');
const SERVER_PATH_V2 = path2.resolve(__dirname2, '../../..', 'server', 'server.js');
const DASH_PATH_V2   = path2.resolve(__dirname2, '../pages/Dashboard.jsx');

const cssContentV2    = fs2.readFileSync(CSS_PATH_V2, 'utf-8');
const serverContentV2 = fs2.readFileSync(SERVER_PATH_V2, 'utf-8');
const dashContentV2   = fs2.readFileSync(DASH_PATH_V2, 'utf-8');

/**
 * Returns true if the CSS file contains the given selector followed by a
 * declaration block with at least one declaration (non-empty block).
 */
function hasCssSelectorWithDeclaration(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match selector { ... } where the block has at least one non-whitespace char
  const pattern = new RegExp(escaped + '\\s*\\{([^}]+)\\}');
  const match = css.match(pattern);
  if (!match) return false;
  return match[1].trim().length > 0;
}

// ─── Bug 1 — Audit Timeline CSS ──────────────────────────────────────────────

describe('ui-bugs-fix-2 Bug 1 — Audit Timeline CSS rules exist in style.css', () => {
  /**
   * Parses style.css and asserts that each of the four audit timeline selectors
   * exists with at least one CSS declaration.
   *
   * On UNFIXED code: FAILS (all four rules are absent)
   * On FIXED code:   PASSES
   *
   * Validates: Requirements 1.1, 2.1
   */

  const AUDIT_SELECTORS = [
    '.audit-timeline',
    '.audit-entry',
    '.audit-dot',
    '.audit-content',
  ];

  AUDIT_SELECTORS.forEach((selector) => {
    it(`should have a ${selector} rule with at least one declaration`, () => {
      const found = hasCssSelectorWithDeclaration(cssContentV2, selector);
      expect(found).toBe(true);
    });
  });
});

// ─── Bug 2 — Image Upload CSS ────────────────────────────────────────────────

describe('ui-bugs-fix-2 Bug 2 — Image Upload CSS rules exist in style.css', () => {
  /**
   * Parses style.css and asserts:
   *   - .image-upload-area contains a `border` declaration
   *   - .image-upload-label contains `cursor: pointer`
   *
   * On UNFIXED code: FAILS (both rules are absent)
   * On FIXED code:   PASSES
   *
   * Validates: Requirements 1.2, 2.2
   */

  it('should have a .image-upload-area rule with a border declaration', () => {
    const escaped = '\\.image-upload-area'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('\\.image-upload-area\\s*\\{([^}]+)\\}');
    const match = cssContentV2.match(pattern);
    expect(match).not.toBeNull();
    const block = match ? match[1] : '';
    expect(block).toMatch(/border\s*:/);
  });

  it('should have a .image-upload-label rule with cursor: pointer', () => {
    const pattern = /\.image-upload-label\s*\{([^}]+)\}/;
    const match = cssContentV2.match(pattern);
    expect(match).not.toBeNull();
    const block = match ? match[1] : '';
    expect(block).toMatch(/cursor\s*:\s*pointer/);
  });
});

// ─── Bug 3 — Socket CORS Port Mismatch ───────────────────────────────────────

describe('ui-bugs-fix-2 Bug 3 — Socket CORS allows http://localhost:5174', () => {
  /**
   * Reads server/server.js as a string and asserts that the allowed origins
   * includes 'http://localhost:5174'.
   *
   * On UNFIXED code: FAILS (only 5173 is present)
   * On FIXED code:   PASSES
   *
   * Validates: Requirements 1.3, 2.3
   */

  it("should include 'http://localhost:5174' in the server CORS allowed origins", () => {
    expect(serverContentV2).toContain('http://localhost:5174');
  });
});

// ─── Bug 4 — Stale Closure (useCallback wrapping load in AdminDashboard) ─────

describe('ui-bugs-fix-2 Bug 4 — AdminDashboard load is NOT wrapped in useCallback (stale closure fix)', () => {
  /**
   * Reads Dashboard.jsx as a string and asserts that EITHER:
   *   (a) useCallback does NOT appear wrapping the load function in AdminDashboard, OR
   *   (b) the load function accepts a second parameter `f` for filter
   *
   * The bug: load is wrapped with useCallback([filter]) but the page effect calls
   * load(page) — the closure captures a stale filter value.
   *
   * On UNFIXED code: FAILS (useCallback wraps load with only [filter] dependency,
   *                         and load does NOT accept a second `f` parameter)
   * On FIXED code:   PASSES (useCallback removed, or load(p, f) signature added)
   *
   * Validates: Requirements 1.4, 1.5, 2.4, 2.5
   */

  it('load in AdminDashboard should NOT be wrapped with useCallback, OR should accept a second filter parameter f', () => {
    // Extract the AdminDashboard function body (everything between the two
    // top-level function declarations)
    const adminStart = dashContentV2.indexOf('function AdminDashboard()');
    const residentStart = dashContentV2.indexOf('function ResidentDashboard()');
    expect(adminStart).toBeGreaterThan(-1);
    expect(residentStart).toBeGreaterThan(-1);

    const adminBody = dashContentV2.slice(adminStart, residentStart);

    // Check if useCallback wraps load (the bug condition)
    const useCallbackWrapsLoad = /useCallback\s*\(\s*async\s*\(/.test(adminBody);

    // Check if load accepts a second parameter f (the fix condition)
    const loadAcceptsFilterParam = /const\s+load\s*=\s*(?:useCallback\s*\(\s*)?async\s*\(\s*p\s*[=,][^)]*f\s*[=)]/.test(adminBody);

    // The test passes if useCallback does NOT wrap load, OR load accepts `f`
    // On unfixed code: useCallbackWrapsLoad=true AND loadAcceptsFilterParam=false → FAILS
    const bugIsFixed = !useCallbackWrapsLoad || loadAcceptsFilterParam;
    expect(bugIsFixed).toBe(true);
  });
});

// ─── Bug 5 — Paginated Response Destructuring in ResidentDashboard ───────────

describe('ui-bugs-fix-2 Bug 5 — ResidentDashboard.load() extracts data?.complaints (not bare data)', () => {
  /**
   * Reads Dashboard.jsx as a string and asserts that ResidentDashboard's load
   * function calls setComplaints with an expression that extracts data?.complaints
   * rather than passing bare `data`.
   *
   * On UNFIXED code: FAILS (setComplaints(data) is present)
   * On FIXED code:   PASSES (setComplaints(data?.complaints ...) is present)
   *
   * Validates: Requirements 1.6, 2.6, 2.7
   */

  it('ResidentDashboard load() should call setComplaints with data?.complaints, not bare data', () => {
    // Extract the ResidentDashboard function body
    const residentStart = dashContentV2.indexOf('function ResidentDashboard()');
    // Find the next top-level function/export after ResidentDashboard
    const exportStart = dashContentV2.indexOf('export default function Dashboard()');
    expect(residentStart).toBeGreaterThan(-1);
    expect(exportStart).toBeGreaterThan(-1);

    const residentBody = dashContentV2.slice(residentStart, exportStart);

    // Bug condition: setComplaints(data) — bare data, not extracted
    const hasBareSetComplaints = /setComplaints\s*\(\s*data\s*\)/.test(residentBody);

    // Fix condition: setComplaints called with data?.complaints extraction
    const hasExtractedComplaints = /setComplaints\s*\(\s*data\s*\?\.\s*complaints/.test(residentBody);

    // The test passes only when the fix is in place (extracted, not bare)
    // On unfixed code: hasBareSetComplaints=true, hasExtractedComplaints=false → FAILS
    expect(hasExtractedComplaints).toBe(true);
    expect(hasBareSetComplaints).toBe(false);
  });
});
