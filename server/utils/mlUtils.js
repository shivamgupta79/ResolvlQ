/**
 * Pure, side-effect-free math/ML utility functions shared across all ML services.
 * No I/O, no database calls — all functions are deterministic.
 */

// ---------------------------------------------------------------------------
// SLA Windows (hours) used by the Escalation_Predictor
// ---------------------------------------------------------------------------
const SLA_WINDOWS = { Urgent: 8, High: 24, Medium: 48, Low: 72 };

// ---------------------------------------------------------------------------
// Sentiment word lists used by the Sentiment_Analyzer
// ---------------------------------------------------------------------------
const POSITIVE_WORDS = [
  'great', 'excellent', 'good', 'fast', 'helpful', 'satisfied',
  'thank', 'perfect', 'amazing', 'prompt', 'professional', 'resolved',
];

const NEGATIVE_WORDS = [
  'bad', 'terrible', 'slow', 'rude', 'broken', 'unresolved',
  'disappointed', 'awful', 'poor', 'useless', 'late', 'ignored',
];

// ---------------------------------------------------------------------------
// 1. computeCompositeScore
// ---------------------------------------------------------------------------

/**
 * Computes the weighted composite assignment score for a technician.
 *
 * Formula: (0.5 × skillMatch) + (0.3 × workload) + (0.2 × performance)
 *
 * @param {number} skillMatch   - Skill match score in [0, 1]
 * @param {number} workload     - Workload score in [0, 1]
 * @param {number} performance  - Performance score in [0, 1]
 * @returns {number} Composite score rounded to 4 decimal places
 */
export function computeCompositeScore(skillMatch, workload, performance) {
  const raw = 0.5 * skillMatch + 0.3 * workload + 0.2 * performance;
  return Math.round(raw * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// 2. computePerformanceScore
// ---------------------------------------------------------------------------

/**
 * Computes a technician's performance score from historical data.
 *
 * resolutionRate   = completedCount / max(totalAssigned, 1)
 * normalizedRating = clamp((avgRating - 1) / 4, 0, 1)
 * result           = (resolutionRate + normalizedRating) / 2
 *
 * Returns 0.5 when totalAssigned === 0 AND avgRating is null/undefined
 * (i.e. no historical data exists).
 *
 * @param {number}      completedCount  - Number of completed complaints
 * @param {number}      totalAssigned   - Total complaints ever assigned
 * @param {number|null} avgRating       - Average feedback rating (1–5) or null
 * @returns {number} Performance score in [0, 1]
 */
export function computePerformanceScore(completedCount, totalAssigned, avgRating) {
  // No historical data at all → default
  if (totalAssigned === 0 && (avgRating == null)) {
    return 0.5;
  }

  const resolutionRate = completedCount / Math.max(totalAssigned, 1);

  let normalizedRating;
  if (avgRating == null) {
    normalizedRating = 0;
  } else {
    normalizedRating = Math.min(Math.max((avgRating - 1) / 4, 0), 1);
  }

  return (resolutionRate + normalizedRating) / 2;
}

// ---------------------------------------------------------------------------
// 3. computeEscalationRisk
// ---------------------------------------------------------------------------

/**
 * Computes the escalation risk score for a complaint.
 *
 * timeRatio         = min(elapsedHours / SLA_WINDOWS[priority], 1.0)
 * assignmentPenalty = isAssigned ? 0 : 0.15
 * result            = min(timeRatio + assignmentPenalty, 1.0), rounded to 4dp
 *
 * @param {Date|string|number} createdAt  - Complaint creation timestamp
 * @param {string}             priority   - 'Urgent' | 'High' | 'Medium' | 'Low'
 * @param {boolean}            isAssigned - Whether the complaint has an assigned technician
 * @returns {number} Escalation risk score in [0, 1], rounded to 4 decimal places
 */
export function computeEscalationRisk(createdAt, priority, isAssigned) {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedHours = elapsedMs / 3_600_000;

  const slaHours = SLA_WINDOWS[priority] ?? 48; // fallback to Medium if unknown
  const timeRatio = Math.min(elapsedHours / slaHours, 1.0);

  const assignmentPenalty = isAssigned ? 0 : 0.15;

  const raw = Math.min(timeRatio + assignmentPenalty, 1.0);
  return Math.round(raw * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// 4. cosineSimilarity
// ---------------------------------------------------------------------------

/**
 * Computes cosine similarity between two sparse term-weight maps.
 *
 * @param {{ [term: string]: number }} vecA - First sparse vector
 * @param {{ [term: string]: number }} vecB - Second sparse vector
 * @returns {number} Cosine similarity in [0, 1]; 0 if either magnitude is 0
 */
export function cosineSimilarity(vecA, vecB) {
  const termsA = Object.keys(vecA);
  const termsB = Object.keys(vecB);

  // Dot product (only need to iterate over one vector's terms)
  let dot = 0;
  for (const term of termsA) {
    if (vecB[term] !== undefined) {
      dot += vecA[term] * vecB[term];
    }
  }

  // Magnitudes
  let magA = 0;
  for (const term of termsA) {
    magA += vecA[term] * vecA[term];
  }
  magA = Math.sqrt(magA);

  let magB = 0;
  for (const term of termsB) {
    magB += vecB[term] * vecB[term];
  }
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// ---------------------------------------------------------------------------
// 5. buildTfIdfVectors
// ---------------------------------------------------------------------------

/**
 * Builds an array of sparse TF-IDF term-weight maps from a natural.TfIdf instance.
 *
 * Each element in the returned array corresponds to the document at the same
 * index in `documents`.
 *
 * @param {object}   tfidf     - A `natural.TfIdf` instance with documents already added
 * @param {string[]} documents - The original document strings (used to determine count)
 * @returns {Array<{ [term: string]: number }>} Sparse term-weight maps
 */
export function buildTfIdfVectors(tfidf, documents) {
  return documents.map((_, docIndex) => {
    const vec = {};
    tfidf.listTerms(docIndex).forEach(({ term, tfidf: weight }) => {
      vec[term] = weight;
    });
    return vec;
  });
}

// ---------------------------------------------------------------------------
// 6. lexiconSentiment
// ---------------------------------------------------------------------------

/**
 * Classifies the sentiment of a text string using a simple word-count lexicon.
 *
 * @param {string} text - Input text to classify
 * @returns {{ label: 'Positive'|'Neutral'|'Negative', confidence: number }}
 */
export function lexiconSentiment(text) {
  const tokens = text.toLowerCase().split(/\W+/);

  const posScore = tokens.filter((t) => POSITIVE_WORDS.includes(t)).length;
  const negScore = tokens.filter((t) => NEGATIVE_WORDS.includes(t)).length;

  if (posScore > negScore) {
    return {
      label: 'Positive',
      confidence: Math.min(0.5 + posScore * 0.1, 0.9),
    };
  } else if (negScore > posScore) {
    return {
      label: 'Negative',
      confidence: Math.min(0.5 + negScore * 0.1, 0.9),
    };
  } else {
    return { label: 'Neutral', confidence: 0.5 };
  }
}

// ---------------------------------------------------------------------------
// 7. computeMedian
// ---------------------------------------------------------------------------

/**
 * Computes the median of a numeric array.
 *
 * - Returns 0 for an empty array.
 * - For even-length arrays, returns the average of the two middle values.
 *
 * @param {number[]} values - Numeric array
 * @returns {number} Median value
 */
export function computeMedian(values) {
  if (!values || values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  } else {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

// ---------------------------------------------------------------------------
// 8. deriveApartmentBlock
// ---------------------------------------------------------------------------

/**
 * Derives the apartment block identifier from an apartment number string.
 *
 * Extracts the leading alphabetic prefix. If there is no leading alphabetic
 * prefix, returns the original string unchanged.
 *
 * Examples:
 *   "A-204"  → "A"
 *   "B12"    → "B"
 *   "204"    → "204"
 *   "AB-101" → "AB"
 *
 * @param {string} apartmentNo - Apartment number string
 * @returns {string} Leading alphabetic prefix, or the original string if none
 */
export function deriveApartmentBlock(apartmentNo) {
  const match = String(apartmentNo).match(/^([A-Za-z]+)/);
  return match ? match[1] : String(apartmentNo);
}
