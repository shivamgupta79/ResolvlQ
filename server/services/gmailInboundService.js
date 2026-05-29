/**
 * Gmail Inbound Service — IMAP Polling
 *
 * Polls a Gmail inbox for new complaint emails and creates Complaint documents.
 * Uses the `imapflow` package (lightweight, modern IMAP client).
 *
 * Configuration (server/.env):
 *   GMAIL_INBOUND_USER     — Gmail address to poll (e.g. maintenance@yourdomain.com)
 *   GMAIL_INBOUND_PASSWORD — Gmail App Password (NOT your regular password)
 *                            Generate at: myaccount.google.com → Security → App Passwords
 *   GMAIL_INBOUND_LABEL    — IMAP label/folder to poll (default: INBOX)
 *   GMAIL_POLL_CRON        — Cron schedule (default: every 5 minutes)
 *
 * HOW TO SET UP GMAIL APP PASSWORD:
 *   1. Enable 2-Factor Authentication on your Google account
 *   2. Go to myaccount.google.com → Security → 2-Step Verification → App Passwords
 *   3. Create an app password for "Mail" on "Other device"
 *   4. Copy the 16-character password into GMAIL_INBOUND_PASSWORD
 *
 * The service marks processed emails as read to avoid duplicate processing.
 */

import {
  createComplaintFromInbound,
  buildEmailConfirmation
} from './inboundComplaintService.js';
import { sendMaintenanceMail } from './gmailService.js';

const GMAIL_USER     = process.env.GMAIL_INBOUND_USER;
const GMAIL_PASSWORD = process.env.GMAIL_INBOUND_PASSWORD;
const GMAIL_LABEL    = process.env.GMAIL_INBOUND_LABEL || 'INBOX';

/**
 * Poll the Gmail inbox for unread emails and create complaints from them.
 * @returns {{ processed: number, errors: number, complaints: string[] }}
 */
export async function pollGmailInbox() {
  if (!GMAIL_USER || !GMAIL_PASSWORD) {
    console.log('[GmailInbound] GMAIL_INBOUND_USER or GMAIL_INBOUND_PASSWORD not set — skipping poll.');
    return { processed: 0, errors: 0, complaints: [], skipped: true, reason: 'Gmail credentials not configured' };
  }

  let ImapFlow;
  try {
    const mod = await import('imapflow');
    ImapFlow = mod.ImapFlow;
  } catch {
    console.warn('[GmailInbound] imapflow package not installed. Run: npm install imapflow --prefix server');
    return { processed: 0, errors: 0, complaints: [], skipped: true, reason: 'imapflow package not installed' };
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
    logger: false
  });

  const results = { processed: 0, errors: 0, complaints: [] };

  try {
    await client.connect();
    const lock = await client.getMailboxLock(GMAIL_LABEL);

    try {
      // Fetch all unread messages
      for await (const message of client.fetch({ seen: false }, { envelope: true, source: true })) {
        try {
          const from    = message.envelope?.from?.[0]?.address || '';
          const subject = message.envelope?.subject || '';

          // Decode message source to plain text
          const rawBuffer = message.source;
          const rawText   = rawBuffer ? rawBuffer.toString('utf8') : '';

          // Extract plain text body from raw email (simple extraction)
          const plainText = extractPlainText(rawText, subject);

          if (!from || !plainText.trim()) {
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            continue;
          }

          // Skip auto-replies and system emails
          if (isAutoReply(subject, from)) {
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            continue;
          }

          console.log(`[GmailInbound] Processing email from ${from}: "${subject}"`);

          const complaint = await createComplaintFromInbound({
            rawText: plainText,
            senderIdentifier: from,
            channel: 'email'
          });

          // Send confirmation email
          const { subject: confSubject, text: confText } = buildEmailConfirmation(complaint);
          sendMaintenanceMail({ to: from, subject: confSubject, text: confText })
            .catch((e) => console.error('[GmailInbound] Confirmation error:', e.message));

          // Mark as read
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });

          results.processed++;
          results.complaints.push(String(complaint._id));
          console.log(`[GmailInbound] Created complaint ${complaint._id} from ${from}`);

        } catch (msgErr) {
          console.error('[GmailInbound] Error processing message:', msgErr.message);
          results.errors++;
          // Mark as read anyway to avoid infinite retry
          try {
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
          } catch { /* ignore */ }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[GmailInbound] IMAP connection error:', err.message);
    throw err;
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract plain text from a raw email string.
 * Handles multipart emails by finding the text/plain part.
 */
function extractPlainText(rawEmail, subject) {
  // Try to find text/plain content in multipart email
  const plainMatch = rawEmail.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\r?\nContent-Type:|$)/i
  );

  if (plainMatch) {
    // Decode quoted-printable if needed
    let text = plainMatch[1].trim();
    text = text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    return text.trim();
  }

  // Fallback: strip HTML tags and return remaining text
  const noHtml = rawEmail
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If we got something useful, return it
  if (noHtml.length > 20) return noHtml.slice(0, 2000);

  // Last resort: use subject as description
  return subject || '';
}

/**
 * Detect auto-reply / system emails to avoid creating complaints from them.
 */
function isAutoReply(subject, from) {
  const subjectLower = (subject || '').toLowerCase();
  const fromLower    = (from || '').toLowerCase();

  const autoReplyPatterns = [
    'auto-reply', 'automatic reply', 'out of office', 'vacation',
    'delivery failed', 'mailer-daemon', 'postmaster', 'noreply',
    'no-reply', 'donotreply', 'do-not-reply', 'undeliverable',
    'mail delivery', 'bounce', 'resolviq'  // don't process our own confirmation emails
  ];

  return autoReplyPatterns.some(
    (p) => subjectLower.includes(p) || fromLower.includes(p)
  );
}
