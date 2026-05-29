import Complaint from '../models/Complaint.js';
import { generateMaintenanceEmail } from '../services/aiService.js';
import { classifyIssue } from '../services/nlpClassifierService.js';
import { findSimilarComplaints } from '../services/similarityEngineService.js';
import { predictResolution, recordActualResolution } from '../services/resolutionPredictorService.js';
import { analyzeSentiment } from '../services/sentimentAnalyzerService.js';
import { sendMaintenanceMail } from '../services/gmailService.js';
import { createMaintenanceEvent } from '../services/calendarService.js';

// Helper: append audit entry
function addAudit(complaint, status, user, reason = '') {
  complaint.auditLog.push({
    status,
    changedBy: user?._id,
    changedByName: user?.name || 'System',
    changedByRole: user?.role || 'system',
    reason
  });
}

// Helper: emit socket event (non-fatal)
async function emitUpdate(complaintId, payload) {
  try {
    const { io } = await import('../server.js');
    io.emit('complaint:updated', { _id: complaintId, ...payload });
  } catch { /* socket not critical */ }
}

// Helper: send status-change email to resident (non-fatal)
async function notifyResidentStatusChange(complaint, newStatus) {
  try {
    if (!complaint.residentEmail) return;
    const subject = `Your complaint status updated: ${newStatus} — FixFlow`;
    const text = [
      `Dear ${complaint.residentName},`,
      ``,
      `Your maintenance complaint has been updated.`,
      ``,
      `Issue: ${complaint.issueType}`,
      `Apartment: ${complaint.apartmentNo}`,
      `New Status: ${newStatus}`,
      ``,
      `Log in to FixFlow to view full details.`,
      ``,
      `— FixFlow AI Maintenance System`
    ].join('\n');
    await sendMaintenanceMail({ to: complaint.residentEmail, subject, text });
  } catch { /* email not critical */ }
}

export async function createComplaint(req, res) {
  try {
    const payload = req.body;
    const required = ['residentName', 'residentEmail', 'apartmentNo', 'description', 'preferredDate', 'preferredTime'];
    for (const field of required) {
      if (!payload[field]) return res.status(400).json({ message: `${field} is required` });
    }

    // Use NLP classifier (returns confidence + classificationSource)
    const ai = await classifyIssue(payload.description);
    const data = {
      ...payload,
      issueType: payload.issueType || ai.issueType,
      priority: payload.priority || ai.priority
    };
    const generatedEmail = generateMaintenanceEmail(data);

    const complaint = await Complaint.create({
      user: req.user?._id,
      ...data,
      generatedEmail,
      classificationSource: ai.classificationSource,
      classificationConfidence: ai.confidence ?? null,
      auditLog: [{
        status: 'Pending',
        changedByName: req.user?.name || payload.residentName,
        changedByRole: req.user?.role || 'resident',
        reason: 'Complaint created'
      }]
    });

    // Non-blocking: find similar complaints (fire and forget)
    findSimilarComplaints(complaint._id).catch(err =>
      console.error('[ComplaintController] findSimilar error:', err.message)
    );

    // Non-blocking: predict resolution time (fire and forget)
    predictResolution(complaint._id).catch(err =>
      console.error('[ComplaintController] predictResolution error:', err.message)
    );

    emitUpdate(complaint._id, { status: 'Pending', type: 'created' });
    res.status(201).json(complaint);
  } catch (err) {
    console.error('createComplaint error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to create complaint' });
  }
}

export async function getComplaints(req, res) {
  try {
    const filter =
      req.user?.role === 'admin'
        ? {}
        : req.user?.role === 'technician'
        ? { assignedTechnician: req.user?._id }
        : { $or: [{ user: req.user?._id }, { residentEmail: req.user?.email }] };

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate('assignedTechnician', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Complaint.countDocuments(filter)
    ]);

    res.json({ complaints, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getComplaints error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to fetch complaints' });
  }
}

export async function getComplaintById(req, res) {
  try {
    const complaint = await Complaint.findById(req.params.id).populate('assignedTechnician', 'name email');
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    console.error('getComplaintById error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to fetch complaint' });
  }
}

export async function updateComplaintStatus(req, res) {
  try {
    const { status, assignedTechnician, reason } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    const role = req.user?.role;

    // Residents: only mark own complaints as Completed (when Assigned/Scheduled)
    if (role === 'resident' || !role) {
      const isOwner = String(complaint.user) === String(req.user?._id) || complaint.residentEmail === req.user?.email;
      if (!isOwner) return res.status(403).json({ message: 'Not authorised' });
      if (status !== 'Completed') return res.status(403).json({ message: 'Residents can only mark complaints as Completed' });
      if (!['Assigned', 'Scheduled', 'In Progress'].includes(complaint.status)) {
        return res.status(400).json({ message: 'Complaint must be Assigned, Scheduled, or In Progress before marking as Completed' });
      }
    }

    // Technicians: can only update their own assigned complaints to In Progress or Completed
    if (role === 'technician') {
      if (String(complaint.assignedTechnician) !== String(req.user?._id)) {
        return res.status(403).json({ message: 'Not authorised — not your complaint' });
      }
      if (!['In Progress', 'Completed'].includes(status)) {
        return res.status(403).json({ message: 'Technicians can only set status to In Progress or Completed' });
      }
    }

    const oldStatus = complaint.status;
    complaint.status = status;
    if (assignedTechnician !== undefined) complaint.assignedTechnician = assignedTechnician;
    addAudit(complaint, status, req.user, reason || '');
    await complaint.save();

    // Notify resident on status change (non-fatal)
    if (oldStatus !== status) {
      notifyResidentStatusChange(complaint, status);
      emitUpdate(complaint._id, { status, updatedBy: req.user?.name });

      // Non-blocking: record actual resolution hours when complaint is completed
      if (status === 'Completed') {
        recordActualResolution(complaint._id).catch(err =>
          console.error('[ComplaintController] recordActualResolution error:', err.message)
        );
      }
    }

    res.json(complaint);
  } catch (err) {
    console.error('updateComplaintStatus error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to update status' });
  }
}

// Feature 8: Bulk status update (admin only)
export async function bulkUpdateStatus(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    const { ids, status, reason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids array required' });
    if (!status) return res.status(400).json({ message: 'status required' });

    const results = await Promise.all(ids.map(async (id) => {
      try {
        const c = await Complaint.findById(id);
        if (!c) return { id, ok: false, error: 'Not found' };
        c.status = status;
        addAudit(c, status, req.user, reason || 'Bulk update');
        await c.save();
        emitUpdate(id, { status });
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, error: e.message };
      }
    }));

    res.json({ updated: results.filter((r) => r.ok).length, results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function submitFeedback(req, res) {
  try {
    const { feedback, rating } = req.body;
    if (!feedback || !feedback.trim()) return res.status(400).json({ message: 'Feedback text is required' });
    if (rating !== undefined && (rating < 1 || rating > 5)) return res.status(400).json({ message: 'Rating must be 1–5' });

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    const isOwner = String(complaint.user) === String(req.user?._id) || complaint.residentEmail === req.user?.email;
    if (!isOwner) return res.status(403).json({ message: 'Not authorised' });
    if (complaint.status !== 'Completed') return res.status(400).json({ message: 'Feedback can only be submitted for completed complaints' });
    if (complaint.feedbackSubmitted) return res.status(400).json({ message: 'Feedback already submitted' });

    complaint.feedback = feedback.trim();
    complaint.feedbackRating = rating ?? null;
    complaint.feedbackSubmitted = true;
    await complaint.save();

    // Non-blocking: analyze sentiment of the submitted feedback
    analyzeSentiment(complaint._id, feedback.trim()).catch(err =>
      console.error('[ComplaintController] analyzeSentiment error:', err.message)
    );

    emitUpdate(complaint._id, { feedbackSubmitted: true, feedbackRating: complaint.feedbackRating });
    res.json({ message: 'Feedback submitted successfully', complaint });
  } catch (err) {
    console.error('submitFeedback error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to submit feedback' });
  }
}

export async function sendComplaintEmail(req, res) {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    await sendMaintenanceMail({
      to: process.env.MAINTENANCE_EMAIL || complaint.residentEmail,
      subject: `Maintenance Request: ${complaint.issueType} - Apt ${complaint.apartmentNo}`,
      text: complaint.generatedEmail
    });

    complaint.emailSent = true;
    await complaint.save();
    res.json({ message: 'Email processed successfully', complaint });
  } catch (err) {
    console.error('sendComplaintEmail error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to send email' });
  }
}

export async function scheduleComplaint(req, res) {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    const event = await createMaintenanceEvent({
      summary: `FixFlow Maintenance: ${complaint.issueType} - ${complaint.apartmentNo}`,
      description: complaint.generatedEmail,
      date: complaint.preferredDate,
      time: complaint.preferredTime,
      attendeeEmail: complaint.residentEmail
    });

    complaint.calendarEventId = event.id;
    complaint.status = 'Scheduled';
    addAudit(complaint, 'Scheduled', req.user, 'Calendar event created');
    await complaint.save();
    res.json({ message: 'Maintenance scheduled', event, complaint });
  } catch (err) {
    console.error('scheduleComplaint error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to schedule maintenance' });
  }
}

export async function notifyComplaint(req, res) {
  try {
    const { channel } = req.body;
    if (!['email', 'whatsapp', 'both'].includes(channel)) {
      return res.status(400).json({ message: 'channel must be "email", "whatsapp", or "both"' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    const isOwner = String(complaint.user) === String(req.user?._id) || complaint.residentEmail === req.user?.email;
    if (!isOwner && req.user?.role !== 'admin') return res.status(403).json({ message: 'Not authorised' });

    const results = {};

    if (channel === 'email' || channel === 'both') {
      try {
        await sendMaintenanceMail({
          to: process.env.MAINTENANCE_EMAIL || complaint.residentEmail,
          subject: `Maintenance Request: ${complaint.issueType} — Apt ${complaint.apartmentNo}`,
          text: complaint.generatedEmail
        });
        results.email = { sent: true };
      } catch (err) {
        results.email = { sent: false, error: err.message };
      }
    }

    if (channel === 'whatsapp' || channel === 'both') {
      try {
        const { sendWhatsAppMessage, buildComplaintWhatsAppMessage } = await import('../services/whatsappService.js');
        const User = (await import('../models/User.js')).default;
        const residentUser = await User.findById(complaint.user);
        const whatsappTo = residentUser?.whatsapp || residentUser?.phone;

        if (!whatsappTo || whatsappTo.includes('@')) {
          results.whatsapp = { sent: false, error: 'No WhatsApp number on profile.' };
        } else {
          const body = buildComplaintWhatsAppMessage(complaint, complaint.residentName);
          const result = await sendWhatsAppMessage({ to: whatsappTo, body });
          results.whatsapp = { sent: true, mocked: result.mocked ?? false, sid: result.sid };
        }
      } catch (err) {
        results.whatsapp = { sent: false, error: err.message };
      }
    }

    res.json({ message: 'Notification processed', results });
  } catch (err) {
    console.error('notifyComplaint error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to send notification' });
  }
}
