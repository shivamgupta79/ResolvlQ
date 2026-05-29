/**
 * Inbound Complaint Service
 *
 * Shared logic for creating complaints from external channels (WhatsApp, Email).
 * Parses free-text messages, classifies them with NLP, and creates a Complaint document.
 * Sends a confirmation reply back to the sender.
 */

import Complaint from '../models/Complaint.js';
import { classifyIssue } from './nlpClassifierService.js';
import { generateMaintenanceEmail } from './aiService.js';
import { findSimilarComplaints } from './similarityEngineService.js';
import { predictResolution } from './resolutionPredictorService.js';
import { sendMaintenanceMail } from './gmailService.js';
import { sendWhatsAppMessage } from './whatsappService.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a free-text complaint message into structured fields.
 * Tries to extract apartment number from the message.
 * Falls back to sensible defaults when fields are missing.
 *
 * Expected (but not required) format:
 *   Apartment: A-204
 *   Name: John Smith
 *   <description of the issue>
 *
 * @param {string} rawText
 * @param {string} senderIdentifier - phone number or email address
 * @returns {{ residentName, residentEmail, apartmentNo, description, preferredDate, preferredTime }}
 */
export function parseInboundMessage(rawText, senderIdentifier) {
  const lines = rawText.trim().split('\n').map((l) => l.trim()).filter(Boolean);

  let residentName = '';
  let apartmentNo  = '';
  const descriptionLines = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Extract name: "Name: John Smith" or "My name is John Smith"
    const nameMatch = line.match(/^(?:name|my name is)[:\s]+(.+)$/i);
    if (nameMatch) { residentName = nameMatch[1].trim(); continue; }

    // Extract apartment: "Apartment: A-204" or "Apt: B12" or "Flat: 304"
    const aptMatch = line.match(/^(?:apartment|apt|flat|unit|room|house)[:\s#]+([A-Za-z0-9\-]+)/i);
    if (aptMatch) { apartmentNo = aptMatch[1].trim(); continue; }

    // Skip greeting lines
    if (/^(hi|hello|hey|dear|good\s+(morning|afternoon|evening))/i.test(lower)) continue;

    descriptionLines.push(line);
  }

  // If no name found, derive from sender identifier
  if (!residentName) {
    if (senderIdentifier.includes('@')) {
      residentName = senderIdentifier.split('@')[0].replace(/[._]/g, ' ');
    } else {
      residentName = `Resident (${senderIdentifier})`;
    }
  }

  // If no apartment found, use a placeholder
  if (!apartmentNo) apartmentNo = 'Unknown';

  const description = descriptionLines.join(' ').trim() || rawText.trim();

  // Default preferred date = tomorrow, time = 10:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const preferredDate = tomorrow.toISOString().split('T')[0];
  const preferredTime = '10:00';

  // Email: use sender if it looks like an email, else generate a placeholder
  const residentEmail = senderIdentifier.includes('@')
    ? senderIdentifier
    : `${senderIdentifier.replace(/\D/g, '')}@whatsapp.resolviq.local`;

  return { residentName, residentEmail, apartmentNo, description, preferredDate, preferredTime };
}

/**
 * Create a complaint from an inbound channel message.
 * Runs NLP classification, saves the complaint, fires non-blocking ML tasks.
 *
 * @param {object} params
 * @param {string} params.rawText        - The raw message text
 * @param {string} params.senderIdentifier - Phone number or email address
 * @param {string} params.channel        - 'whatsapp' | 'email'
 * @returns {Promise<Complaint>}
 */
export async function createComplaintFromInbound({ rawText, senderIdentifier, channel }) {
  const parsed = parseInboundMessage(rawText, senderIdentifier);

  // NLP classification
  const ai = await classifyIssue(parsed.description);

  const generatedEmail = generateMaintenanceEmail({
    ...parsed,
    issueType: ai.issueType,
    priority: ai.priority
  });

  const complaint = await Complaint.create({
    residentName:           parsed.residentName,
    residentEmail:          parsed.residentEmail,
    apartmentNo:            parsed.apartmentNo,
    description:            parsed.description,
    preferredDate:          parsed.preferredDate,
    preferredTime:          parsed.preferredTime,
    issueType:              ai.issueType,
    priority:               ai.priority,
    classificationSource:   ai.classificationSource,
    classificationConfidence: ai.confidence ?? null,
    generatedEmail,
    intakeChannel:          channel,   // 'whatsapp' | 'email' | 'web'
    auditLog: [{
      status: 'Pending',
      changedByName: parsed.residentName,
      changedByRole: 'resident',
      reason: `Complaint submitted via ${channel}`
    }]
  });

  // Non-blocking ML tasks
  findSimilarComplaints(complaint._id).catch((e) =>
    console.error('[InboundComplaint] findSimilar error:', e.message)
  );
  predictResolution(complaint._id).catch((e) =>
    console.error('[InboundComplaint] predictResolution error:', e.message)
  );

  // Emit socket event
  try {
    const { io } = await import('../server.js');
    io.emit('complaint:updated', { _id: complaint._id, status: 'Pending', type: 'created' });
  } catch { /* non-critical */ }

  return complaint;
}

// ── Confirmation message builders ─────────────────────────────────────────────

export function buildWhatsAppConfirmation(complaint) {
  return [
    `✅ *Complaint Received — ResolvIQ*`,
    ``,
    `Thank you, *${complaint.residentName}*!`,
    `Your maintenance complaint has been registered.`,
    ``,
    `📋 *Details:*`,
    `• Issue: ${complaint.issueType}`,
    `• Priority: ${complaint.priority}`,
    `• Apartment: ${complaint.apartmentNo}`,
    `• Preferred Visit: ${complaint.preferredDate} at ${complaint.preferredTime}`,
    ``,
    `🔢 *Reference ID:* ${String(complaint._id).slice(-8).toUpperCase()}`,
    ``,
    `Our team will review and assign a technician shortly.`,
    `You will receive updates on this number.`,
    ``,
    `_ResolvIQ — Smart Maintenance Management_`
  ].join('\n');
}

export function buildEmailConfirmation(complaint) {
  return {
    subject: `✅ Complaint Received — ResolvIQ [Ref: ${String(complaint._id).slice(-8).toUpperCase()}]`,
    text: [
      `Dear ${complaint.residentName},`,
      ``,
      `Thank you for contacting ResolvIQ. Your maintenance complaint has been successfully registered.`,
      ``,
      `COMPLAINT DETAILS`,
      `─────────────────`,
      `Reference ID : ${String(complaint._id).slice(-8).toUpperCase()}`,
      `Issue Type   : ${complaint.issueType}`,
      `Priority     : ${complaint.priority}`,
      `Apartment    : ${complaint.apartmentNo}`,
      `Description  : ${complaint.description}`,
      `Preferred    : ${complaint.preferredDate} at ${complaint.preferredTime}`,
      ``,
      `WHAT HAPPENS NEXT`,
      `─────────────────`,
      `1. Our admin team will review your complaint`,
      `2. A qualified technician will be assigned`,
      `3. You will receive a status update via email`,
      ``,
      `If you need to follow up, reply to this email with your Reference ID.`,
      ``,
      `Best regards,`,
      `ResolvIQ Maintenance Team`
    ].join('\n')
  };
}
