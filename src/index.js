var express = require('express');
var cron = require('node-cron');
var bot = require('./bot');
var db = require('./db');
var crypto = require('./crypto');
var rag = require('./rag');
var llm = require('./chapter');
var prompts = require('./prompts');

var app = express();
app.use(express.json());

var PORT = process.env.PORT || 3000;

// ── Health check ──
app.get('/', function (req, res) {
  res.json({ status: 'ok', service: 'couples-narrative-bot', timestamp: new Date().toISOString() });
});

// ── Telegram webhook endpoint ──
app.post('/webhook', async function (req, res) {
  res.sendStatus(200); // Respond immediately
  // Process asynchronously
  bot.processUpdate(req.body).catch(function (err) {
    console.error('Webhook processing error:', err);
  });
});

// ── Set webhook on startup ──
async function setWebhook() {
  var webhookUrl = process.env.WEBHOOK_URL;
  var token = process.env.TELEGRAM_BOT_TOKEN;
  if (!webhookUrl || !token) {
    console.warn('WEBHOOK_URL or TELEGRAM_BOT_TOKEN not set, skipping webhook registration');
    return;
  }
  var fetch = require('node-fetch');
  var res = await fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl + '/webhook' })
  });
  var data = await res.json();
  console.log('Webhook set:', JSON.stringify(data));
}

// ── Daily chapter generation at 21:00 ──
cron.schedule('0 21 * * *', async function () {
  console.log('Starting daily chapter generation...');
  try {
    await generateDailyChapters();
  } catch (err) {
    console.error('Chapter generation cron error:', err);
  }
});

async function generateDailyChapters() {
  // Get all active pairs
  var { data: pairs, error } = await db.supabase
    .from('pairs')
    .select('id, user1_id, user2_id')
    .not('user2_id', null)
    .not('paired_at', null);

  if (error) {
    console.error('Failed to fetch pairs:', error.message);
    return;
  }

  console.log('Generating chapters for ' + pairs.length + ' pairs');

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    try {
      await generateChapterForPair(pair.id);
    } catch (err) {
      console.error('Failed to generate chapter for pair ' + pair.id + ':', err.message);
    }
  }
}

async function generateChapterForPair(pairId) {
  // Get today's messages
  var messages = await db.getTodayMessages(pairId);
  if (messages.length === 0) {
    console.log('No messages for pair ' + pairId + ' today, skipping');
    return;
  }

  // Decrypt messages
  var decryptedMessages = messages.map(function (msg) {
    var user = { id: msg.user_id };
    try {
      var text = crypto.decrypt(msg.encrypted_text, msg.user_id);
      return { user_id: msg.user_id, text: text, created_at: msg.created_at };
    } catch (e) {
      console.error('Failed to decrypt message ' + msg.id + ':', e.message);
      return null;
    }
  }).filter(Boolean);

  if (decryptedMessages.length === 0) return;

  // Get RAG context
  var todayText = decryptedMessages.map(function (m) { return m.text; }).join(' ');
  var ragContext = await rag.queryRelevantContext(db.supabase, pairId, todayText, 5);

  // Get recent chapters for continuity
  var recentChapters = await db.getLatestChapters(pairId, 3);
  var chapterContext = '';
  if (recentChapters && recentChapters.length > 0) {
    chapterContext = recentChapters.map(function (ch) {
      return 'Глава от ' + new Date(ch.created_at).toLocaleDateString('ru-RU') + ':\n' + ch.content.substring(0, 300);
    }).join('\n\n');
  }

  // Build the prompt
  var ragSection = ragContext || 'Это первый день вашей истории.';
  var messagesSection = decryptedMessages.map(function (m) {
    return '[' + new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '] ' + m.text;
  }).join('\n');

  var fullPrompt = prompts.CHAPTER_PROMPT
    .replace('{{RAG_CONTEXT}}', ragSection + '\n\nПредыдущие главы:\n' + chapterContext)
    .replace('{{TODAY_MESSAGES}}', messagesSection);

  // Call LLM
  var messages = [
    { role: 'system', content: 'You are a literary writer. Write in the language the couple uses (Russian or English).' },
    { role: 'user', content: fullPrompt }
  ];

  var chapterContent = await llm.chatCompletion(messages, llm.CHAPTER_MODEL, 2000);

  // Count words
  var wordCount = chapterContent.split(/\s+/).length;

  // Store chapter
  var chapter = await db.storeChapter(pairId, chapterContent, wordCount);

  // Store chapter embedding
  await rag.storeChapterEmbedding(db.supabase, chapter.id, chapterContent, pairId);

  // Notify pair members
  var members = await db.getPairMembers(pairId);
  for (var j = 0; j < members.length; j++) {
    var member = members[j];
    await bot.sendMessage(member.telegram_id,
      '📖 <b>Новая глава вашей истории готова!</b>\n\n' +
      chapterContent.substring(0, 1000) + (chapterContent.length > 1000 ? '\n\n...' : '') +
      '\n\n💡 Полную версию смотрите в истории глав.'
    );
  }

  console.log('Chapter generated for pair ' + pairId + ' (' + wordCount + ' words)');
}

// ── Start server ──
app.listen(PORT, async function () {
  console.log('Server running on port ' + PORT);
  await setWebhook();
});

module.exports = app;
