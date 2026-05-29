import crypto from 'crypto';
import OpenAI from 'openai';
import natural from 'natural';
import Complaint from '../models/Complaint.js';
import { cosineSimilarity, buildTfIdfVectors } from '../utils/mlUtils.js';

// ---------------------------------------------------------------------------
// OpenAI client (lazy — only instantiated when API key is present)
// ---------------------------------------------------------------------------
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch an OpenAI embedding vector for a given text string.
 * Returns a Float32Array-like plain number array, or null on failure.
 *
 * @param {OpenAI} openai
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
async function fetchEmbedding(openai, text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('[SimilarityEngine] Failed to fetch embedding:', err.message);
    return null;
  }
}

/**
 * Convert a dense embedding array to a sparse { index: value } map
 * compatible with cosineSimilarity.
 *
 * @param {number[]} arr
 * @returns {{ [key: string]: number }}
 */
function denseToSparse(arr) {
  const sparse = {};
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== 0) sparse[String(i)] = arr[i];
  }
  return sparse;
}

// ---------------------------------------------------------------------------
// findSimilarComplaints
// ---------------------------------------------------------------------------

/**
 * Find complaints similar to the given complaint and group duplicates.
 *
 * @param {string} complaintId - MongoDB ObjectId string of the target complaint
 * @returns {Promise<{
 *   complaintId: string,
 *   duplicateGroupId: string|null,
 *   suggestedTechnicianId: string|null,
 *   matches: Array<{
 *     complaintId: string,
 *     similarityScore: number,
 *     issueType: string,
 *     apartmentNo: string,
 *     assignedTechnician: string|null
 *   }>
 * }>}
 */
export async function findSimilarComplaints(complaintId) {
  try {
    // ------------------------------------------------------------------
    // 1. Fetch target complaint (include embedding field which is select:false)
    // ------------------------------------------------------------------
    const target = await Complaint.findById(complaintId).select('+embedding');
    if (!target) {
      throw new Error(`Complaint not found: ${complaintId}`);
    }

    // ------------------------------------------------------------------
    // 2. Fetch candidate open complaints from the last 30 days
    // ------------------------------------------------------------------
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates = await Complaint.find({
      _id: { $ne: target._id },
      status: { $nin: ['Completed', 'Cancelled'] },
      createdAt: { $gte: thirtyDaysAgo },
    }).select('+embedding');

    if (candidates.length === 0) {
      return {
        complaintId: String(target._id),
        duplicateGroupId: target.duplicateGroupId || null,
        suggestedTechnicianId: target.suggestedTechnicianId
          ? String(target.suggestedTechnicianId)
          : null,
        matches: [],
      };
    }

    // ------------------------------------------------------------------
    // 3. Compute similarity scores
    // ------------------------------------------------------------------
    const openai = getOpenAIClient();
    const useOpenAI = !!openai;

    /** @type {Array<{ candidate: object, score: number }>} */
    const scoredCandidates = [];

    if (useOpenAI) {
      // ----------------------------------------------------------------
      // OpenAI embedding path
      // ----------------------------------------------------------------

      // Get or fetch embedding for target
      let targetEmbedding = target.embedding && target.embedding.length > 0
        ? target.embedding
        : null;

      if (!targetEmbedding) {
        targetEmbedding = await fetchEmbedding(openai, target.description);
        if (targetEmbedding) {
          target.embedding = targetEmbedding;
          // Save asynchronously — don't block similarity computation
          target.save().catch((err) =>
            console.error('[SimilarityEngine] Failed to cache target embedding:', err.message)
          );
        }
      }

      if (!targetEmbedding) {
        // OpenAI failed for target — fall through to TF-IDF
        console.error('[SimilarityEngine] Could not obtain target embedding; falling back to TF-IDF');
      } else {
        const targetVec = denseToSparse(targetEmbedding);
        const docsToSave = [];

        for (const candidate of candidates) {
          let candidateEmbedding = candidate.embedding && candidate.embedding.length > 0
            ? candidate.embedding
            : null;

          if (!candidateEmbedding) {
            candidateEmbedding = await fetchEmbedding(openai, candidate.description);
            if (candidateEmbedding) {
              candidate.embedding = candidateEmbedding;
              docsToSave.push(candidate);
            }
          }

          if (!candidateEmbedding) {
            // Skip this candidate if we couldn't get its embedding
            continue;
          }

          const candidateVec = denseToSparse(candidateEmbedding);
          const score = cosineSimilarity(targetVec, candidateVec);
          scoredCandidates.push({ candidate, score });
        }

        // Bulk-save newly cached embeddings
        if (docsToSave.length > 0) {
          await Promise.all(
            docsToSave.map((doc) =>
              doc.save().catch((err) =>
                console.error('[SimilarityEngine] Failed to cache candidate embedding:', err.message)
              )
            )
          );
        }
      }
    }

    // If OpenAI path produced no scored candidates (either unavailable or all failed),
    // fall back to TF-IDF
    if (!useOpenAI || scoredCandidates.length === 0) {
      // ----------------------------------------------------------------
      // TF-IDF fallback path
      // ----------------------------------------------------------------
      const corpus = [target.description, ...candidates.map((c) => c.description)];
      const tfidf = new natural.TfIdf();
      corpus.forEach((doc) => tfidf.addDocument(doc));

      const vectors = buildTfIdfVectors(tfidf, corpus);
      const targetVec = vectors[0];

      for (let i = 0; i < candidates.length; i++) {
        const score = cosineSimilarity(targetVec, vectors[i + 1]);
        scoredCandidates.push({ candidate: candidates[i], score });
      }
    }

    // ------------------------------------------------------------------
    // 4. Collect matches above threshold
    // ------------------------------------------------------------------
    const THRESHOLD = 0.80;
    const matches = scoredCandidates.filter(({ score }) => score > THRESHOLD);

    if (matches.length === 0) {
      return {
        complaintId: String(target._id),
        duplicateGroupId: target.duplicateGroupId || null,
        suggestedTechnicianId: target.suggestedTechnicianId
          ? String(target.suggestedTechnicianId)
          : null,
        matches: [],
      };
    }

    // ------------------------------------------------------------------
    // 5. Determine or generate duplicateGroupId
    // ------------------------------------------------------------------
    let groupId = target.duplicateGroupId || null;

    // Reuse an existing group id from any match that already has one
    if (!groupId) {
      for (const { candidate } of matches) {
        if (candidate.duplicateGroupId) {
          groupId = candidate.duplicateGroupId;
          break;
        }
      }
    }

    // Generate a new UUID if no existing group id was found
    if (!groupId) {
      groupId = crypto.randomUUID();
    }

    // ------------------------------------------------------------------
    // 6. Determine suggestedTechnicianId
    // ------------------------------------------------------------------
    let suggestedTechnicianId = target.suggestedTechnicianId
      ? String(target.suggestedTechnicianId)
      : null;

    if (!suggestedTechnicianId) {
      for (const { candidate } of matches) {
        if (candidate.assignedTechnician) {
          suggestedTechnicianId = String(candidate.assignedTechnician);
          break;
        }
      }
    }

    // ------------------------------------------------------------------
    // 7. Tag target and untagged matches; bulk-save
    // ------------------------------------------------------------------
    const docsToUpdate = [];

    if (target.duplicateGroupId !== groupId || String(target.suggestedTechnicianId || '') !== (suggestedTechnicianId || '')) {
      target.duplicateGroupId = groupId;
      if (suggestedTechnicianId) {
        target.suggestedTechnicianId = suggestedTechnicianId;
      }
      docsToUpdate.push(target);
    }

    for (const { candidate } of matches) {
      if (!candidate.duplicateGroupId) {
        candidate.duplicateGroupId = groupId;
        docsToUpdate.push(candidate);
      }
    }

    // Bulk-save all modified documents
    if (docsToUpdate.length > 0) {
      await Promise.all(
        docsToUpdate.map((doc) =>
          doc.save().catch((err) =>
            console.error('[SimilarityEngine] Failed to save document:', err.message)
          )
        )
      );
    }

    // ------------------------------------------------------------------
    // 8. Build and return result
    // ------------------------------------------------------------------
    return {
      complaintId: String(target._id),
      duplicateGroupId: groupId,
      suggestedTechnicianId: suggestedTechnicianId || null,
      matches: matches.map(({ candidate, score }) => ({
        complaintId: String(candidate._id),
        similarityScore: Math.round(score * 10000) / 10000,
        issueType: candidate.issueType,
        apartmentNo: candidate.apartmentNo,
        assignedTechnician: candidate.assignedTechnician
          ? String(candidate.assignedTechnician)
          : null,
      })),
    };
  } catch (err) {
    console.error('[SimilarityEngine] findSimilarComplaints error:', err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// getDuplicateGroups
// ---------------------------------------------------------------------------

/**
 * Aggregate all complaints with a non-null duplicateGroupId and return
 * group summaries.
 *
 * @returns {Promise<Array<{
 *   duplicateGroupId: string,
 *   issueType: string,
 *   apartmentNumbers: string[],
 *   complaintIds: string[],
 *   suggestedTechnicianId: string|null
 * }>>}
 */
export async function getDuplicateGroups() {
  try {
    const groups = await Complaint.aggregate([
      {
        $match: { duplicateGroupId: { $ne: null } },
      },
      {
        $group: {
          _id: '$duplicateGroupId',
          issueType: { $first: '$issueType' },
          apartmentNumbers: { $addToSet: '$apartmentNo' },
          complaintIds: { $push: { $toString: '$_id' } },
          // Pick the first non-null suggestedTechnicianId in the group
          suggestedTechnicianId: {
            $first: {
              $cond: [
                { $ne: ['$suggestedTechnicianId', null] },
                { $toString: '$suggestedTechnicianId' },
                null,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          duplicateGroupId: '$_id',
          issueType: 1,
          apartmentNumbers: 1,
          complaintIds: 1,
          suggestedTechnicianId: 1,
        },
      },
      {
        $sort: { duplicateGroupId: 1 },
      },
    ]);

    return groups;
  } catch (err) {
    console.error('[SimilarityEngine] getDuplicateGroups error:', err.message);
    throw err;
  }
}
