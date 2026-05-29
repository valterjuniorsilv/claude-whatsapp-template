# Setup Guide

## Prerequisites

- **N8N** instance (self-hosted or cloud) — https://n8n.io
- **Evolution API** running — https://github.com/EvolutionAPI/evolution-api
- **Redis** (used for message debouncing across queue) — `redis:7-alpine` in Docker is fine
- **PostgreSQL** (for protected contacts table + message audit) — Supabase or any Postgres 14+
- **Anthropic API key** — https://console.anthropic.com

## Architecture

```
┌──────────────┐    webhook    ┌─────────────────────┐
│ WhatsApp ────┼──────────────►│ Evolution API       │
└──────────────┘               └──────────┬──────────┘
                                          │ POST event
                                          ▼
                            ┌──────────────────────────┐
                            │ N8N: Webhook Trigger     │
                            └────────────┬─────────────┘
                                         ▼
                            ┌──────────────────────────┐
                            │ 1. extract-payload.js    │  ← normalize Evo payload
                            └────────────┬─────────────┘
                                         ▼
                            ┌──────────────────────────┐
                            │ 2. debounce.js           │  ← wait 8s for follow-up msgs
                            └────────────┬─────────────┘  ← merge multiple into one
                                         ▼
                            ┌──────────────────────────┐
                            │ 3. build-claude-payload  │  ← assemble Anthropic call
                            └────────────┬─────────────┘     with prompt caching
                                         ▼
                            ┌──────────────────────────┐
                            │ 4. HTTP Request → Claude │
                            └────────────┬─────────────┘
                                         ▼
                            ┌──────────────────────────┐
                            │ 5. process-response.js   │  ← sanitize, split chunks,
                            └────────────┬─────────────┘     handle errors/fallback
                                         ▼
                            ┌──────────────────────────┐
                            │ 6. send-response.js      │  ← typing indicator,
                            └──────────────────────────┘     spacing between chunks
```

## Step-by-step

### 1. Database

Run migrations in order:

```bash
psql $DATABASE_URL -f migrations/001_protected_contacts.sql
psql $DATABASE_URL -f migrations/002_enable_rls.sql
psql $DATABASE_URL -f migrations/003_message_audit.sql
```

What each does:
- **001**: table for "protected contacts" — phones the bot must NOT respond to (your personal contacts that might trigger ads)
- **002**: enable Row-Level Security so only authenticated services can read/write
- **003**: audit table for every inbound/outbound message (debugging, compliance)

### 2. Redis

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Or use your existing Redis. The debounce node uses keys like `debounce:<phone>` with 8s TTL.

### 3. Evolution API

Follow [Evolution API docs](https://doc.evolution-api.com) to spin up an instance.

Configure webhook to your N8N webhook URL:

```bash
curl -X POST $EVOLUTION_API_URL/webhook/set/$INSTANCE \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://your-n8n.com/webhook/whatsapp-inbound",
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

### 4. N8N

Import `workflows/whatsapp-claude.example.json` into N8N.

For each Code Node, replace the placeholder content with the corresponding file from `nodes/`:

| N8N Node Name | File |
|---|---|
| Extract Payload | `nodes/extract-payload.js` |
| Debounce | `nodes/debounce.js` |
| Build Claude Payload | `nodes/build-claude-payload.js` |
| Process Response | `nodes/process-response.js` |
| Send Response | `nodes/send-response.js` |

Set N8N credentials:
- HTTP Request node calling Claude: use `Authentication: None` (we set headers manually in Build Claude Payload)
- HTTP Request node calling Evolution: same approach

### 5. Environment variables

In N8N Settings → Variables, add everything from `.env.example`.

### 6. System prompt

Edit `prompts/system-prompt.example.md` for your use case. Then either:

- **Option A (simple)**: paste the prompt directly into `build-claude-payload.js` (replace the placeholder)
- **Option B (better)**: store the prompt in a database or env var, load dynamically

### 7. Smoke test

Send a WhatsApp message to your configured number. You should see:

1. Evolution API fires webhook
2. N8N executes the workflow
3. Within ~10s (8s debounce + 1-2s Claude), you get a response

If something fails, check:
- N8N execution log
- Redis keys (`redis-cli KEYS 'debounce:*'`)
- Evolution API webhook delivery status

## Common issues

### Bot replies to my personal contacts

Add their phones to `bot_protected_contacts`:

```sql
INSERT INTO bot_protected_contacts (phone, name, reason)
VALUES ('5544900000000', 'My Mom', 'personal contact')
ON CONFLICT (phone) DO NOTHING;
```

### Bot replies to messages from itself (echo loop)

Make sure `extract-payload.js` filters `fromMe: true`. The template does this by default.

### Debounce never triggers

Check Redis connectivity from N8N. The Redis node should be able to `PING`.

### Claude calls cost too much

- Confirm prompt caching is working (`cache_read_input_tokens > 0` in audit)
- Use `claude-haiku-4-5-20251001` for routine messages
- Reserve `claude-sonnet-4-6` for complex reasoning

## Production hardening

Things this template DOESN'T do (you'll add them):

- Rate limiting per phone
- Fallback to human after N back-and-forths without resolution
- Tool use (function calling) for actions like "book a slot"
- Multi-tenant isolation if you run for multiple clients
- LGPD/GDPR data retention policy

See [docs/HARDENING.md](./HARDENING.md) for guidance on each.
