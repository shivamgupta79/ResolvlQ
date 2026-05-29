import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// ── ML API helpers ────────────────────────────────────────────────────────────

/**
 * Rank available technicians for a complaint.
 * POST /api/ml/score-technicians
 */
export const scoreTechnicians = (complaintId) =>
  api.post('/ml/score-technicians', { complaintId });

/**
 * Batch-evaluate escalation risk for all open, non-escalated complaints.
 * GET /api/ml/escalation-risk
 */
export const getEscalationRiskBatch = () =>
  api.get('/ml/escalation-risk');

/**
 * Evaluate escalation risk for a single complaint.
 * GET /api/ml/escalation-risk/:complaintId
 */
export const getEscalationRiskSingle = (complaintId) =>
  api.get(`/ml/escalation-risk/${complaintId}`);

/**
 * Find similar / duplicate complaints for a given complaint.
 * POST /api/ml/find-similar
 */
export const findSimilarComplaints = (complaintId) =>
  api.post('/ml/find-similar', { complaintId });

/**
 * Return all active duplicate complaint groups.
 * GET /api/ml/duplicate-groups
 */
export const getDuplicateGroups = () =>
  api.get('/ml/duplicate-groups');

/**
 * Return or recompute the predicted resolution for a complaint.
 * GET /api/ml/resolution-prediction/:complaintId
 */
export const getResolutionPrediction = (complaintId) =>
  api.get(`/ml/resolution-prediction/${complaintId}`);

/**
 * Analyze feedback sentiment for a complaint.
 * POST /api/ml/analyze-sentiment
 */
export const analyzeSentiment = (complaintId, feedbackText) =>
  api.post('/ml/analyze-sentiment', { complaintId, feedbackText });

/**
 * Return all complaints flagged for follow-up.
 * GET /api/ml/follow-up-required
 */
export const getFollowUpRequired = () =>
  api.get('/ml/follow-up-required');

/**
 * Return active anomaly alerts, optionally filtered by severity.
 * GET /api/ml/anomalies?severity=High|Medium
 * @param {string} [severity] - Optional severity filter ('High' or 'Medium')
 */
export const getAnomalies = (severity) => {
  const params = severity ? { severity } : {};
  return api.get('/ml/anomalies', { params });
};

/**
 * Mark an anomaly alert as resolved.
 * POST /api/ml/anomalies/:alertId/resolve
 */
export const resolveAnomaly = (alertId) =>
  api.post(`/ml/anomalies/${alertId}/resolve`);

/**
 * Manually trigger an anomaly detection pass.
 * POST /api/ml/anomalies/run
 */
export const runAnomalyDetection = () =>
  api.post('/ml/anomalies/run');
