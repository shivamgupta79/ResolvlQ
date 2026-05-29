import mongoose from 'mongoose';

const anomalyAlertSchema = new mongoose.Schema({
  issueType:      { type: String, required: true },
  apartmentBlock: { type: String, required: true },
  observedCount:  { type: Number, required: true },
  baselineCount:  { type: Number, required: true },
  severity:       { type: String, enum: ['High', 'Medium'], required: true },
  windowStart:    { type: Date,   required: true },
  windowEnd:      { type: Date,   required: true },
  resolvedAt:     { type: Date,   default: null },
  createdAt:      { type: Date,   default: Date.now }
});

// Compound index for efficient upsert lookups in anomaly detection
anomalyAlertSchema.index({ issueType: 1, apartmentBlock: 1, windowStart: 1 });

export default mongoose.model('AnomalyAlert', anomalyAlertSchema);
