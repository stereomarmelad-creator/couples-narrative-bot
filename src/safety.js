var CRISIS_HOTLINES = {
  RU: [
    { name: 'Телефон доверия (бесплатно, круглосуточно)', phone: '8-800-2000-122' },
    { name: 'Психологическая помощь', phone: '051 (с мобильного: 8-495-051)' },
    { name: 'Центр экстренной психологической помощи МЧС', phone: '8-499-216-50-50' }
  ],
  EN: [
    { name: '988 Suicide & Crisis Lifeline (US)', phone: '988' },
    { name: 'Crisis Text Line (US)', phone: 'Text HOME to 741741' },
    { name: 'Samaritans (UK)', phone: '116 123' },
    { name: 'Lifeline (Australia)', phone: '13 11 14' }
  ],
  UA: [
    { name: 'Телефон доверії (безкоштовно)', phone: '0 800 500 335' },
    { name: 'Лінія національної гарячої лінії', phone: '116 123' }
  ]
};

var CRISIS_MESSAGES = {
  SUICIDE: {
    RU: 'Мне очень жаль, что ты сейчас так тяжело. Пожалуйста, знай: ты не один/одна, и есть люди, которые помогут.\n\nЕсли ты в опасности — немедленно позвони по одному из номеров ниже:\n',
    EN: 'I\'m really sorry you\'re going through this. Please know: you are not alone, and there are people who can help right now.\n\nIf you are in immediate danger, please call one of these numbers:\n'
  },
  VIOLENCE: {
    RU: 'Твоя безопасность — самое важное. Если тебе угрожает опасность, пожалуйста, обратись за помощью:\n',
    EN: 'Your safety is the most important thing. If you are in danger, please reach out for help:\n'
  },
  SEVERE_DEPRESSION: {
    RU: 'Я вижу, что тебе сейчас очень тяжело. Это важно — получить поддержку от специалиста. Пожалуйста, рассмотри возможность поговорить с профессионалом:\n',
    EN: 'I can see you\'re going through a very difficult time. It\'s important to get support. Please consider reaching out to a professional:\n'
  },
  THREAT: {
    RU: 'Если ты или кто-то другой в опасности, пожалуйста, обратись за помощью немедленно:\n',
    EN: 'If you or someone else is in danger, please get help immediately:\n'
  }
};

var PATTERNS = {
  SUICIDE: [
    /(хочу\s+)?(уйти\s+из\s+жизни|покончить\s+с\s+собой|убить\s+себя|самоубийство|суицид|не\s+хочу\s+жить|незачем\s+жить|вскрыть\s+вены|прыгнуть\s+с\s+моста|повеситься)/i,
    /(i\s+)?(want\s+to\s+(die|kill\s+myself|end\s+it)|suicide|self.?harm|no\s+reason\s+to\s+live|not\s+worth\s+living)/i
  ],
  VIOLENCE: [
    /(ударить|побить|избить|задушить|нож|пистолет|убить\s+тебя|убить\s+его|убить\s+её)/i,
    /(kill\s+(you|him|her|them)|stab|shoot|beat\s+(you|him|her)|strangle|murder)/i
  ],
  SEVERE_DEPRESSION: [
    /(ничего\s+не\s+имеет\s+смысла|не\s+вижу\s+смысла|безнадёжность|безысходность|тоска|не\s+могу\s+больше|всё\s+бесит|полная\s+апатия|нет\s+сил)/i,
    /(no\s+point|hopeless|worthless|numb|can\'t\s+go\s+on|everything\s+is\s+meaningless|empty\s+inside|given\s+up)/i
  ],
  THREAT: [
    /(я\s+тебя\s+найду|ты\s+пожалеешь|заплачешь|за\s+это\s+ответишь|не\s+уйдёшь)/i,
    /(i\'ll\s+find\s+you|you\'ll\s+regret|you\'ll\s+pay|i\'ll\s+make\s+you|watch\s+your\s+back)/i
  ]
};

function detectLocalPatterns(text) {
  var results = [];
  var categories = Object.keys(PATTERNS);
  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i];
    var patternList = PATTERNS[cat];
    for (var j = 0; j < patternList.length; j++) {
      if (patternList[j].test(text)) {
        results.push({ category: cat, confidence: 0.85, reason: 'pattern_match' });
        break;
      }
    }
  }
  return results.length > 0 ? results[0] : { category: 'SAFE', confidence: 0.9, reason: 'no_patterns' };
}

function getCrisisMessage(category, lang) {
  lang = lang || 'RU';
  var msg = CRISIS_MESSAGES[category];
  if (!msg) return null;
  var text = msg[lang] || msg.EN;
  var hotlines = CRISIS_HOTLINES[lang] || CRISIS_HOTLINES.EN;
  var lines = hotlines.map(function (h) {
    return '📞 ' + h.name + ': ' + h.phone;
  });
  return text + '\n' + lines.join('\n') + '\n\n💙 Помни: просить о помощи — это проявление силы, а не слабости.';
}

function detectLanguage(text) {
  var cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  var total = text.length || 1;
  return (cyrillicCount / total) > 0.3 ? 'RU' : 'EN';
}

async function checkSafety(text, useLLM) {
  var localResult = detectLocalPatterns(text);
  if (localResult.category !== 'SAFE' && localResult.confidence >= 0.85) {
    return localResult;
  }
  if (useLLM) {
    try {
      var llmResult = await llm.classifySafety(text);
      if (llmResult.category && llmResult.category !== 'SAFE') {
        return llmResult;
      }
    } catch (e) {
      console.error('LLM safety check failed:', e.message);
    }
  }
  return localResult;
}

module.exports = {
  checkSafety: checkSafety,
  detectLanguage: detectLanguage,
  getCrisisMessage: getCrisisMessage,
  detectLocalPatterns: detectLocalPatterns,
  CRISIS_HOTLINES: CRISIS_HOTLINES
};
