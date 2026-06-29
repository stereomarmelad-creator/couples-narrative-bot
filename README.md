# Couples Narrative Bot

Telegram bot that helps couples build their relationship narrative. Each day partners write messages, and every evening the bot generates a literary chapter of their love story using AI.

## Features

- **User Registration** via Telegram `/start`
- **Pair Creation** via invite codes (6-char alphanumeric)
- **Encrypted Message Storage** (AES-256-GCM, key derived per-user via PBKDF2)
- **Red Flag Classifier** — detects suicide, violence, severe depression, threats with immediate crisis help
- **Daily Chapter Generation** at 21:00 via OpenRouter LLM (free models)
- **RAG** using embeddings stored in Supabase pgvector
- **GDPR Right to be Forgotten** — `/delete` removes all data
- **Personal Questions** answered privately, never added to chapters

## Tech Stack

| Component | Service |
|-----------|---------|
| Runtime | Node.js 20+ on Render Free Tier |
| HTTP | Express 4 |
| Database | Supabase (PostgreSQL + pgvector, 500MB free) |
| LLM | OpenRouter (free models: gemma-2-27b-it, qwen-2.5-72b) |
| Embeddings | OpenRouter (gemini-embedding-001) |
| Scheduling | node-cron |
| Telegram | Bot API via node-fetch (no library) |

## Project Structure

```
couples-bot/
├── package.json
├── .env.example
├── README.md
├── supabase/
│   └── migrations/
│       └── 001_init.sql
└── src/
    ├── index.js      # Express server, webhook, cron
    ├── bot.js        # Telegram command/message handlers
    ├── db.js         # Supabase CRUD operations
    ├── crypto.js     # AES-256-GCM encrypt/decrypt
    ├── safety.js     # Red flag detection + crisis messages
    ├── chapter.js    # LLM calls via OpenRouter
    ├── rag.js        # Embedding storage + pgvector queries
    └── prompts.js    # System prompts (CHAPTER, PERSONAL, SAFETY)
```

## Setup

### 1. Prerequisites

- Node.js v20+
- Supabase project (free tier)
- OpenRouter account with API key
- Telegram Bot token from [@BotFather](https://t.me/BotFather)

### 2. Install Dependencies

```bash
cd couples-bot
npm install
```

### 3. Database Setup

1. Go to your Supabase project SQL Editor
2. Run the migration: `supabase/migrations/001_init.sql`
3. This creates all tables, pgvector extension, HNSW indexes, and the RAG matching function

### 4. Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
OPENROUTER_API_KEY=sk-or-...
ENCRYPTION_SECRET=your-random-32-char-secret
WEBHOOK_URL=https://your-app.onrender.com
```

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Get from @BotFather |
| `SUPABASE_URL` | Project URL from Supabase dashboard |
| `SUPABASE_SERVICE_KEY` | Service role key (not anon key!) |
| `OPENROUTER_API_KEY` | From openrouter.ai/keys |
| `ENCRYPTION_SECRET` | Random string, min 32 chars recommended |
| `WEBHOOK_URL` | Your public deploy URL |

### 5. Deploy

#### Render Free Tier (recommended)

1. Push to GitHub
2. Create new Web Service on Render
3. Connect your repo
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add all environment variables
7. Deploy

#### Deno Deploy

1. Push to GitHub
2. Create project on Deno Deploy
3. Set entrypoint: `src/index.js`
4. Add environment variables
5. Deploy

### 6. Set Webhook

The bot automatically sets its webhook on startup via the Telegram API. Ensure `WEBHOOK_URL` is set correctly.

## Architecture

```
User → Telegram → Webhook → Express → Bot Handler
                                    ↓
                              ┌─────┴─────┐
                              ↓           ↓
                         Safety Check   Encrypt (AES-256-GCM)
                              ↓           ↓
                         Crisis Msg    Store in Supabase
                                         ↓
                                    Generate Embedding
                                         21:00 Cron
                                         ↓
                                    RAG Query (pgvector)
                                         ↓
                                    LLM Chapter Generation
                                         ↓
                                    Send to Both Partners
```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Register / welcome |
| `/pair` | Create new pair (get invite code) |
| `/pair CODE` | Join existing pair |
| `/status` | View pair status |
| `/delete` | Delete all data (GDPR) |
| `/help` | Show help |

## Security

- All messages encrypted with AES-256-GCM before storage
- Encryption key derived per-user via PBKDF2 (100k iterations) from server secret + Telegram ID
- Personal answers marked with `is_personal=true` are never included in chapters
- Safety classifier runs on every message with regex + LLM fallback
- Service role key bypasses RLS (no RLS policies defined in MVP)

## Free Tier Limits

| Service | Limit |
|---------|-------|
| Supabase | 500MB storage, 2GB bandwidth |
| OpenRouter | Free model credits (varies) |
| Render | 750hrs/month, sleeps after 15min inactivity |

## License

MIT
