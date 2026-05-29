/**
 * Resolution Predictor Service
 *
 * Estimates resolution time in hours and computes a predicted ETA for a
 * complaint based on historical data for the same issue type.
 *
 * Algorithm:
 *   - Aggregate completed complaints for the same issueType
 *   - Project duration as (completedAuditEntry.timestamp - createdAt) / 3_600_000
 *   - If ≥ 6 samples: predictedHours = median(durations), basedOn = 'historical'
 *   - Else: predictedHours = DEFAULT_DURATIONS[priority],  basedOn = 'default'
 *
 * Actual resolution is recorded when a complaint transitions to 'Completed'.
 */

import Complaint from '../models/Complaint.js';
import { computeMedian } from '../utils/mlUtils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_HISTORICAL_SAMPLES = 6;

const DEFAULT_DURATIONS = {
  Urgent: 4,
  High: 12,
  Medium: 24,
  Low: 48,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rounds a number to the specified number of decimal places.
 *
 * @param {number} value  - The value to round
 * @param {number} places - Number of decimal places (default 2)
 * @returns {number}
 */
function round(value, places = 2) {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// predictResolution
// ---------------------------------------------------------------------------

/**
 * Computes and persists `predictedResolutionHours` and `predictedETA` for a
 * complaint.
 *
 * Historical durations are derived from completed complaints of the same
 * issueType by finding the last audit log entry with status 'Completed' and
 * computing (entry.timestamp - createdAt) / 3_600_000.
 *
 * @param {string} complaintId - MongoDB ObjectId string of the complaint
 * @returns {Promise<{
 *   complaintId: string,
 *   issueType: string,
 *   priority: string,
 *   predictedResolutionHours: number,
 *   predictedETA: Date,
 *   actualResolutionHours: number|null,
 *   basedOn: 'historical'|'default'
 * }>}
 */
export async function predictResolution(complaintId) {
  try {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }

    // Aggregate completed complaints for the same issueType to build durations
    const completedComplaints = await Complaint.find({
      _id: { $ne: complaint._id },
      issueType: complaint.issueType,
      status: 'Completed',
    }).select('createdAt auditLog');

    // Extract duration (hours) from each completed complaint
    const durations = [];
    for (const c of completedComplaints) {
      // Find the last audit log entry with status === 'Completed'
      const completedEntry = [...c.auditLog]
        .reverse()
        .find((e) => e.status === 'Completed');

      if (completedEntry && completedEntry.timestamp && c.createdAt) {
        const durationHours =
          (new Date(completedEntry.timestamp).getTime() -
            new Date(c.createdAt).getTime()) /
          3_600_000;

        // Only include positive durations (sanity check)
        if (durationHours > 0) {
          durations.push(durationHours);
        }
      }
    }

    // Determine predicted hours and basis
    let predictedHours;
    let basedOn;

    if (durations.length >= MIN_HISTORICAL_SAMPLES) {
      predictedHours = computeMedian(durations);
      basedOn = 'historical';
    } else {
      predictedHours = DEFAULT_DURATIONS[complaint.priority] ?? DEFAULT_DURATIONS.Medium;
      basedOn = 'default';
    }

    // Persist predictions
    complaint.predictedResolutionHours = round(predictedHours, 2);
    complaint.predictedETA = new Date(
      complaint.createdAt.getTime() + predictedHours * 3_600_000
    );
    await complaint.save();

    return {
      complaintId: String(complaint._id),
      issueType: complaint.issueType,
      priority: complaint.priority,
      predictedResolutionHours: complaint.predictedResolutionHours,
      predictedETA: complaint.predictedETA,
      actualResolutionHours: complaint.actualResolutionHours,
      basedOn,
    };
  } catch (err) {
    console.error('[ResolutionPredictor] predictResolution error:', err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// recordActualResolution
// ---------------------------------------------------------------------------

/**
 * Computes and persists `actualResolutionHours` for a complaint that has
 * transitioned to 'Completed'.
 *
 * Finds the last audit log entry with status === 'Completed' and computes
 * actualHours = (entry.timestamp - complaint.createdAt) / 3_600_000.
 *
 * @param {string} complaintId - MongoDB ObjectId string of the complaint
 * @returns {Promise<{ complaintId: string, actualResolutionHours: number }>}
 */
export async function recordActualResolution(complaintId) {
  try {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }

    // Find the last audit log entry with status === 'Completed'
    const completedEntry = [...complaint.auditLog]
      .reverse()
      .find((e) => e.status === 'Completed');

    if (!completedEntry || !completedEntry.timestamp) {
      const err = new Error(
        'No completed audit log entry found for this complaint.'
      );
      err.statusCode = 400;
      throw err;
    }

    const actualHours =
      (new Date(completedEntry.timestamp).getTime() -
        new Date(complaint.createdAt).getTime()) /
      3_600_000;

    complaint.actualResolutionHours = round(actualHours, 2);
    await complaint.save();

    return {
      complaintId: String(complaint._id),
      actualResolutionHours: complaint.actualResolutionHours,
    };
  } catch (err) {
    console.error('[ResolutionPredictor] recordActualResolution error:', err.message);
    throw err;
  }
}
