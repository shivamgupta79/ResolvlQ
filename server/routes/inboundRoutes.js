/**
 * Inbound Complaint Routes
 *
 * Handles incoming complaints from external channels:
 *   POST /api/inbound/whatsapp  — Twilio WhatsApp webhook
 *   POST /api/inbound/email     — Email webhook (Mailgun / SendGrid / custom)
 *   POST /api/inbound/email-poll — Manually trigger Gmail IMAP poll (admin only)
 *
 * These routes are intentionally PUBLIC (no JWT auth) because they are called
 * by external services (Twilio, Mailgun). They are protected by:
 *   - Twilio: X-Twilio-Signature header validation (when TWILIO_AUTH_TOKEN is set)
 *   - Email webhook: INBOUND_WEBHOOK_SECRET header check
 */

import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  handleWhatsAppInbound,
  handleEmailWebhook,
  triggerEmailPoll,
  getInboundStats
} from '../controllers/inboundController.js';

const router = express.Router();

// ── WhatsApp inbound (Twilio webhook — no JWT, validated by Twilio signature) ──
router.post('/whatsapp', handleWhatsAppInbound);

// ── Email inbound (webhook from Mailgun/SendGrid — no JWT, validated by secret) ──
router.post('/email', handleEmailWebhook);

// ── Manual Gmail IMAP poll (admin only, requires auth) ──────────────────────
router.post('/email-poll', protect, adminOnly, triggerEmailPoll);

// ── Stats endpoint (admin only) ─────────────────────────────────────────────
router.get('/stats', protect, adminOnly, getInboundStats);

export default router;
