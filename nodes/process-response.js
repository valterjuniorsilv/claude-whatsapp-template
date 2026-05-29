/**
 * Process Response — Code Node (N8N)
 *
 * Takes Claude's response, applies safety nets, splits into chunks for
 * natural-feeling delivery, and prepares the Send Response node input.
 *
 * Inputs:
 *   - $input.first().json                       → Claude API response
 *   - $('Build Claude Payload').first().json    → contactMeta + skip flags
 *
 * Outputs:
 *   - { chunks: [...], contactMeta, audit }
 *
 * Safety nets applied:
 *   - Detect Claude API errors → fallback to "human will reply soon"
 *   - Strip role-play prefixes (e.g. "Assistant:")
 *   - Cap response length
 *   - Split long messages into 1-3 chunks for natural pacing
 */

const Redis = require('ioredis');
const redis = new Redis({ host: 'redis', port: 6379 });

const claudeResp = $input.first().json;
const built = $('Build Claude Payload').first().json;

// === Handle skip flags from build payload ===
if (built.skipClaude) {
  return [{
    json: {
      chunks: [built.cannedResponse || "Hi! I'll get back to you shortly."],
      contactMeta: built.contactMeta,
      audit: { skipped: true, reason: built.reason },
    }
  }];
}

// === Healthcheck: detect Claude API failure ===
if (claudeResp.error || !claudeResp.content) {
  const fallback = "Sorry, I'm having a technical issue. A human will reply within a few minutes.";
  // Log to Redis so a human can be notified
  await redis.lpush('bot:human_handoff', JSON.stringify({
    phone: built.contactMeta.phone,
    reason: 'claude_error',
    error: claudeResp.error || 'no content',
    at: new Date().toISOString(),
  }));
  return [{
    json: {
      chunks: [fallback],
      contactMeta: built.contactMeta,
      audit: { fallback: true, error: claudeResp.error },
    }
  }];
}

// === Extract text from Claude response ===
let text = '';
for (const block of claudeResp.content) {
  if (block.type === 'text') text += block.text;
}

// === Sanitize ===
text = text
  .replace(/^(Assistant|AI|Bot):\s*/i, '')   // strip role-play prefix
  .replace(/<\/?[a-z]+>/gi, '')              // strip stray HTML tags
  .trim();

// Hard cap
if (text.length > 4000) {
  text = text.slice(0, 4000) + '…';
}

// === Split into chunks for natural delivery ===
// Strategy: split on double newline first, fall back to single newline, then cap at 600 chars.
function splitMessage(input) {
  if (input.length <= 600) return [input];

  let parts = input.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  if (parts.length === 1) {
    parts = input.split(/\n/).filter(p => p.trim().length > 0);
  }

  // Merge tiny adjacent parts
  const merged = [];
  for (const p of parts) {
    if (merged.length && (merged[merged.length - 1].length + p.length + 1) < 400) {
      merged[merged.length - 1] += '\n' + p;
    } else {
      merged.push(p);
    }
  }
  // Cap at 3 chunks max
  if (merged.length > 3) {
    return [merged.slice(0, 2).join('\n\n'), merged.slice(2).join('\n\n')];
  }
  return merged;
}

const chunks = splitMessage(text);

return [{
  json: {
    chunks,
    contactMeta: built.contactMeta,
    audit: {
      modelUsed: claudeResp.model,
      inputTokens: claudeResp.usage?.input_tokens,
      outputTokens: claudeResp.usage?.output_tokens,
      cacheHit: (claudeResp.usage?.cache_read_input_tokens || 0) > 0,
    },
  }
}];
