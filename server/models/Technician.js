import mongoose from 'mongoose';

const technicianSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    skillType: { type: String, required: true },
    joiningTime: { type: String, required: true },
    endTime: { type: String, default: '18:00' },
    dailySlotCapacity: { type: Number, required: true },
    isOnline: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model('Technician', technicianSchema);
