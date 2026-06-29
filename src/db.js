var { createClient } = require('@supabase/supabase-js');

var supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Users ──

async function createUser(telegramId, username, firstName) {
  var { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      username: username || null,
      first_name: firstName || null,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error && error.code === '23505') {
    return getUserByTelegramId(telegramId);
  }
  if (error) throw error;
  return data;
}

async function getUserByTelegramId(telegramId) {
  var { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

async function getUserById(id) {
  var { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

async function updateUserPair(userId, pairId) {
  var { data, error } = await supabase
    .from('users')
    .update({ pair_id: pairId })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Pairs ──

async function createPair(code) {
  var { data, error } = await supabase
    .from('pairs')
    .insert({
      invite_code: code,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getPairByCode(code) {
  var { data, error } = await supabase
    .from('pairs')
    .select('*')
    .eq('invite_code', code)
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

async function getPairById(id) {
  var { data, error } = await supabase
    .from('pairs')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

async function getPairMembers(pairId) {
  var { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('pair_id', pairId);
  if (error) throw error;
  return data || [];
}

async function completePair(pairId, userId2) {
  var { data, error } = await supabase
    .from('pairs')
    .update({ user2_id: userId2, paired_at: new Date().toISOString() })
    .eq('id', pairId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Messages ──

async function storeMessage(pairId, userId, encryptedText, isPersonal) {
  var { data, error } = await supabase
    .from('messages')
    .insert({
      pair_id: pairId,
      user_id: userId,
      encrypted_text: encryptedText,
      is_personal: isPersonal || false,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getTodayMessages(pairId) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('pair_id', pairId)
    .eq('is_personal', false)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getAllMessages(pairId) {
  var { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('pair_id', pairId)
    .eq('is_personal', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── Chapters ──

async function storeChapter(pairId, content, wordCount) {
  var { data, error } = await supabase
    .from('chapters')
    .insert({
      pair_id: pairId,
      content: content,
      word_count: wordCount || 0,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getLatestChapters(pairId, limit) {
  limit = limit || 5;
  var { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ── Safety Incidents ──

async function logIncident(userId, pairId, category, confidence, messagePreview) {
  var { data, error } = await supabase
    .from('safety_incidents')
    .insert({
      user_id: userId,
      pair_id: pairId,
      category: category,
      confidence: confidence,
      message_preview: messagePreview ? messagePreview.substring(0, 200) : null,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) console.error('Failed to log incident:', error.message);
  return data;
}

// ── GDPR Delete ──

async function deleteAllUserData(userId) {
  var user = await getUserById(userId);
  if (!user) return false;
  // Delete messages
  await supabase.from('messages').delete().eq('user_id', userId);
  // Delete safety incidents
  await supabase.from('safety_incidents').delete().eq('user_id', userId);
  // Delete user
  await supabase.from('users').delete().eq('id', userId);
  // If user was in a pair, check if pair is now empty
  if (user.pair_id) {
    var members = await getPairMembers(user.pair_id);
    if (members.length === 0) {
      await supabase.from('chapters').delete().eq('pair_id', user.pair_id);
      await supabase.from('messages').delete().eq('pair_id', user.pair_id);
      await supabase.from('pairs').delete().eq('id', user.pair_id);
    }
  }
  return true;
}

module.exports = {
  supabase: supabase,
  createUser: createUser,
  getUserByTelegramId: getUserByTelegramId,
  getUserById: getUserById,
  updateUserPair: updateUserPair,
  createPair: createPair,
  getPairByCode: getPairByCode,
  getPairById: getPairById,
  getPairMembers: getPairMembers,
  completePair: completePair,
  storeMessage: storeMessage,
  getTodayMessages: getTodayMessages,
  getAllMessages: getAllMessages,
  storeChapter: storeChapter,
  getLatestChapters: getLatestChapters,
  logIncident: logIncident,
  deleteAllUserData: deleteAllUserData
};
