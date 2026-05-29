/**
 * WhatsApp notification service via Twilio WhatsApp API.
 *
 * FREE SANDBOX SETUP:
 *  1. Sign up at https://www.twilio.com (free trial — no credit card needed initially)
 *  2. Console → Messaging → Try it out → Send a WhatsApp message
 *  3. Follow sandbox join: send "join <sandbox-word>" to +1 415 523 8886 on WhatsApp
 *  4. Add to server/.env:
 *       TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *       TWILIO_AUTH_TOKEN=your_auth_token
 *       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 *
 * Without these env vars the service runs in mock/log-only mode (no crash).
 */

export async function sendWhatsAppMessage({ to, body }) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.log('[WhatsApp] Mock mode — Twilio env vars not set.');
    console.log(`[WhatsApp] To: ${to}`);
    console.log(`[WhatsApp] Body: ${body.slice(0, 120)}`);
    return { mocked: true, sid: `mock-${Date.now()}` };
  }

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  // Dynamic import so the server doesn't crash if twilio package is absent
  let twilio;
  try {
    const mod = await import('twilio');
    twilio = mod.default ?? mod;
  } catch {
    console.warn('[WhatsApp] twilio package not installed. Run: npm install twilio --prefix server');
    return { mocked: true, sid: `mock-no-pkg-${Date.now()}` };
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const message = await client.messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: toFormatted,
    body
  });
  return { sid: message.sid };
}

export function buildComplaintWhatsAppMessage(complaint, residentName) {
  return [
    `🔧 *FixFlow Maintenance Request*`,
    ``,
    `*Resident:* ${residentName}`,
    `*Apartment:* ${complaint.apartmentNo}`,
    `*Issue:* ${complaint.issueType}`,
    `*Priority:* ${complaint.priority}`,
    `*Date:* ${complaint.preferredDate} at ${complaint.preferredTime}`,
    ``,
    `*Details:*`,
    complaint.description,
    ``,
    `_Please schedule a maintenance visit at your earliest convenience._`
  ].join('\n');
}
