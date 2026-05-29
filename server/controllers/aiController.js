import { classifyIssue, generateMaintenanceEmail } from '../services/aiService.js';

export async function classify(req, res) {
  const { description } = req.body;
  if (!description) return res.status(400).json({ message: 'description is required' });
  res.json(await classifyIssue(description));
}

export async function generateEmail(req, res) {
  res.json({ email: generateMaintenanceEmail(req.body) });
}
