import Technician from '../models/Technician.js';
import Complaint from '../models/Complaint.js';
import { sortEngineersBySlots } from '../utils/engineerUtils.js';
import { computeDailySlotCapacity, validateJoiningTime } from '../utils/engineerUtils.js';

/**
 * GET /api/engineers
 * Admin only — returns all engineers enriched with remainingSlotsToday and available flag,
 * sorted by remainingSlotsToday descending.
 */
export const getEngineers = async (req, res) => {
  try {
    const engineers = await Technician.find().populate('user', 'name email');
    const today = new Date().toISOString().split('T')[0];

    const enriched = await Promise.all(
      engineers
        .filter((engineer) => engineer.user != null) // skip orphaned profiles
        .map(async (engineer) => {
          const assignedToday = await Complaint.countDocuments({
            assignedTechnician: engineer.user._id,
            preferredDate: today,
            status: { $ne: 'Cancelled' }
          });

          const remainingSlotsToday = Math.max(0, engineer.dailySlotCapacity - assignedToday);
          const available = remainingSlotsToday > 0;

          return {
            _id: engineer._id,
            user: engineer.user,
            skillType: engineer.skillType,
            joiningTime: engineer.joiningTime,
            endTime: engineer.endTime ?? '18:00',
            dailySlotCapacity: engineer.dailySlotCapacity,
            remainingSlotsToday,
            available,
            isOnline: engineer.isOnline ?? false
          };
        })
    );

    const sorted = sortEngineersBySlots(enriched);
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/engineers/assign
 * Admin only — assigns a complaint to an engineer.
 * Body: { complaintId, engineerId }
 * Handles reassignment by overwriting the existing assignedTechnician.
 * After assignment, sends a WhatsApp notification to the technician.
 */
export const assignComplaint = async (req, res) => {
  try {
    const { complaintId, engineerId } = req.body;

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const technician = await Technician.findById(engineerId).populate('user', 'name email phone whatsapp');
    if (!technician) {
      return res.status(404).json({ message: 'Engineer not found' });
    }

    // Compute remaining slots for the complaint's preferredDate (not today)
    const assignedOnDate = await Complaint.countDocuments({
      assignedTechnician: technician.user._id,
      preferredDate: complaint.preferredDate,
      status: { $ne: 'Cancelled' }
    });

    const remainingSlotsToday = Math.max(0, technician.dailySlotCapacity - assignedOnDate);

    if (remainingSlotsToday === 0) {
      return res.status(409).json({ message: 'Engineer has no remaining slots for the selected date' });
    }

    // Assign (or reassign) — slot counts are always computed live from complaint records
    const oldAssignee = complaint.assignedTechnician;
    complaint.assignedTechnician = technician.user._id;
    complaint.status = 'Assigned';

    // Audit log entry
    const reason = req.body.reason || (oldAssignee ? `Reassigned to ${technician.user.name}` : `Assigned to ${technician.user.name}`);
    complaint.auditLog = complaint.auditLog || [];
    complaint.auditLog.push({
      status: 'Assigned',
      changedBy: req.user?._id,
      changedByName: req.user?.name || 'Admin',
      changedByRole: 'admin',
      reason
    });
    await complaint.save();

    const updated = await Complaint.findById(complaint._id).populate(
      'assignedTechnician',
      'name email'
    );

    // ── WhatsApp notification to technician ──────────────────────────────
    const waNumber = technician.user.whatsapp || technician.user.phone;
    if (waNumber && !waNumber.includes('@')) {
      try {
        const { sendWhatsAppMessage } = await import('../services/whatsappService.js');
        const body = buildAssignmentMessage(complaint, technician.user.name);
        await sendWhatsAppMessage({ to: waNumber, body });
        console.log(`[WhatsApp] Assignment notification sent to ${technician.user.name}`);
      } catch (waErr) {
        console.warn('[WhatsApp] Notification failed (non-fatal):', waErr.message);
      }
    }

    // ── Socket.io broadcast ───────────────────────────────────────────────
    try {
      const { io } = await import('../server.js');
      io.emit('complaint:updated', { _id: complaint._id, status: 'Assigned', assignedTechnician: technician.user });
    } catch { /* non-fatal */ }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function buildAssignmentMessage(complaint, techName) {
  return [
    `🔧 *New Work Assignment — FixFlow*`,
    ``,
    `Hi ${techName}! You have been assigned a new maintenance job.`,
    ``,
    `*Issue:* ${complaint.issueType}`,
    `*Priority:* ${complaint.priority}`,
    `*Apartment:* ${complaint.apartmentNo}`,
    `*Resident:* ${complaint.residentName}`,
    `*Date:* ${complaint.preferredDate}`,
    `*Time:* ${complaint.preferredTime}`,
    ``,
    `*Details:*`,
    complaint.description,
    ``,
    `Please log in to FixFlow to view full details and update the status once complete.`,
    `_FixFlow AI Maintenance System_`
  ].join('\n');
}

/**
 * PATCH /api/engineers/me/status
 * Technician only — toggle online/offline status.
 * Body: { isOnline: boolean }
 */
export const setOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;
    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({ message: 'isOnline must be a boolean' });
    }

    const technician = await Technician.findOneAndUpdate(
      { user: req.user._id },
      { isOnline },
      { new: true }
    ).populate('user', 'name email');

    if (!technician) {
      return res.status(404).json({ message: 'Engineer profile not found' });
    }

    res.json({ isOnline: technician.isOnline });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /api/engineers/me/profile
 * Technician only — update joiningTime, endTime, and/or dailySlotCapacity.
 * Body: { joiningTime?: "HH:MM", endTime?: "HH:MM", dailySlotCapacity?: number }
 * If dailySlotCapacity is provided manually, it overrides the auto-computed value.
 * If only joiningTime/endTime change, dailySlotCapacity is recomputed automatically.
 */
export const updateProfile = async (req, res) => {
  try {
    const { joiningTime, endTime, dailySlotCapacity } = req.body;

    // Fetch current profile to fill in missing fields
    const current = await Technician.findOne({ user: req.user._id });
    if (!current) return res.status(404).json({ message: 'Engineer profile not found' });

    const newStart = joiningTime ?? current.joiningTime;
    const newEnd   = endTime ?? current.endTime ?? '18:00';

    // Validate start time format
    if (!validateJoiningTime(newStart)) {
      return res.status(400).json({ message: 'joiningTime must be in HH:MM format (before 18:00)' });
    }

    // Validate end time format
    if (!/^\d{2}:\d{2}$/.test(newEnd)) {
      return res.status(400).json({ message: 'endTime must be in HH:MM format' });
    }

    const [endH, endM] = newEnd.split(':').map(Number);
    if (endH < 0 || endH > 23 || endM < 0 || endM > 59) {
      return res.status(400).json({ message: 'endTime is not a valid time' });
    }

    const startMin = toMin(newStart);
    const endMin   = endH * 60 + endM;

    if (endMin <= startMin) {
      return res.status(400).json({ message: 'endTime must be after joiningTime' });
    }

    // Compute slot capacity: manual override OR auto from shift length
    let newCapacity;
    if (typeof dailySlotCapacity === 'number') {
      if (!Number.isInteger(dailySlotCapacity) || dailySlotCapacity < 1) {
        return res.status(400).json({ message: 'dailySlotCapacity must be a positive integer' });
      }
      newCapacity = dailySlotCapacity;
    } else {
      // Auto: 1 slot per hour between start and end
      newCapacity = Math.floor((endMin - startMin) / 60);
      if (newCapacity < 1) newCapacity = 1;
    }

    const technician = await Technician.findOneAndUpdate(
      { user: req.user._id },
      { joiningTime: newStart, endTime: newEnd, dailySlotCapacity: newCapacity },
      { new: true }
    ).populate('user', 'name email');

    res.json({
      joiningTime: technician.joiningTime,
      endTime: technician.endTime,
      dailySlotCapacity: technician.dailySlotCapacity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * GET /api/engineers/me
 * Technician only — get own profile.
 */
export const getMyProfile = async (req, res) => {
  try {
    const technician = await Technician.findOne({ user: req.user._id }).populate('user', 'name email');
    if (!technician) {
      return res.status(404).json({ message: 'Engineer profile not found' });
    }
    res.json(technician);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
