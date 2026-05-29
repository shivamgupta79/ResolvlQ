import OpenAI from 'openai';

const keywordMap = [
  { type: 'Plumbing', words: ['water', 'leak', 'tap', 'pipe', 'bathroom', 'toilet', 'drain'] },
  { type: 'Electrical', words: ['electric', 'power', 'light', 'fan', 'switch', 'socket', 'wire'] },
  { type: 'Lift', words: ['lift', 'elevator', 'stuck'] },
  { type: 'Cleaning', words: ['garbage', 'clean', 'waste', 'smell', 'dust'] },
  { type: 'Security', words: ['security', 'gate', 'guard', 'camera', 'cctv'] },
  { type: 'Internet', words: ['wifi', 'internet', 'router', 'network'] }
];

export function ruleBasedClassify(description = '') {
  const text = description.toLowerCase();
  const issue = keywordMap.find((item) => item.words.some((word) => text.includes(word)));
  const urgentWords = ['fire', 'spark', 'flood', 'short circuit', 'emergency', 'danger', 'gas'];
  const highWords = ['urgent', 'not working', 'broken', 'overflow', 'major'];

  let priority = 'Medium';
  if (urgentWords.some((w) => text.includes(w))) priority = 'Urgent';
  else if (highWords.some((w) => text.includes(w))) priority = 'High';
  else if (text.length < 40) priority = 'Low';

  return { issueType: issue?.type || 'General Maintenance', priority };
}

export async function classifyIssue(description) {
  if (!process.env.OPENAI_API_KEY) return ruleBasedClassify(description);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Classify apartment maintenance complaints. Return only JSON with issueType and priority. priority must be Low, Medium, High, or Urgent.'
        },
        { role: 'user', content: description }
      ],
      response_format: { type: 'json_object' }
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI classify failed. Using fallback.', error.message);
    return ruleBasedClassify(description);
  }
}

export function generateMaintenanceEmail(data) {
  return `Dear Maintenance Team,\n\nI am reporting a maintenance issue in my apartment.\n\nResident Name: ${data.residentName}\nApartment Number: ${data.apartmentNo}\nIssue Type: ${data.issueType}\nPriority: ${data.priority}\nPreferred Visit: ${data.preferredDate} at ${data.preferredTime}\n\nIssue Details:\n${data.description}\n\nPlease schedule a maintenance visit and update the status as soon as possible.\n\nThank you,\n${data.residentName}`;
}
