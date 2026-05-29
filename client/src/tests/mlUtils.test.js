/**
 * Unit tests for server/utils/mlUtils.js
 *
 * All functions are pure and side-effect-free, so they can be imported and
 * tested directly without any server infrastructure.
 *
 * Validates: Requirements 1.2–1.5, 2.1–2.3, 4.2, 5.2, 6.2, 7.1–7.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the server utils path relative to this test file
const ML_UTILS_PATH = path.resolve(__dirname, '../../../server/utils/mlUtils.js');

// Dynamically import so we get the real ES module
const {
  computeCompositeScore,
  computePerformanceScore,
  computeEscalationRisk,
  cosineSimilarity,
  buildTfIdfVectors,
  lexiconSentiment,
  computeMedian,
  deriveApartmentBlock,
} = await import(ML_UTILS_PATH);

// ─── 1. computeCompositeScore ─────────────────────────────────────────────────

describe('computeCompositeScore', () => {
  it('computes the weighted sum correctly', () => {
    // (0.5 * 1.0) + (0.3 * 1.0) + (0.2 * 1.0) = 1.0
    expect(computeCompositeScore(1.0, 1.0, 1.0)).toBe(1.0);
  });

  it('returns 0 when all inputs are 0', () => {
    expect(computeCompositeScore(0, 0, 0)).toBe(0);
  });

  it('rounds to 4 decimal places', () => {
    // (0.5 * 0.5) + (0.3 * 0.6667) + (0.2 * 0.75)
    // = 0.25 + 0.20001 + 0.15 = 0.60001 → 0.6
    const result = computeCompositeScore(0.5, 0.6667, 0.75);
    expect(result).toBe(Math.round(result * 10000) / 10000);
    expect(result.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it('uses correct weights: 0.5 skill, 0.3 workload, 0.2 performance', () => {
    // Only skillMatch = 1, rest = 0 → 0.5
    expect(computeCompositeScore(1, 0, 0)).toBe(0.5);
    // Only workload = 1, rest = 0 → 0.3
    expect(computeCompositeScore(0, 1, 0)).toBe(0.3);
    // Only performance = 1, rest = 0 → 0.2
    expect(computeCompositeScore(0, 0, 1)).toBe(0.2);
  });

  it('matches the design example: skill=1, workload=0.6667, performance=0.75', () => {
    const result = computeCompositeScore(1.0, 0.6667, 0.75);
    // (0.5*1) + (0.3*0.6667) + (0.2*0.75) = 0.5 + 0.20001 + 0.15 = 0.85001
    expect(result).toBeCloseTo(0.85, 2);
  });
});

// ─── 2. computePerformanceScore ───────────────────────────────────────────────

describe('computePerformanceScore', () => {
  it('returns 0.5 when totalAssigned === 0 and avgRating is null', () => {
    expect(computePerformanceScore(0, 0, null)).toBe(0.5);
  });

  it('returns 0.5 when totalAssigned === 0 and avgRating is undefined', () => {
    expect(computePerformanceScore(0, 0, undefined)).toBe(0.5);
  });

  it('computes correctly with full data', () => {
    // resolutionRate = 8/10 = 0.8
    // normalizedRating = (4 - 1) / 4 = 0.75
    // result = (0.8 + 0.75) / 2 = 0.775
    expect(computePerformanceScore(8, 10, 4)).toBe(0.775);
  });

  it('clamps normalizedRating to [0, 1] for rating = 1 (min)', () => {
    // normalizedRating = (1 - 1) / 4 = 0
    // resolutionRate = 5/5 = 1
    // result = (1 + 0) / 2 = 0.5
    expect(computePerformanceScore(5, 5, 1)).toBe(0.5);
  });

  it('clamps normalizedRating to [0, 1] for rating = 5 (max)', () => {
    // normalizedRating = (5 - 1) / 4 = 1
    // resolutionRate = 5/5 = 1
    // result = (1 + 1) / 2 = 1
    expect(computePerformanceScore(5, 5, 5)).toBe(1.0);
  });

  it('uses max(totalAssigned, 1) to avoid division by zero when totalAssigned=0 but avgRating is set', () => {
    // totalAssigned=0 but avgRating=3 → not the "no data" case
    // resolutionRate = 0 / max(0,1) = 0
    // normalizedRating = (3-1)/4 = 0.5
    // result = (0 + 0.5) / 2 = 0.25
    expect(computePerformanceScore(0, 0, 3)).toBe(0.25);
  });

  it('handles perfect score: all completed, rating 5', () => {
    expect(computePerformanceScore(10, 10, 5)).toBe(1.0);
  });

  it('handles zero completed, rating 1', () => {
    // resolutionRate = 0/10 = 0, normalizedRating = 0
    expect(computePerformanceScore(0, 10, 1)).toBe(0);
  });
});

// ─── 3. computeEscalationRisk ─────────────────────────────────────────────────

describe('computeEscalationRisk', () => {
  it('returns 0.15 for a brand-new unassigned Urgent complaint (elapsed ≈ 0)', () => {
    const now = new Date();
    const result = computeEscalationRisk(now, 'Urgent', false);
    // timeRatio ≈ 0, assignmentPenalty = 0.15 → ≈ 0.15
    expect(result).toBeCloseTo(0.15, 2);
  });

  it('returns 0 for a brand-new assigned Urgent complaint (elapsed ≈ 0)', () => {
    const now = new Date();
    const result = computeEscalationRisk(now, 'Urgent', true);
    expect(result).toBeCloseTo(0, 2);
  });

  it('returns 1.0 when SLA is fully elapsed and unassigned', () => {
    // Urgent SLA = 8h; set createdAt to 8h ago
    const createdAt = new Date(Date.now() - 8 * 3_600_000);
    const result = computeEscalationRisk(createdAt, 'Urgent', false);
    // timeRatio = 1.0, penalty = 0.15 → min(1.15, 1.0) = 1.0
    expect(result).toBe(1.0);
  });

  it('clamps to 1.0 when elapsed exceeds SLA', () => {
    const createdAt = new Date(Date.now() - 100 * 3_600_000); // 100h ago
    const result = computeEscalationRisk(createdAt, 'Low', false);
    expect(result).toBe(1.0);
  });

  it('rounds to 4 decimal places', () => {
    const createdAt = new Date(Date.now() - 4 * 3_600_000); // 4h ago
    const result = computeEscalationRisk(createdAt, 'Urgent', true);
    // timeRatio = 4/8 = 0.5, penalty = 0 → 0.5
    expect(result).toBe(0.5);
    expect(result.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it('uses correct SLA windows: Urgent=8, High=24, Medium=48, Low=72', () => {
    const halfUrgent = new Date(Date.now() - 4 * 3_600_000);
    const halfHigh   = new Date(Date.now() - 12 * 3_600_000);
    const halfMedium = new Date(Date.now() - 24 * 3_600_000);
    const halfLow    = new Date(Date.now() - 36 * 3_600_000);

    expect(computeEscalationRisk(halfUrgent, 'Urgent', true)).toBeCloseTo(0.5, 2);
    expect(computeEscalationRisk(halfHigh,   'High',   true)).toBeCloseTo(0.5, 2);
    expect(computeEscalationRisk(halfMedium, 'Medium', true)).toBeCloseTo(0.5, 2);
    expect(computeEscalationRisk(halfLow,    'Low',    true)).toBeCloseTo(0.5, 2);
  });
});

// ─── 4. cosineSimilarity ──────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const vec = { water: 0.5, leak: 0.8, pipe: 0.3 };
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors (no shared terms)', () => {
    const vecA = { water: 1.0 };
    const vecB = { fire: 1.0 };
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('returns 0 when vecA is empty', () => {
    expect(cosineSimilarity({}, { water: 1.0 })).toBe(0);
  });

  it('returns 0 when vecB is empty', () => {
    expect(cosineSimilarity({ water: 1.0 }, {})).toBe(0);
  });

  it('returns 0 when both vectors are empty', () => {
    expect(cosineSimilarity({}, {})).toBe(0);
  });

  it('returns a value in [0, 1] for partially overlapping vectors', () => {
    const vecA = { water: 1.0, leak: 0.5 };
    const vecB = { water: 0.8, pipe: 0.6 };
    const result = cosineSimilarity(vecA, vecB);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('is symmetric: sim(A,B) === sim(B,A)', () => {
    const vecA = { water: 1.0, leak: 0.5, pipe: 0.3 };
    const vecB = { water: 0.8, drain: 0.4, pipe: 0.6 };
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(cosineSimilarity(vecB, vecA), 10);
  });

  it('computes a known value correctly', () => {
    // A = {x:3, y:4}, B = {x:3, y:4} → sim = 1
    // A = {x:1, y:0}, B = {x:0, y:1} → sim = 0
    // A = {x:1, y:1}, B = {x:1, y:0} → dot=1, |A|=√2, |B|=1 → 1/√2 ≈ 0.7071
    const vecA = { x: 1, y: 1 };
    const vecB = { x: 1, y: 0 };
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1 / Math.sqrt(2), 5);
  });
});

// ─── 5. buildTfIdfVectors ─────────────────────────────────────────────────────

describe('buildTfIdfVectors', () => {
  it('returns an array of the same length as documents', () => {
    // Mock a minimal natural.TfIdf-like object
    const mockTfidf = {
      listTerms: (docIndex) => {
        if (docIndex === 0) return [{ term: 'water', tfidf: 0.5 }, { term: 'leak', tfidf: 0.3 }];
        if (docIndex === 1) return [{ term: 'fire', tfidf: 0.8 }];
        return [];
      },
    };
    const docs = ['water leak', 'fire alarm'];
    const vectors = buildTfIdfVectors(mockTfidf, docs);
    expect(vectors).toHaveLength(2);
  });

  it('builds correct sparse maps from tfidf.listTerms', () => {
    const mockTfidf = {
      listTerms: (docIndex) => {
        if (docIndex === 0) return [{ term: 'water', tfidf: 0.5 }, { term: 'leak', tfidf: 0.3 }];
        return [];
      },
    };
    const vectors = buildTfIdfVectors(mockTfidf, ['water leak']);
    expect(vectors[0]).toEqual({ water: 0.5, leak: 0.3 });
  });

  it('returns empty maps for documents with no terms', () => {
    const mockTfidf = {
      listTerms: () => [],
    };
    const vectors = buildTfIdfVectors(mockTfidf, ['', '']);
    expect(vectors[0]).toEqual({});
    expect(vectors[1]).toEqual({});
  });
});

// ─── 6. lexiconSentiment ──────────────────────────────────────────────────────

describe('lexiconSentiment', () => {
  it('returns Positive for clearly positive text', () => {
    const result = lexiconSentiment('The service was great and the technician was helpful');
    expect(result.label).toBe('Positive');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });

  it('returns Negative for clearly negative text', () => {
    const result = lexiconSentiment('The service was terrible and the technician was rude');
    expect(result.label).toBe('Negative');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });

  it('returns Neutral when no sentiment words are present', () => {
    const result = lexiconSentiment('The technician arrived at 3pm');
    expect(result.label).toBe('Neutral');
    expect(result.confidence).toBe(0.5);
  });

  it('returns Neutral when positive and negative counts are equal', () => {
    const result = lexiconSentiment('great but bad');
    expect(result.label).toBe('Neutral');
    expect(result.confidence).toBe(0.5);
  });

  it('caps confidence at 0.9', () => {
    // 5 positive words → 0.5 + 5*0.1 = 1.0 → capped at 0.9
    const result = lexiconSentiment('great excellent good fast helpful satisfied');
    expect(result.label).toBe('Positive');
    expect(result.confidence).toBe(0.9);
  });

  it('is case-insensitive', () => {
    const result = lexiconSentiment('GREAT service, EXCELLENT work');
    expect(result.label).toBe('Positive');
  });

  it('handles punctuation correctly (splits on non-word chars)', () => {
    const result = lexiconSentiment('great! excellent. amazing,');
    expect(result.label).toBe('Positive');
  });

  it('confidence formula: 0.5 + count * 0.1 for single positive word', () => {
    const result = lexiconSentiment('great');
    expect(result.label).toBe('Positive');
    expect(result.confidence).toBeCloseTo(0.6, 5);
  });

  it('confidence formula: 0.5 + count * 0.1 for single negative word', () => {
    const result = lexiconSentiment('terrible');
    expect(result.label).toBe('Negative');
    expect(result.confidence).toBeCloseTo(0.6, 5);
  });
});

// ─── 7. computeMedian ─────────────────────────────────────────────────────────

describe('computeMedian', () => {
  it('returns 0 for an empty array', () => {
    expect(computeMedian([])).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(computeMedian(null)).toBe(0);
    expect(computeMedian(undefined)).toBe(0);
  });

  it('returns the single element for a one-element array', () => {
    expect(computeMedian([42])).toBe(42);
  });

  it('returns the middle element for an odd-length array', () => {
    expect(computeMedian([3, 1, 2])).toBe(2);
  });

  it('returns the average of the two middle elements for an even-length array', () => {
    expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it('sorts the array before computing median', () => {
    expect(computeMedian([10, 1, 5, 3, 7])).toBe(5);
  });

  it('does not mutate the original array', () => {
    const arr = [5, 3, 1];
    computeMedian(arr);
    expect(arr).toEqual([5, 3, 1]);
  });

  it('handles duplicate values', () => {
    expect(computeMedian([2, 2, 2, 2])).toBe(2);
  });

  it('handles negative numbers', () => {
    expect(computeMedian([-3, -1, -2])).toBe(-2);
  });
});

// ─── 8. deriveApartmentBlock ──────────────────────────────────────────────────

describe('deriveApartmentBlock', () => {
  it('extracts single-letter prefix: "A-204" → "A"', () => {
    expect(deriveApartmentBlock('A-204')).toBe('A');
  });

  it('extracts single-letter prefix: "B12" → "B"', () => {
    expect(deriveApartmentBlock('B12')).toBe('B');
  });

  it('returns original string when no alphabetic prefix: "204" → "204"', () => {
    expect(deriveApartmentBlock('204')).toBe('204');
  });

  it('extracts multi-letter prefix: "AB-101" → "AB"', () => {
    expect(deriveApartmentBlock('AB-101')).toBe('AB');
  });

  it('handles lowercase prefix', () => {
    expect(deriveApartmentBlock('c-301')).toBe('c');
  });

  it('handles all-alpha string: "Tower" → "Tower"', () => {
    expect(deriveApartmentBlock('Tower')).toBe('Tower');
  });

  it('handles numeric-only string: "999" → "999"', () => {
    expect(deriveApartmentBlock('999')).toBe('999');
  });

  it('coerces non-string input to string', () => {
    // Should not throw; returns the string representation
    expect(() => deriveApartmentBlock(204)).not.toThrow();
    expect(deriveApartmentBlock(204)).toBe('204');
  });
});
