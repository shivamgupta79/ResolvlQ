import express from 'express';
import { classifyIssue } from '../services/nlpClassifierService.js';
import { generateEmail } from '../controllers/aiController.js';

const router = express.Router();

router.post('/classify-issue', async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ message: 'description is required' });
  try {
    const result = await classifyIssue(description);
    res.json(result);
  } catch (err) {
    console.error('[aiRoutes] classify-issue error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/generate-email', generateEmail);

export default router;
