import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { createMaintenanceEvent } from '../services/calendarService.js';

const router = express.Router();

router.post('/schedule-maintenance', protect, adminOnly, async (req, res) => {
  try {
    const event = await createMaintenanceEvent(req.body);
    res.json({ message: 'Calendar event processed', event });
  } catch (err) {
    console.error('[calendarRoutes] createMaintenanceEvent error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to create calendar event' });
  }
});

export default router;
