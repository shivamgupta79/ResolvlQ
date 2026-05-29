import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { sendMaintenanceMail } from '../services/gmailService.js';

const router = express.Router();

router.post('/send-maintenance-mail', protect, adminOnly, async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject || !text) {
    return res.status(400).json({ message: 'to, subject and text are required' });
  }
  try {
    const info = await sendMaintenanceMail({ to, subject, text });
    res.json({ message: 'Mail processed', info });
  } catch (err) {
    console.error('[mailRoutes] sendMaintenanceMail error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to send mail' });
  }
});

export default router;
