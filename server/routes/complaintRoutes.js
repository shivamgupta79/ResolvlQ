import express from 'express';
import {
  createComplaint,
  getComplaintById,
  getComplaints,
  scheduleComplaint,
  sendComplaintEmail,
  updateComplaintStatus,
  submitFeedback,
  notifyComplaint,
  bulkUpdateStatus
} from '../controllers/complaintController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.post('/', createComplaint);
router.get('/', getComplaints);
router.post('/bulk-status', adminOnly, bulkUpdateStatus);
router.get('/:id', getComplaintById);
router.patch('/:id/status', updateComplaintStatus);
router.post('/:id/feedback', submitFeedback);
router.post('/:id/notify', notifyComplaint);
router.post('/:id/send-email', sendComplaintEmail);
router.post('/:id/schedule', scheduleComplaint);

export default router;
