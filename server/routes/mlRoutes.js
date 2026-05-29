import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  scoreTechnicians,
  getEscalationRiskBatch,
  getEscalationRiskSingle,
  findSimilar,
  getDuplicateGroups,
  getResolutionPrediction,
  analyzeSentiment,
  getFollowUpRequired,
  getAnomalies,
  resolveAnomaly,
  runAnomalyDetection,
} from '../controllers/mlController.js';

const router = express.Router();

// Assignment Scorer
router.post('/score-technicians', protect, adminOnly, scoreTechnicians);

// Escalation Predictor
router.get('/escalation-risk', protect, adminOnly, getEscalationRiskBatch);
router.get('/escalation-risk/:complaintId', protect, adminOnly, getEscalationRiskSingle);

// Similarity Engine
router.post('/find-similar', protect, adminOnly, findSimilar);
router.get('/duplicate-groups', protect, adminOnly, getDuplicateGroups);

// Resolution Predictor
router.get('/resolution-prediction/:complaintId', protect, getResolutionPrediction);

// Sentiment Analyzer
router.post('/analyze-sentiment', protect, analyzeSentiment);

// Follow-up queue
router.get('/follow-up-required', protect, adminOnly, getFollowUpRequired);

// Anomaly Detector
router.get('/anomalies', protect, adminOnly, getAnomalies);
// NOTE: /anomalies/run must be registered before /anomalies/:alertId/resolve
// so Express doesn't treat "run" as an alertId param
router.post('/anomalies/run', protect, adminOnly, runAnomalyDetection);
router.post('/anomalies/:alertId/resolve', protect, adminOnly, resolveAnomaly);

export default router;
