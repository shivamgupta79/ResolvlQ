import OpenAI from 'openai';
import Complaint from '../models/Complaint.js';
import { lexiconSentiment } from '../utils/mlUtils.js';

// io is imported dynamically inside the function to avoid circular ESM dependency
async function getIo() {
  const { io } = await import('../server.js');
  return io;
}

/**
 * Analyzes the sentiment of a resident's feedback text and persists the result
 * on the associated complaint. Emits a Socket.IO event when negative sentiment
 * with high confidence is detected.
 *
 * @param {string} complaintId  - MongoDB ObjectId of the complaint
 * @param {string} feedbackText - The resident's feedback text
 * @returns {{ complaintId, sentimentLabel, sentimentConfidence, requiresFollowUp }}
 */
export async function analyzeSentiment(complaintId, feedbackText) {
  // ── Validation ────────────────────────────────────────────────────────────
  if (!feedbackText || feedbackText.trim().length < 3) {
    const err = new Error('Feedback text must be at least 3 characters.');
    err.statusCode = 400;
    throw err;
  }

  try {
    // ── Fetch complaint ───────────────────────────────────────────────────
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      const err = new Error(`Complaint not found: ${complaintId}`);
      err.statusCode = 404;
      throw err;
    }

    // ── Classify sentiment ────────────────────────────────────────────────
    let label, confidence;

    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Classify sentiment as Positive, Neutral, or Negative. Return JSON: { "label": "...", "confidence": 0.0-1.0 }'
            },
            { role: 'user', content: feedbackText }
          ],
          response_format: { type: 'json_object' }
        });
        const parsed = JSON.parse(response.choices[0].message.content);
        label = parsed.label;
        confidence = parsed.confidence;
      } catch (openaiErr) {
        console.error('[SentimentAnalyzer] OpenAI call failed, falling back to lexicon:', openaiErr.message);
        ({ label, confidence } = lexiconSentiment(feedbackText));
      }
    } else {
      ({ label, confidence } = lexiconSentiment(feedbackText));
    }

    // ── Persist sentiment fields ──────────────────────────────────────────
    complaint.sentimentLabel = label;
    complaint.sentimentConfidence = confidence;

    // ── Follow-up logic ───────────────────────────────────────────────────
    let requiresFollowUp = complaint.requiresFollowUp || false;

    if (label === 'Negative' && confidence > 0.70) {
      complaint.requiresFollowUp = true;
      requiresFollowUp = true;

      const io = await getIo();
      io.emit('complaint:followup_required', {
        complaintId: complaint._id,
        residentName: complaint.residentName,
        sentimentLabel: label
      });
    }

    await complaint.save();

    return {
      complaintId: complaint._id,
      sentimentLabel: label,
      sentimentConfidence: confidence,
      requiresFollowUp
    };
  } catch (err) {
    // Re-throw validation / not-found errors as-is
    if (err.statusCode) throw err;

    console.error('[SentimentAnalyzer] Unexpected error:', err.message);
    throw err;
  }
}
