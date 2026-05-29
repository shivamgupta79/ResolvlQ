import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import Complaint from '../models/Complaint.js';
import Technician from '../models/Technician.js';

const router = express.Router();
router.use(protect, adminOnly);

// GET /api/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const [total, pending, assigned, inProgress, scheduled, completed, cancelled] = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: 'Pending' }),
      Complaint.countDocuments({ status: 'Assigned' }),
      Complaint.countDocuments({ status: 'In Progress' }),
      Complaint.countDocuments({ status: 'Scheduled' }),
      Complaint.countDocuments({ status: 'Completed' }),
      Complaint.countDocuments({ status: 'Cancelled' }),
    ]);

    // Average resolution time (createdAt → completedAt approximated by updatedAt for Completed)
    const completedComplaints = await Complaint.find({ status: 'Completed' }).select('createdAt updatedAt');
    const avgResolutionMs = completedComplaints.length
      ? completedComplaints.reduce((sum, c) => sum + (c.updatedAt - c.createdAt), 0) / completedComplaints.length
      : 0;
    const avgResolutionHours = Math.round(avgResolutionMs / (1000 * 60 * 60));

    // Feedback stats
    const feedbackComplaints = await Complaint.find({ feedbackSubmitted: true, feedbackRating: { $ne: null } }).select('feedbackRating');
    const avgRating = feedbackComplaints.length
      ? (feedbackComplaints.reduce((s, c) => s + c.feedbackRating, 0) / feedbackComplaints.length).toFixed(1)
      : null;

    res.json({ total, pending, assigned, inProgress, scheduled, completed, cancelled, avgResolutionHours, avgRating, feedbackCount: feedbackComplaints.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/by-week  — last 8 weeks
router.get('/by-week', async (req, res) => {
  try {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - i * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const [created, resolved] = await Promise.all([
        Complaint.countDocuments({ createdAt: { $gte: start, $lt: end } }),
        Complaint.countDocuments({ status: 'Completed', updatedAt: { $gte: start, $lt: end } }),
      ]);

      weeks.push({
        week: `W${start.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
        created,
        resolved
      });
    }
    res.json(weeks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/by-issue
router.get('/by-issue', async (req, res) => {
  try {
    const data = await Complaint.aggregate([
      { $group: { _id: '$issueType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);
    res.json(data.map((d) => ({ name: d._id, value: d.count })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/by-priority
router.get('/by-priority', async (req, res) => {
  try {
    const data = await Complaint.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    res.json(data.map((d) => ({ name: d._id, value: d.count })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/engineer-performance
router.get('/engineer-performance', async (req, res) => {
  try {
    const technicians = await Technician.find().populate('user', 'name');
    const perf = await Promise.all(
      technicians
        .filter((t) => t.user)
        .map(async (t) => {
          const [assigned, completed, feedbackDocs] = await Promise.all([
            Complaint.countDocuments({ assignedTechnician: t.user._id }),
            Complaint.countDocuments({ assignedTechnician: t.user._id, status: 'Completed' }),
            Complaint.find({ assignedTechnician: t.user._id, feedbackSubmitted: true, feedbackRating: { $ne: null } }).select('feedbackRating'),
          ]);
          const avgRating = feedbackDocs.length
            ? (feedbackDocs.reduce((s, c) => s + c.feedbackRating, 0) / feedbackDocs.length).toFixed(1)
            : null;
          return { name: t.user.name, skillType: t.skillType, assigned, completed, avgRating };
        })
    );
    res.json(perf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/resolution-accuracy
// Aggregates avg predictedResolutionHours vs avgActualResolutionHours grouped by issueType
router.get('/resolution-accuracy', async (req, res) => {
  try {
    const data = await Complaint.aggregate([
      {
        $match: {
          predictedResolutionHours: { $ne: null },
          actualResolutionHours: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$issueType',
          avgPredicted: { $avg: '$predictedResolutionHours' },
          avgActual: { $avg: '$actualResolutionHours' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    res.json(
      data.map((d) => ({
        issueType: d._id,
        avgPredicted: Math.round(d.avgPredicted * 10) / 10,
        avgActual: Math.round(d.avgActual * 10) / 10
      }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/sentiment-distribution
// Aggregates sentimentLabel breakdown for complaints with feedback
router.get('/sentiment-distribution', async (req, res) => {
  try {
    const data = await Complaint.aggregate([
      {
        $match: {
          feedbackSubmitted: true,
          sentimentLabel: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$sentimentLabel',
          count: { $sum: 1 }
        }
      }
    ]);
    res.json(data.map((d) => ({ name: d._id, value: d.count })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
