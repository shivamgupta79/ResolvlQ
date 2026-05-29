/**
 * Escalation Predictor Service
 *
 * Computes an escalation risk score for open complaints and auto-escalates
 * those above the threshold (> 0.75).
 *
 * Risk formula (from mlUtils.computeEscalationRisk):
 *   timeRatio         = min(elapsedHours / SLA_WINDOWS[priority], 1.0)
 *   assignmentPenalty = isAssigned ? 0 : 0.15
 *   score             = min(timeRatio + assignmentPenalty, 1.0), rounded to 4dp
 *
 * SLA Windows: Urgent=8h, High=24h, Medium=48h, Low=72h
 */

import Complaint from '../models/Complaint.js';
import { computeEscalationRisk } from '../utils/mlUtils.js';

// io is imported dynamically inside functions to avoid circular ESM dependency
async function getIo() {
  const { io } = await import('../server.js');
  return io;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ESCALATION_THRESHOLD = 0.75;
const ESCALATION_REASON = 'Auto-escalated by Escalation_Predictor';

// ---------------------------------------------------------------------------
// evaluateSingleComplaint
// ---------------------------------------------------------------------------

/**
 * Fetches a single complaint, computes its escalation risk score, and
 * auto-escalates it if the score exceeds the threshold.
 *
 * @param {string} complaintId - MongoDB ObjectId string of the complaint
 * @returns {Promise<{
 *   complaintId: string,
 *   escalationRiskScore: number,
 *   autoEscalated: boolean
 * }>}
 */
export async function evaluateSingleComplaint(complaintId) {
  try {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }

    const isAssigned = complaint.assignedTechnician != null;
    const escalationRiskScore = computeEscalationRisk(
      complaint.createdAt,
      complaint.priority,
      isAssigned
    );

    let autoEscalated = false;

    if (escalationRiskScore > ESCALATION_THRESHOLD && !complaint.escalated) {
      complaint.escalated = true;
      complaint.auditLog.push({
        status: complaint.status,
        changedByName: 'System',
        changedByRole: 'system',
        reason: ESCALATION_REASON,
      });
      await complaint.save();

      const io = await getIo();
      io.emit('complaint:updated', {
        _id: complaint._id,
        priority: complaint.priority,
        escalated: true,
      });

      autoEscalated = true;
    }

    return {
      complaintId: String(complaint._id),
      escalationRiskScore,
      autoEscalated,
    };
  } catch (err) {
    console.error('[EscalationPredictor] evaluateSingleComplaint error:', err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// evaluateAllOpenComplaints
// ---------------------------------------------------------------------------

/**
 * Fetches all open, non-escalated complaints, scores each in-memory, and
 * bulk-saves those that exceed the escalation threshold.
 *
 * @returns {Promise<{
 *   evaluated: number,
 *   autoEscalated: number,
 *   results: Array<{
 *     complaintId: string,
 *     priority: string,
 *     status: string,
 *     escalationRiskScore: number,
 *     autoEscalated: boolean
 *   }>
 * }>}
 */
export async function evaluateAllOpenComplaints() {
  try {
    const complaints = await Complaint.find({
      escalated: false,
      status: { $nin: ['Completed', 'Cancelled'] },
    });

    const toSave = [];
    const results = [];

    for (const complaint of complaints) {
      const isAssigned = complaint.assignedTechnician != null;
      const escalationRiskScore = computeEscalationRisk(
        complaint.createdAt,
        complaint.priority,
        isAssigned
      );

      let autoEscalated = false;

      if (escalationRiskScore > ESCALATION_THRESHOLD) {
        complaint.escalated = true;
        complaint.auditLog.push({
          status: complaint.status,
          changedByName: 'System',
          changedByRole: 'system',
          reason: ESCALATION_REASON,
        });
        toSave.push(complaint);
        autoEscalated = true;
      }

      results.push({
        complaintId: String(complaint._id),
        priority: complaint.priority,
        status: complaint.status,
        escalationRiskScore,
        autoEscalated,
      });
    }

    // Bulk-save all auto-escalated complaints
    await Promise.all(toSave.map((c) => c.save()));

    // Emit socket events for each auto-escalated complaint
    const io = await getIo();
    for (const complaint of toSave) {
      io.emit('complaint:updated', {
        _id: complaint._id,
        priority: complaint.priority,
        escalated: true,
      });
    }

    return {
      evaluated: complaints.length,
      autoEscalated: toSave.length,
      results,
    };
  } catch (err) {
    console.error('[EscalationPredictor] evaluateAllOpenComplaints error:', err.message);
    throw err;
  }
}
