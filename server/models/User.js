import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['resident', 'admin', 'technician'], default: 'resident' },
    apartmentNo: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    profileComplete: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Cascade delete: remove linked Technician profile when a User is deleted
userSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    const Technician = mongoose.model('Technician');
    await Technician.deleteOne({ user: doc._id });
  }
});

export default mongoose.model('User', userSchema);
