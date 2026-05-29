import express from 'express';
import { protect, adminOnly, technicianOnly } from '../middleware/auth.js';
import {
  getEngineers,
  assignComplaint,
  setOnlineStatus,
  updateProfile,
  getMyProfile
} from '../controllers/engineerController.js';

const router = express.Router();

// Admin routes
router.get('/', protect, adminOnly, getEngineers);
router.post('/assign', protect, adminOnly, assignComplaint);

// Technician self-service routes
router.get('/me', protect, technicianOnly, getMyProfile);
router.patch('/me/status', protect, technicianOnly, setOnlineStatus);
router.patch('/me/profile', protect, technicianOnly, updateProfile);

export default router;
