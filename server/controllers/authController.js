import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Technician from '../models/Technician.js';
import Complaint from '../models/Complaint.js';
import { computeDailySlotCapacity, validateJoiningTime } from '../utils/engineerUtils.js';

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });

export async function register(req, res) {
  const { name, email, password, role, apartmentNo, phone, joiningTime, skillType } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });

  // Technician-specific validation
  if (role === 'technician') {
    // Check format validity first
    if (!validateJoiningTime(joiningTime)) {
      // Distinguish between format error and time >= 18:00
      // If joiningTime passes basic format check but fails the >= 18:00 constraint, give a specific message
      const hasValidFormat =
        typeof joiningTime === 'string' &&
        /^\d{2}:\d{2}$/.test(joiningTime) &&
        (() => {
          const [hhStr, mmStr] = joiningTime.split(':');
          const HH = parseInt(hhStr, 10);
          const MM = parseInt(mmStr, 10);
          return HH >= 0 && HH <= 23 && MM >= 0 && MM <= 59;
        })();

      if (hasValidFormat) {
        // Format is valid but time is >= 18:00
        return res.status(400).json({ message: 'joiningTime must be before 18:00' });
      }
      return res.status(400).json({ message: 'joiningTime is required and must be in HH:MM format' });
    }

    if (!skillType) return res.status(400).json({ message: 'skillType is required' });
  }

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: 'User already exists' });

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashed, role, apartmentNo, phone });

  // Create linked Technician document for technician role
  if (role === 'technician') {
    const dailySlotCapacity = computeDailySlotCapacity(joiningTime);
    await Technician.create({ user: user._id, skillType, joiningTime, dailySlotCapacity });
  }

  res.status(201).json({ token: makeToken(user._id), user: { id: user._id, name, email, role: user.role, apartmentNo } });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  res.json({
    token: makeToken(user._id),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, apartmentNo: user.apartmentNo, avatarUrl: user.avatarUrl || '' }
  });
}

export async function me(req, res) {
  res.json(req.user);
}

export async function updateProfile(req, res) {
  try {
    const { name, phone, whatsapp, apartmentNo, avatarUrl } = req.body;
    const updates = {};
    if (name)                    updates.name        = name.trim();
    if (phone)                   updates.phone       = phone.trim();
    if (whatsapp !== undefined)  updates.whatsapp    = whatsapp.trim();
    if (apartmentNo)             updates.apartmentNo = apartmentNo.trim();
    if (avatarUrl !== undefined) updates.avatarUrl   = avatarUrl;

    // Mark profile complete if key fields are filled
    const user = await User.findById(req.user._id);
    const merged = { ...user.toObject(), ...updates };
    updates.profileComplete = !!(merged.name && merged.phone && merged.apartmentNo);

    const updated = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({
      id: updated._id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      apartmentNo: updated.apartmentNo,
      phone: updated.phone,
      whatsapp: updated.whatsapp,
      avatarUrl: updated.avatarUrl,
      profileComplete: updated.profileComplete
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update profile' });
  }
}

export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch profile' });
  }
}

export async function deleteAccount(req, res) {
  try {
    const userId = req.user._id;

    // Nullify the user reference on complaints they created (preserve complaint history)
    await Complaint.updateMany({ user: userId }, { $set: { user: null } });

    // Nullify assignedTechnician references on complaints assigned to this user
    await Complaint.updateMany({ assignedTechnician: userId }, { $set: { assignedTechnician: null } });

    // Delete linked Technician document if present (also handled by mongoose post hook as fallback)
    await Technician.deleteOne({ user: userId });

    // Delete the user — triggers the post('findOneAndDelete') hook as well
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to delete account' });
  }
}
