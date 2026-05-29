import { scoreAndRankTechnicians } from '../services/assignmentScorerService.js';
import { evaluateAllOpenComplaints, evaluateSingleComplaint } from '../services/escalationPredictorService.js';
import { findSimilarComplaints, getDuplicateGroups as getSimilarityDuplicateGroups } from '../services/similarityEngineService.js';
import { predictResolution } from '../services/resolutionPredictorService.js';
import { analyzeSentiment as analyzeSentimentService } from '../services/sentimentAnalyzerService.js';
import { runAnomalyDetection as runAnomalyDetectionService } from '../services/anomalyDetectorService.js';
import Complaint from '../models/Complaint.js';
import AnomalyAlert from '../models/AnomalyAlert.js';

export async function scoreTechnicians(req, res) {
  const { complaintId } = req.body;
  if (!complaintId) return res.status(400).json({ message: 'complaintId is required' });
  try {
    const result = await scoreAndRankTechnicians(complaintId);
    res.json(result);
  } catch (err) {
    console.error('[mlController] scoreTechnicians error:', err.message);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
}

export async function getEscalationRiskBatch(req, res) {
  try {
    const result = await evaluateAllOpenComplaints();
    res.json(result);
  } catch (err) {
    console.error('[mlController] getEscalationRiskBatch error:', err.message);
    res.status(500).json({ message: err.message });
  }
}

export async function getEscalationRiskSingle(req, res) {
  try {
    const result = await evaluateSingleComplaint(req.params.complaintId);
    res.json(result);
  } catch (err) {
    console.error('[mlController] getEscalationRiskSingle error:', err.message);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
}

export async function findSimilar(req, res) {
  const { complaintId } = req.body;
  if (!complaintId) return res.status(400).json({ message: 'complaintId is required' });
  try {
    const result = await findSimilarComplaints(complaintId);
    res.json(result);
  } catch (err) {
    console.error('[mlController] findSimilar error:', err.message);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
}

export async function getDuplicateGroups(req, res) {
  try {
    const groups = await getSimilarityDuplicateGroups();
    res.json({ groups });
  } catch (err) {
    console.error('[mlController] getDuplicateGroups error:', err.message);
    res.status(500).json({ message: err.message });
  }
}

export async function getResolutionPrediction(req, res) {
  try {
    const { complaintId } = req.params;

    // Residents may only access their own complaints
    if (req.user.role === 'resident') {
      const complaint = await Complaint.findById(complaintId).select('user');
      if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
      if (complaint.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorised' });
      }
    }

    const result = await predictResolution(complaintId);
    res.json(result);
  } catch (err) {
    console.error('[mlController] getResolutionPrediction error:', err.message);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
}

export async function analyzeSentiment(req, res) {
  try {
    const result = await analyzeSentimentService(req.body.complaintId, req.body.feedbackText);
    res.json(result);
  } catch (err) {
    console.error('[mlController] analyzeSentiment error:', err.message);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
}

export async function getFollowUpRequired(req, res) {
  try {
    const complaints = await Complaint.find({ requiresFollowUp: true }).sort({ updatedAt: -1 });
    res.json({ complaints });
  } catch (err) {
    console.error('[mlController] getFollowUpRequired error:', err.message);
    res.status(500).json({ message: err.message });
  }
}

export async function getAnomalies(req, res) {
  try {
    const filter = {
      resolvedAt: null,
      ...(req.query.severity && { severity: req.query.severity })
    };
    const alerts = await AnomalyAlert.find(filter).sort({ severity: -1, observedCount: -1 });
    res.json({ alerts });
  } catch (err) {
    console.error('[mlController] getAnomalies error:', err.message);
    res.status(500).json({ message: err.message });
  }
}

export async function resolveAnomaly(req, res) {
  try {
    const alert = await AnomalyAlert.findById(req.params.alertId);
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    alert.resolvedAt = new Date();
    await alert.save();
    res.json({ message: 'Alert resolved.', resolvedAt: alert.resolvedAt });
  } catch (err) {
    console.error('[mlController] resolveAnomaly error:', err.message);
    res.status(500).json({ message: err.message });
  }
}

export async function runAnomalyDetection(req, res) {
  try {
    const result = await runAnomalyDetectionService();
    res.json({ message: 'Detection pass complete.', ...result });
  } catch (err) {
    console.error('[mlController] runAnomalyDetection error:', err.message);
    res.status(500).json({ message: err.message });
  }
}
