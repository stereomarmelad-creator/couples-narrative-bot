var llm = require('./chapter');

var DIMENSION = 1536; // gemini-embedding-001 dimension

async function storeMessageEmbedding(supabase, messageId, text, pairId) {
  try {
    var embedding = await llm.createEmbedding(text);
    var { error } = await supabase.from('message_embeddings').insert({
      message_id: messageId,
      pair_id: pairId,
      embedding: embedding,
      content_preview: text.substring(0, 200)
    });
    if (error) console.error('Embedding store error:', error.message);
  } catch (err) {
    console.error('Embedding generation failed:', err.message);
  }
}

async function queryRelevantContext(supabase, pairId, queryText, limit) {
  limit = limit || 5;
  try {
    var queryEmbedding = await llm.createEmbedding(queryText);
    var embeddingStr = '[' + queryEmbedding.join(',') + ']';
    var { data, error } = await supabase.rpc('match_messages', {
      query_embedding: embeddingStr,
      match_pair_id: pairId,
      match_limit: limit
    });
    if (error) {
      console.error('RAG query error:', error.message);
      return '';
    }
    if (!data || data.length === 0) return '';
    var context = data.map(function (item) {
      return item.content_preview || '';
    }).join('\n---\n');
    return context;
  } catch (err) {
    console.error('RAG query failed:', err.message);
    return '';
  }
}

async function storeChapterEmbedding(supabase, chapterId, text, pairId) {
  try {
    var embedding = await llm.createEmbedding(text);
    var { error } = await supabase.from('chapter_embeddings').insert({
      chapter_id: chapterId,
      pair_id: pairId,
      embedding: embedding
    });
    if (error) console.error('Chapter embedding store error:', error.message);
  } catch (err) {
    console.error('Chapter embedding generation failed:', err.message);
  }
}

module.exports = {
  storeMessageEmbedding: storeMessageEmbedding,
  queryRelevantContext: queryRelevantContext,
  storeChapterEmbedding: storeChapterEmbedding,
  DIMENSION: DIMENSION
};
