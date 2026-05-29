import mongoose from 'mongoose';

const auditEntrySchema = new mongoose.Schema({
  status: { type: String },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changedByName: { type: String },
  changedByRole: { type: String },
  reason: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const complaintSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    residentName: { type: String, required: true },
    residentEmail: { type: String, required: true },
    apartmentNo: { type: String, required: true },
    issueType: { type: String, required: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
    description: { type: String, required: true },
    preferredDate: { type: String, required: true },
    preferredTime: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Pending', 'Assigned', 'In Progress', 'Scheduled', 'Completed', 'Cancelled'],
      default: 'Pending'
    },
    assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    generatedEmail: { type: String, default: '' },
    emailSent: { type: Boolean, default: false },
    calendarEventId: { type: String, default: '' },
    feedback: { type: String, default: '' },
    feedbackRating: { type: Number, min: 1, max: 5, default: null },
    feedbackSubmitted: { type: Boolean, default: false },
    auditLog: { type: [auditEntrySchema], default: [] },
    escalated: { type: Boolean, default: false },

    // ML fields
    embedding: { type: [Number], default: null, select: false }, // cached OpenAI embedding vector
    duplicateGroupId: { type: String, default: null },
    suggestedTechnicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    predictedResolutionHours: { type: Number, default: null },
    predictedETA: { type: Date, default: null },
    actualResolutionHours: { type: Number, default: null },
    sentimentLabel: { type: String, enum: ['Positive', 'Neutral', 'Negative'], default: null },
    sentimentConfidence: { type: Number, min: 0, max: 1, default: null },
    requiresFollowUp: { type: Boolean, default: false },
    classificationSource: { type: String, enum: ['nlp', 'rule-based'], default: 'rule-based' },
    classificationConfidence: { type: Number, min: 0, max: 1, default: null },
    intakeChannel: { type: String, enum: ['web', 'whatsapp', 'email'], default: 'web' }
  },
  { timestamps: true }
);

export default mongoose.model('Complaint', complaintSchema);
