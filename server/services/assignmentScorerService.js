/**
 * Assignment Scorer Service
 *
 * Ranks available technicians for a given complaint using a weighted composite score:
 *   Composite = (0.5 × skillMatch) + (0.3 × workload) + (0.2 × performance)
 *
 * Only technicians that are online AND have remaining slots today are considered.
 */

import Complaint from '../models/Complaint.js';
import Technician from '../models/Technician.js';
import { computeRemainingSlotsToday } from '../utils/engineerUtils.js';
import { computePerformanceScore, computeCompositeScore } from '../utils/mlUtils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the start-of-today (midnight) and end-of-today (23:59:59.999) as Dates.
 */
function getTodayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Computes the skill match score between a technician's skillType and the complaint's issueType.
 *
 * @param {string} technicianSkillType - The technician's skill type
 * @param {string} complaintIssueType  - The complaint's issue type
 * @returns {number} 1.0 (exact match), 0.5 (General Maintenance), 0.0 (otherwise)
 */
function computeSkillMatchScore(technicianSkillType, complaintIssueType) {
  if (technicianSkillType === complaintIssueType) return 1.0;
  if (technicianSkillType === 'General Maintenance') return 0.5;
  return 0.0;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scores and ranks all online technicians with available slots for a given complaint.
 *
 * @param {string} complaintId - MongoDB ObjectId string of the complaint to score for
 * @returns {Promise<{
 *   complaintId: string,
 *   issueType: string,
 *   ranked: Array<object>,
 *   reason: string|null
 * }>}
 */
export async function scoreAndRankTechnicians(complaintId) {
  try {
    // ------------------------------------------------------------------
    // 1. Fetch the complaint
    // ------------------------------------------------------------------
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }

    // ------------------------------------------------------------------
    // 2. Fetch all online technicians (with populated user info)
    // ------------------------------------------------------------------
    const technicians = await Technician.find({ isOnline: true }).populate(
      'user',
      'name email'
    );

    if (technicians.length === 0) {
      return {
        complaintId: String(complaintId),
        issueType: complaint.issueType,
        ranked: [],
        reason: 'No online technicians with available slots today.',
      };
    }

    // ------------------------------------------------------------------
    // 3. Compute remainingSlotsToday for each technician and filter
    // ------------------------------------------------------------------
    const { start: todayStart, end: todayEnd } = getTodayBounds();

    const candidatePromises = technicians.map(async (tech) => {
      // Query today's non-cancelled complaints assigned to this technician
      const todaysComplaints = await Complaint.find({
        assignedTechnician: tech.user._id,
        status: { $ne: 'Cancelled' },
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }).select('status');

      const remainingSlotsToday = computeRemainingSlotsToday(
        tech.dailySlotCapacity,
        todaysComplaints
      );

      return { tech, remainingSlotsToday };
    });

    const allCandidates = await Promise.all(candidatePromises);

    // Keep only technicians with at least one remaining slot
    const candidates = allCandidates.filter((c) => c.remainingSlotsToday > 0);

    if (candidates.length === 0) {
      return {
        complaintId: String(complaintId),
        issueType: complaint.issueType,
        ranked: [],
        reason: 'No online technicians with available slots today.',
      };
    }

    // ------------------------------------------------------------------
    // 4. Score each candidate
    // ------------------------------------------------------------------
    const scoredPromises = candidates.map(async ({ tech, remainingSlotsToday }) => {
      // --- Skill match score ---
      const skillMatchScore = computeSkillMatchScore(
        tech.skillType,
        complaint.issueType
      );

      // --- Workload score ---
      // Higher remaining slots → higher workload score (more capacity available)
      const workloadScore = Math.min(
        remainingSlotsToday / tech.dailySlotCapacity,
        1
      );

      // --- Performance score ---
      // Query total and completed complaint counts for this technician
      const [totalAssigned, completedCount, ratingAgg] = await Promise.all([
        Complaint.countDocuments({ assignedTechnician: tech.user._id }),
        Complaint.countDocuments({
          assignedTechnician: tech.user._id,
          status: 'Completed',
        }),
        Complaint.aggregate([
          {
            $match: {
              assignedTechnician: tech.user._id,
              feedbackRating: { $ne: null },
            },
          },
          {
            $group: {
              _id: null,
              avgRating: { $avg: '$feedbackRating' },
            },
          },
        ]),
      ]);

      const avgRating =
        ratingAgg.length > 0 ? ratingAgg[0].avgRating : null;

      const performanceScore = computePerformanceScore(
        completedCount,
        totalAssigned,
        avgRating
      );

      // --- Composite score ---
      const compositeScore = computeCompositeScore(
        skillMatchScore,
        workloadScore,
        performanceScore
      );

      return {
        technicianId: String(tech._id),
        userId: String(tech.user._id),
        name: tech.user.name,
        email: tech.user.email,
        skillType: tech.skillType,
        skillMatchScore,
        workloadScore,
        performanceScore,
        compositeScore,
        remainingSlotsToday,
        dailySlotCapacity: tech.dailySlotCapacity,
        isOnline: tech.isOnline,
      };
    });

    const scored = await Promise.all(scoredPromises);

    // ------------------------------------------------------------------
    // 5. Sort descending by compositeScore
    // ------------------------------------------------------------------
    const ranked = scored.sort((a, b) => b.compositeScore - a.compositeScore);

    return {
      complaintId: String(complaintId),
      issueType: complaint.issueType,
      ranked,
      reason: null,
    };
  } catch (err) {
    console.error('[AssignmentScorer] scoreAndRankTechnicians error:', err.message);
    throw err;
  }
}
