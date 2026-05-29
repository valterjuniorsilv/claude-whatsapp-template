/**
 * Build Claude Payload — Code Node (N8N)
 *
 * Takes the debounced message + extracted contact data and assembles the
 * Anthropic Messages API payload (with prompt caching).
 *
 * Inputs (from previous nodes):
 *   - $('Extract Payload').first().json   → { phone, pushName, instanceName, isProtected }
 *   - $('Debounce').first().json          → { combinedMessage, history }
 *
 * Outputs:
 *   - { url, headers, body }  → fed into HTTP Request node calling api.anthropic.com
 *
 * Required env vars (set in N8N credentials):
 *   - ANTHROPIC_API_KEY
 */

const extracted = $('Extract Payload').first().json;
const debounced = $('Debounce').first().json;

const { phone, pushName, instanceName, isProtected } = extracted;
const { combinedMessage, history = [] } = debounced;

// === Guardrails ===
if (isProtected) {
  // Protected contacts (admin's personal contacts) — skip Claude, send canned response
  return [{
    json: {
      skipClaude: true,
      reason: 'protected_contact',
      cannedResponse: `Hi ${pushName}, this is an automated assistant. The admin will reply personally.`,
    }
  }];
}

if (!combinedMessage || combinedMessage.length === 0) {
  return [{ json: { skipClaude: true, reason: 'empty_message' } }];
}

// === System prompt ===
// Loaded from prompts/system-prompt.md (you maintain this file separately).
// For this template, we inline a placeholder. In production, load via fs or env.
const SYSTEM_PROMPT = `You are a friendly customer service assistant for [COMPANY_NAME].

Your job:
- Answer questions about [PRODUCT/SERVICE]
- Qualify the lead (ask about [QUALIFICATION_FIELDS])
- Schedule a call if the lead is qualified

Tone: warm, professional, never pushy.

Hard rules:
- Never claim to be human
- Never share competitor information
- If you don't know something, say so and offer to connect them with a human`;

// === Conversation history (Claude format) ===
const messages = [
  ...history.map(h => ({
    role: h.fromMe ? 'assistant' : 'user',
    content: h.text,
  })),
  {
    role: 'user',
    content: combinedMessage,
  },
];

// === Payload with prompt caching ===
// System prompt is cached (5min TTL). Saves ~90% on input tokens after first call.
const payload = {
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages,
  metadata: {
    user_id: phone,
  },
};

return [{
  json: {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': $env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: payload,
    contactMeta: { phone, pushName, instanceName },
  }
}];
