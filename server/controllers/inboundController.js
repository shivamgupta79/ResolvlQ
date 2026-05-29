/**
 * Inbound Controller
 *
 * Handles complaint intake from WhatsApp and Email channels.
 */

import Complaint from '../models/Complaint.js';
import {
  createComplaintFromInbound,
  buildWhatsAppConfirmation,
  buildEmailConfirmation
} from '../services/inboundComplaintService.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { sendMaintenanceMail } from '../services/gmailService.js';
import { pollGmailInbox } from '../services/gmailInboundService.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate Twilio webhook signature (optional — only when TWILIO_AUTH_TOKEN is set).
 * Returns true if valid or if validation is skipped (no token configured).
 */
async function validateTwilioSignature(req) {
  const { TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_AUTH_TOKEN) return true; // skip validation in dev/mock mode

  try {
    const twilio = (await import('twilio')).default;
    const validator = new twilio.validateRequest;
    // Twilio sends the full URL it posted to
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const signature = req.headers['x-twilio-signature'] || '';
    return twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body);
  } catch {
    return true; // if twilio package not installed, skip
  }
}

// ── WhatsApp Inbound ─────────────────────────────────────────────────────────

/**
 * POST /api/inbound/whatsapp
 *
 * Twilio sends a POST with form-encoded body when a WhatsApp message arrives.
 * Key fields: From (whatsapp:+91...), Body (message text), NumMedia, MediaUrl0
 *
 * Responds with TwiML XML to send a reply.
 */
export async function handleWhatsAppInbound(req, res) {
  try {
    const from    = req.body?.From || '';   // e.g. "whatsapp:+919876543210"
    const body    = req.body?.Body || '';
    const numMedia = parseInt(req.body?.NumMedia || '0', 10);

    // Extract phone number (strip "whatsapp:" prefix)
    const phone = from.replace('whatsapp:', '').trim();

    if (!phone) {
      return res.status(400).send('<Response><Message>Invalid request.</Message></Response>');
    }

    // Ignore empty messages
    if (!body.trim() && numMedia === 0) {
      const twiml = `<Response><Message>Hi! To submit a maintenance complaint, send a message describing your issue. Include your apartment number if possible.\n\nExample:\nApartment: A-204\nMy bathroom tap is leaking badly.</Message></Response>`;
      return res.type('text/xml').send(twiml);
    }

    // Handle "HELP" or "STATUS" commands
    const command = body.trim().toUpperCase();
    if (command === 'HELP') {
      const helpMsg = [
        `🔧 *ResolvIQ Help*`,
        ``,
        `To submit a complaint, send a message like:`,
        ``,
        `Apartment: A-204`,
        `Name: John Smith`,
        `My bathroom tap is leaking.`,
        ``,
        `Commands:`,
        `• HELP — show this message`,
        `• STATUS — check your latest complaint status`
      ].join('\n');
      return res.type('text/xml').send(`<Response><Message>${escapeXml(helpMsg)}</Message></Response>`);
    }

    if (command === 'STATUS') {
      // Find the most recent complaint from this phone number
      const phoneDigits = phone.replace(/\D/g, '');
      const recent = await Complaint.findOne({
        residentEmail: { $regex: phoneDigits }
      }).sort({ createdAt: -1 });

      if (!recent) {
        return res.type('text/xml').send(`<Response><Message>No complaints found for your number. Send a message describing your issue to submit one.</Message></Response>`);
      }

      const statusMsg = [
        `📋 *Your Latest Complaint*`,
        ``,
        `Ref: ${String(recent._id).slice(-8).toUpperCase()}`,
        `Issue: ${recent.issueType}`,
        `Status: ${recent.status}`,
        `Priority: ${recent.priority}`,
        `Submitted: ${recent.createdAt.toLocaleDateString()}`
      ].join('\n');
      return res.type('text/xml').send(`<Response><Message>${escapeXml(statusMsg)}</Message></Response>`);
    }

    // Create complaint from the message
    console.log(`[WhatsApp Inbound] New complaint from ${phone}`);
    const complaint = await createComplaintFromInbound({
      rawText: body,
      senderIdentifier: phone,
      channel: 'whatsapp'
    });

    // Send confirmation reply via TwiML
    const confirmMsg = buildWhatsAppConfirmation(complaint);
    const twiml = `<Response><Message>${escapeXml(confirmMsg)}</Message></Response>`;
    res.type('text/xml').send(twiml);

    // Also notify admin via socket
    console.log(`[WhatsApp Inbound] Complaint created: ${complaint._id} from ${phone}`);

  } catch (err) {
    console.error('[WhatsApp Inbound] Error:', err.message);
    const errorMsg = `Sorry, we couldn't process your complaint right now. Please try again or contact us directly.`;
    res.type('text/xml').send(`<Response><Message>${escapeXml(errorMsg)}</Message></Response>`);
  }
}

// ── Email Inbound (Webhook) ───────────────────────────────────────────────────

/**
 * POST /api/inbound/email
 *
 * Accepts parsed email data from Mailgun, SendGrid, or any webhook service.
 * Expected body (JSON or form-encoded):
 *   - from / sender / From  — sender email address
 *   - subject / Subject     — email subject
 *   - text / body-plain / plain / stripped-text — plain text body
 *
 * Protected by INBOUND_WEBHOOK_SECRET env var (optional).
 */
export async function handleEmailWebhook(req, res) {
  try {
    // Optional secret validation
    const secret = process.env.INBOUND_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers['x-webhook-secret'] || req.body?.secret;
      if (provided !== secret) {
        return res.status(401).json({ message: 'Invalid webhook secret' });
      }
    }

    // Extract fields — support multiple provider formats
    const from    = req.body?.from || req.body?.sender || req.body?.From || '';
    const subject = req.body?.subject || req.body?.Subject || '';
    const text    = req.body?.text
                 || req.body?.['body-plain']
                 || req.body?.plain
                 || req.body?.['stripped-text']
                 || req.body?.body
                 || '';

    // Extract sender email
    const emailMatch = from.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const senderEmail = emailMatch ? emailMatch[0] : from.trim();

    if (!senderEmail) {
      return res.status(400).json({ message: 'Could not extract sender email' });
    }

    // Combine subject + body as the complaint text
    const rawText = subject
      ? `${subject}\n${text}`
      : text;

    if (!rawText.trim()) {
      return res.status(400).json({ message: 'Empty email body' });
    }

    console.log(`[Email Inbound] New complaint from ${senderEmail}`);
    const complaint = await createComplaintFromInbound({
      rawText,
      senderIdentifier: senderEmail,
      channel: 'email'
    });

    // Send confirmation email back to sender
    const { subject: confSubject, text: confText } = buildEmailConfirmation(complaint);
    sendMaintenanceMail({ to: senderEmail, subject: confSubject, text: confText })
      .catch((e) => console.error('[Email Inbound] Confirmation send error:', e.message));

    console.log(`[Email Inbound] Complaint created: ${complaint._id} from ${senderEmail}`);
    res.json({
      message: 'Complaint created successfully',
      complaintId: complaint._id,
      refId: String(complaint._id).slice(-8).toUpperCase()
    });

  } catch (err) {
    console.error('[Email Inbound] Error:', err.message);
    res.status(500).json({ message: 'Failed to process inbound email' });
  }
}

// ── Gmail IMAP Poll (manual trigger) ─────────────────────────────────────────

/**
 * POST /api/inbound/email-poll
 * Admin-only. Manually triggers a Gmail inbox poll to pick up new complaint emails.
 */
export async function triggerEmailPoll(req, res) {
  try {
    const result = await pollGmailInbox();
    res.json(result);
  } catch (err) {
    console.error('[Email Poll] Error:', err.message);
    res.status(500).json({ message: err.message || 'Email poll failed' });
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/inbound/stats
 * Returns complaint counts grouped by intake channel.
 */
export async function getInboundStats(req, res) {
  try {
    const stats = await Complaint.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$intakeChannel', 'web'] },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const result = { web: 0, whatsapp: 0, email: 0 };
    stats.forEach(({ _id, count }) => { result[_id] = count; });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
