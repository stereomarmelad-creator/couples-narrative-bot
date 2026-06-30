var fetch = require('node-fetch');

// LLM endpoint (AITunnel or any OpenAI-compatible)
var LLM_URL = process.env.LLM_API_URL || 'https://api.aitunnel.ru/v1/chat/completions';
var LLM_KEY = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY;

// Embedding endpoint (OpenRouter recommended)
var EMBEDDING_URL = process.env.EMBEDDING_API_URL || 'https://openrouter.ai/api/v1/embeddings';
var EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENROUTER_API_KEY;

var CHAPTER_MODEL = process.env.CHAPTER_MODEL || 'deepseek/deepseek-v4-flash';
var SAFETY_MODEL = process.env.SAFETY_MODEL || 'deepseek/deepseek-v4-flash';
var EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'google/gemini-embedding-001';

function getLlmHeaders() {
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + LLM_KEY
  };
  // OpenRouter-specific headers (safe to skip for AITunnel)
  if (LLM_URL.indexOf('openrouter.ai') > -1) {
    headers['HTTP-Referer'] = process.env.WEBHOOK_URL || 'http://localhost:3000';
    headers['X-Title'] = 'Couples Narrative Bot';
  }
  return headers;
}

function getEmbeddingHeaders() {
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + EMBEDDING_KEY
  };
  if (EMBEDDING_URL.indexOf('openrouter.ai') > -1) {
    headers['HTTP-Referer'] = process.env.WEBHOOK_URL || 'http://localhost:3000';
    headers['X-Title'] = 'Couples Narrative Bot';
  }
  return headers;
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
  var res = await fetch(LLM_URL, {
    method: 'POST',
    headers: getLlmHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    var errText = await res.text();
    console.error('LLM error:', res.status, errText);
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
    headers: getEmbeddingHeaders(),
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
