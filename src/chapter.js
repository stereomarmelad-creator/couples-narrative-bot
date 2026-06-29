var fetch = require('node-fetch');

var OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
var EMBEDDING_URL = 'https://openrouter.ai/api/v1/embeddings';

var CHAPTER_MODEL = 'google/gemma-2-27b-it:free';
var EMBEDDING_MODEL = 'google/gemini-embedding-001';
var SAFETY_MODEL = 'google/gemma-2-27b-it:free';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
    'HTTP-Referer': process.env.WEBHOOK_URL || 'http://localhost:3000',
    'X-Title': 'Couples Narrative Bot'
  };
}

async function chatCompletion(messages, model, maxTokens) {
  model = model || CHAPTER_MODEL;
  maxTokens = maxTokens || 1024;
  var body = {
    model: model,
    messages: messages,
    max_tokens: maxTokens,
    temperature: 0.7
  };
  var res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    var errText = await res.text();
    console.error('OpenRouter error:', res.status, errText);
    throw new Error('LLM request failed: ' + res.status);
  }
  var data = await res.json();
  return data.choices[0].message.content;
}

async function createEmbedding(text, model) {
  model = model || EMBEDDING_MODEL;
  var body = {
    model: model,
    input: text
  };
  var res = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    var errText = await res.text();
    console.error('Embedding error:', res.status, errText);
    throw new Error('Embedding request failed: ' + res.status);
  }
  var data = await res.json();
  return data.data[0].embedding;
}

async function classifySafety(message) {
  var messages = [
    { role: 'system', content: 'You are a safety classifier. Respond with valid JSON only.' },
    { role: 'user', content: 'Analyze for suicide, violence, severe depression, or threat. Respond with JSON: {"category":"SAFE|SUICIDE|VIOLENCE|SEVERE_DEPRESSION|THREAT","confidence":0.0-1.0,"reason":"brief"}\n\nMessage: ' + message }
  ];
  var response = await chatCompletion(messages, SAFETY_MODEL, 200);
  try {
    var json = JSON.parse(response);
    return json;
  } catch (e) {
    return { category: 'SAFE', confidence: 0, reason: 'parse failed' };
  }
}

module.exports = {
  chatCompletion: chatCompletion,
  createEmbedding: createEmbedding,
  classifySafety: classifySafety,
  CHAPTER_MODEL: CHAPTER_MODEL,
  EMBEDDING_MODEL: EMBEDDING_MODEL
};
