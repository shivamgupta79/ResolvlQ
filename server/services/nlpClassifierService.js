import OpenAI from 'openai';
import { ruleBasedClassify } from './aiService.js';

// Extended keyword map — adds HVAC, Structural, Pest Control on top of aiService.js entries.
// Short ambiguous tokens (e.g. "ac", "bug") use word-boundary regex to avoid false matches
// inside longer words (e.g. "ac" inside "cockroach", "bug" inside "debug").
const EXTENDED_KEYWORDS = [
  {
    type: 'HVAC',
    words: ['hvac', 'air conditioning', 'heating', 'ventilation', 'duct'],
    wordBoundary: ['ac']   // match only as a standalone word
  },
  {
    type: 'Structural',
    words: ['crack', 'wall', 'ceiling', 'floor', 'roof', 'foundation', 'damp']
  },
  {
    type: 'Pest Control',
    words: ['pest', 'cockroach', 'rat', 'mouse', 'insect', 'termite'],
    wordBoundary: ['bug']  // avoid matching "debug", "debugger", etc.
  }
];

const SYSTEM_PROMPT =
  'You are a maintenance complaint classifier. Classify the complaint into exactly one of these ' +
  'issue types: Plumbing, Electrical, Lift, Cleaning, Security, Internet, HVAC, Structural, ' +
  'Pest Control, General Maintenance. Also classify priority as Low, Medium, High, or Urgent. ' +
  'Return JSON: { "issueType": "...", "priority": "...", "confidence": 0.0-1.0 }';

/**
 * Extended rule-based classify that checks the three new keyword categories
 * before falling back to the base ruleBasedClassify from aiService.js.
 *
 * @param {string} description
 * @returns {{ issueType: string, priority: string }}
 */
function extendedRuleBasedClassify(description = '') {
  const text = description.toLowerCase();

  // Check extended keywords first
  const extendedMatch = EXTENDED_KEYWORDS.find((item) => {
    const plainMatch = item.words.some((word) => text.includes(word));
    if (plainMatch) return true;
    // Word-boundary tokens (short/ambiguous keywords)
    if (item.wordBoundary) {
      return item.wordBoundary.some((word) => new RegExp(`\\b${word}\\b`).test(text));
    }
    return false;
  });

  if (extendedMatch) {
    // Reuse priority logic from ruleBasedClassify by calling it and overriding issueType
    const base = ruleBasedClassify(description);
    return { issueType: extendedMatch.type, priority: base.priority };
  }

  // Fall through to the original rule-based classifier
  return ruleBasedClassify(description);
}

/**
 * Classify a maintenance complaint description using OpenAI NLP when available,
 * falling back to rule-based classification otherwise.
 *
 * @param {string} description - The complaint description text
 * @returns {Promise<{ issueType: string, priority: string, confidence: number, classificationSource: 'nlp'|'rule-based' }>}
 */
export async function classifyIssue(description) {
  // Use rule-based path when explicitly requested or no API key is configured
  if (process.env.USE_RULE_BASED === 'true' || !process.env.OPENAI_API_KEY) {
    const result = extendedRuleBasedClassify(description);
    return { ...result, confidence: 0.0, classificationSource: 'rule-based' };
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: description }
      ],
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const { issueType, priority, confidence } = parsed;

    return {
      issueType,
      priority,
      confidence: typeof confidence === 'number' ? confidence : 0.0,
      classificationSource: 'nlp'
    };
  } catch (error) {
    console.error('[NLPClassifier] OpenAI classification failed, falling back to rule-based:', error.message);

    const result = extendedRuleBasedClassify(description);
    return { ...result, confidence: 0.0, classificationSource: 'rule-based' };
  }
}
