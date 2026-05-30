# Claude WhatsApp Template

[![CI](https://github.com/valterjuniorsilv/claude-whatsapp-template/actions/workflows/validate.yml/badge.svg)](https://github.com/valterjuniorsilv/claude-whatsapp-template/actions) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Release](https://img.shields.io/github/v/release/valterjuniorsilv/claude-whatsapp-template)](https://github.com/valterjuniorsilv/claude-whatsapp-template/releases)

> Production-tested boilerplate for building a WhatsApp customer service bot powered by **Claude (Anthropic) + N8N + Evolution API**. Battle-tested in production at [NodusHub](https://nodushub.com.br) serving dental clinics in Brazil.

This is NOT a hello-world. It's the architectural pattern with all the production guardrails that took 3 months of bugs to figure out — message debouncing, protected contacts, error fallback, prompt caching, chunk-by-chunk delivery.

---

## What's in here

```
.
├── nodes/                    ← Code Nodes (paste into N8N)
│   ├── extract-payload.js    ← Normalize Evolution webhook
│   ├── debounce.js           ← Wait 8s, merge follow-up msgs
│   ├── build-claude-payload  ← Assemble Anthropic call w/ caching
│   ├── process-response.js   ← Sanitize, split chunks, fallback
│   └── send-response.js      ← Send to Evolution with typing
├── workflows/
│   └── whatsapp-claude.example.json  ← N8N workflow JSON
├── migrations/
│   ├── 001_protected_contacts.sql    ← Phones the bot must skip
│   ├── 002_enable_rls.sql            ← Postgres Row-Level Security
│   └── 003_message_audit.sql         ← Audit table for compliance
├── prompts/
│   └── system-prompt.example.md      ← Annotated system prompt
├── docs/
│   ├── SETUP.md                      ← Step-by-step install guide
│   └── HARDENING.md                  ← Production hardening checklist
└── .env.example
```

---

## Why these pieces exist

Most "WhatsApp + Claude" tutorials show a 30-line script that responds to one message. Reality:

| Production problem | What handles it |
|---|---|
| User sends 3 messages in a row before bot replies | `debounce.js` waits 8s, merges into one Claude call |
| Bot starts answering YOUR personal contacts via cross-routing | `protected_contacts` table |
| Bot hallucinates and confuses contexts | `prompt caching` with stable system prompt |
| Claude API has outage | `process-response.js` has healthcheck → fallback "human will reply" + Redis queue for handoff |
| Long Claude responses look robotic when sent as one block | `process-response.js` splits into 1-3 chunks |
| Bot replies to itself (echo loop) | `extract-payload.js` filters `fromMe: true` |
| Compliance / audit needs message history | `message_audit` table logs every in/out message |

Each of these caused real production incidents. Each is a node/migration in this template.

---

## Stack

| Layer | Tech |
|---|---|
| Orchestration | [N8N](https://n8n.io) (self-hosted or cloud) |
| LLM | [Claude](https://anthropic.com) — Haiku 4.5 for routine, Sonnet 4.6 for complex |
| WhatsApp gateway | [Evolution API](https://github.com/EvolutionAPI/evolution-api) |
| Queue / debounce | Redis |
| State | PostgreSQL (Supabase works fine) |

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/valterjuniorsilv/claude-whatsapp-template.git
cd claude-whatsapp-template

# 2. Set up infra
docker run -d --name redis -p 6379:6379 redis:7-alpine
psql $DATABASE_URL -f migrations/001_protected_contacts.sql
psql $DATABASE_URL -f migrations/002_enable_rls.sql
psql $DATABASE_URL -f migrations/003_message_audit.sql

# 3. Import workflow into N8N
# (UI: Workflows → Import from File → workflows/whatsapp-claude.example.json)

# 4. Paste each nodes/*.js into the corresponding Code Node

# 5. Set credentials & env vars (see .env.example)

# 6. Point Evolution webhook at your N8N URL
```

Full guide: [docs/SETUP.md](./docs/SETUP.md).

---

## Cost optimization (prompt caching)

The `build-claude-payload.js` node uses [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) on the system prompt.

After the first call within 5 minutes:
- **Cached input tokens cost ~10% of regular input tokens**
- A 2000-token system prompt that costs $0.0006 normally becomes $0.00006

For a bot doing 500 conversations/day with 2k-token system prompt:
- Without caching: ~$15/month input cost
- With caching: ~$1.50/month input cost

Confirm caching is working by checking `cache_read_input_tokens > 0` in the audit log.

---

## What this template does NOT do

Honest list of things you'll need to add for production:

- **Tool use / function calling** — booking slots, looking up CRM data, etc.
- **Multi-tenant isolation** — if you run this for multiple clients on shared infra
- **Rate limiting per phone** — currently relies on Evolution + N8N native rate limits
- **A/B testing of prompts** — you'll roll your own
- **Conversation handoff to human** — there's a Redis queue placeholder but no UI
- **LGPD / GDPR data retention** — you'll set up auto-purge policies

See [docs/HARDENING.md](./docs/HARDENING.md) for guidance on each.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Author

**Valter Silva** · Founder [NodusHub](https://nodushub.com.br) · Maringá, PR · 🇧🇷

Companion repos:

- [claude-skills](https://github.com/valterjuniorsilv/claude-skills) — Claude Code skills used during development
- [agency-as-agents](https://github.com/valterjuniorsilv/agency-as-agents) — agency-style multi-agent setup
- [antigravity-lab](https://github.com/valterjuniorsilv/antigravity-lab) — Go backend reference (Clean Arch + DDD + CQRS)

> "Na area, não nas arquibancadas."
