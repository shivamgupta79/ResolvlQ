import express from 'express';
import { login, me, register, updateProfile, getProfile, deleteAccount } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, me);
router.get('/profile', protect, getProfile);
router.patch('/profile', protect, updateProfile);
router.delete('/account', protect, deleteAccount);
export default router;
