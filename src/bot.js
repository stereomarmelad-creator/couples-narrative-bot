var db = require('./db');
var safety = require('./safety');
var rag = require('./rag');

var fetch = require('node-fetch');

var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var API_BASE = 'https://api.telegram.org/bot' + BOT_TOKEN;

// ── Telegram API helpers ──

async function sendMessage(chatId, text, replyMarkup) {
  var body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  var res = await fetch(API_BASE + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var data = await res.json();
  if (!data.ok) console.error('sendMessage error:', JSON.stringify(data));
  return data;
}

async function sendChatAction(chatId, action) {
  try {
    await fetch(API_BASE + '/sendChatAction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: action })
    });
  } catch (e) { /* ignore */ }
}

function generateInviteCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ── Command handlers ──

async function handleStart(chatId, userId, username, firstName) {
  var user = await db.getUserByTelegramId(userId);
  if (!user) {
    user = await db.createUser(userId, username, firstName);
    await sendMessage(chatId,
      '👋 Привет, ' + (firstName || 'друг') + '!\n\n' +
      'Я — бот-летописец пар. Я помогаю парам создавать совместную историю любви.\n\n' +
      '📖 Каждый вечер я пишу главу из вашей общей истории на основе ваших сообщений за день.\n\n' +
      '🔒 Все сообщения шифруются. Личные ответы не попадают в главы.\n\n' +
      'Чтобы начать, создайте пару командой /pair или используйте код приглашения партнёра.'
    );
  } else {
    var pairInfo = '';
    if (user.pair_id) {
      var members = await db.getPairMembers(user.pair_id);
      pairInfo = '\n\n💕 Вы в паре с ' + members.length + ' партнёром(-ами).';
    } else {
      pairInfo = '\n\n💔 Вы пока не в паре. Используйте /pair чтобы создать или присоединиться.';
    }
    await sendMessage(chatId, 'С возвращением, ' + (firstName || 'друг') + '!' + pairInfo);
  }
  return user;
}

async function handlePair(chatId, userId, text) {
  var user = await db.getUserByTelegramId(userId);
  if (!user) {
    await sendMessage(chatId, 'Сначала нажмите /start');
    return;
  }
  if (user.pair_id) {
    await sendMessage(chatId, 'Вы уже в паре! Используйте /status для информации.');
    return;
  }
  var parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    // Create new pair
    var code = generateInviteCode();
    var pair = await db.createPair(code);
    await db.updateUserPair(user.id, pair.id);
    await sendMessage(chatId,
      '💕 Пара создана!\n\n' +
      'Ваш код приглашения: <code>' + code + '</code>\n\n' +
      'Отправьте его партнёру. Он должен написать:\n' +
      '<code>/pair ' + code + '</code>\n\n' +
      'Код действителен 24 часа.'
    );
  } else {
    // Join existing pair
    var code = parts[1].toUpperCase();
    var pair = await db.getPairByCode(code);
    if (!pair) {
      await sendMessage(chatId, '❌ Код не найден. Проверьте и попробуйте снова.');
      return;
    }
    if (pair.user2_id) {
      await sendMessage(chatId, '❌ Эта пара уже заполнена.');
      return;
    }
    await db.completePair(pair.id, user.id);
    await db.updateUserPair(user.id, pair.id);
    await sendMessage(chatId, '💕 Отлично! Вы теперь в паре!\n\nНачните писать сообщения — они станут частью вашей истории любви.');
  }
}

async function handleStatus(chatId, userId) {
  var user = await db.getUserByTelegramId(userId);
  if (!user) {
    await sendMessage(chatId, 'Сначала нажмите /start');
    return;
  }
  if (!user.pair_id) {
    await sendMessage(chatId, '💔 Вы не в паре.\n\n/pair — создать пару\n/pair КОД — присоединиться');
    return;
  }
  var members = await db.getPairMembers(user.pair_id);
  var memberNames = members.map(function (m) { return m.first_name || m.username || 'Аноним'; });
  var chapters = await db.getLatestChapters(user.pair_id, 1);
  var msg = '💕 Статус пары:\n\n' +
    '👥 Участники: ' + memberNames.join(', ') + '\n' +
    '📖 Всего глав: ' + (chapters ? 'последняя от ' + new Date(chapters[0].created_at).toLocaleDateString('ru-RU') : 'пока нет') + '\n' +
    '🔒 Шифрование: AES-256-GCM ✓\n\n' +
    '💡 Пишите что угодно — ваши мысли, события, чувства. Всё станет частью истории!';
  await sendMessage(chatId, msg);
}

async function handleDelete(chatId, userId) {
  var user = await db.getUserByTelegramId(userId);
  if (!user) {
    await sendMessage(chatId, 'Сначала нажмите /start');
    return;
  }
  await sendMessage(chatId,
    '⚠️ <b>Удаление всех данных</b>\n\n' +
    'Это действие удалит ВСЕ ваши сообщения, главы и информацию о паре.\n' +
    'Это необратимо!\n\n' +
    'Для подтверждения напишите: <code>УДАЛИТЬ ВСЁ</code>'
  );
}

async function handleDeleteConfirm(chatId, userId) {
  await db.deleteAllUserData(userId);
  await sendMessage(chatId,
    '🗑 Все ваши данные удалены.\n\n' +
    'Для начала заново нажмите /start'
  );
}

async function handleHelp(chatId) {
  await sendMessage(chatId,
    '📖 <b>Команды бота:</b>\n\n' +
    '/start — Начать / Регистрация\n' +
    '/pair — Создать новую пару (получите код)\n' +
    '/pair КОД — Присоединиться к паре по коду\n' +
    '/status — Статус пары\n' +
    '/delete — Удалить все данные (GDPR)\n' +
    '/help — Это сообщение\n\n' +
    '💡 <b>Как это работает:</b>\n' +
    '1. Пишите сообщения в течение дня\n' +
    '2. Каждый вечер в 21:00 бот пишет главу вашей истории\n' +
    '3. Личные ответы (пометка 🔒) не попадают в главы\n\n' +
    '🛡 <b>Безопасность:</b> бот отслеживает тревожные сигналы и предлагает помощь.'
  );
}

// ── Message handler ──

async function handleMessage(chatId, userId, text, message) {
  if (!text) return;

  var user = await db.getUserByTelegramId(userId);
  if (!user) {
    await sendMessage(chatId, 'Нажмите /start для начала.');
    return;
  }

  // Check for delete confirmation
  if (text.trim().toUpperCase() === 'УДАЛИТЬ ВСЁ' || text.trim().toUpperCase() === 'DELETE EVERYTHING') {
    await handleDeleteConfirm(chatId, userId);
    return;
  }

  // Check for commands
  if (text.startsWith('/')) return;

  // Check safety
  var safetyResult = await safety.checkSafety(text, true);
  if (safetyResult.category !== 'SAFE') {
    var lang = safety.detectLanguage(text);
    var crisisMsg = safety.getCrisisMessage(safetyResult.category, lang);
    await sendMessage(chatId, '🚨 ' + crisisMsg);
    if (user.pair_id) {
      await db.logIncident(user.id, user.pair_id, safetyResult.category, safetyResult.confidence, text);
    }
    return;
  }

  // If user is not in a pair, prompt to join
  if (!user.pair_id) {
    await sendMessage(chatId, 'Вы не в паре. Используйте /pair чтобы создать или присоединиться к паре.');
    return;
  }

  // Encrypt and store message
  var encrypted = crypto.encrypt(text, userId);
  var msg = await db.storeMessage(user.pair_id, user.id, encrypted, false);

  // Generate embedding for RAG
  await rag.storeMessageEmbedding(db.supabase, msg.id, text, user.pair_id);

  // Send acknowledgment with personal question option
  var replyMarkup = {
    inline_keyboard: [[
      { text: '🔒 Личный ответ (не в главу)', callback_data: 'personal_' + msg.id }
    ]]
  };
  await sendMessage(chatId, '💾 Записано в вашу историю.', replyMarkup);
}

async function handleCallbackQuery(query) {
  var chatId = query.message.chat.id;
  var userId = query.from.id;
  var data = query.data;

  if (data.startsWith('personal_')) {
    await sendMessage(chatId,
      '🔒 <b>Личный ответ</b>\n\n' +
      'Напишите ваш ответ — он останется приватным и не будет добавлен в главу истории.'
    );
  }

  // Answer callback to remove loading state
  await fetch(API_BASE + '/answerCallbackQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: query.id })
  });
}

// ── Webhook processing ──

async function processUpdate(update) {
  try {
    if (update.message) {
      var msg = update.message;
      var chatId = msg.chat.id;
      var userId = msg.from.id;
      var text = msg.text || '';

      // Handle commands
      if (text.startsWith('/start')) {
        await handleStart(chatId, userId, msg.from.username, msg.from.first_name);
      } else if (text.startsWith('/pair')) {
        await handlePair(chatId, userId, text);
      } else if (text.startsWith('/status')) {
        await handleStatus(chatId, userId);
      } else if (text.startsWith('/delete')) {
        await handleDelete(chatId, userId);
      } else if (text.startsWith('/help')) {
        await handleHelp(chatId);
      } else {
        await sendChatAction(chatId, 'typing');
        await handleMessage(chatId, userId, text, msg);
      }
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (err) {
    console.error('Error processing update:', err);
  }
}

module.exports = {
  processUpdate: processUpdate,
  sendMessage: sendMessage,
  handleStart: handleStart,
  handlePair: handlePair,
  handleStatus: handleStatus,
  handleDelete: handleDelete,
  handleDeleteConfirm: handleDeleteConfirm,
  handleHelp: handleHelp,
  handleMessage: handleMessage,
  generateInviteCode: generateInviteCode
};
