const https = require('https');
const Redis = require('ioredis');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const opts = { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) } };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

const pr = $('Processar Resposta').first().json;
let phone = pr.phone;
const fragments = pr.fragments || [pr.reply];
const INSTANCE  = 'bot-agency';
const EVO_KEY   = 'd463f8dbb9d86fb84c20e35ac882ffea';
const EVO_HOST  = 'evolution.nodushub.com.br';
const HEADERS   = { 'apikey': EVO_KEY, 'Content-Type': 'application/json' };

// Resolver @lid
if (phone && phone.includes('@lid')) {
  try {
    const contactsRes = await httpsPost(EVO_HOST, `/chat/findContacts/${INSTANCE}`, HEADERS, { where: {} });
    if (Array.isArray(contactsRes.body)) {
      const pn = pr.pushName || '';
      let match = contactsRes.body.find(c => c.remoteJid?.includes('@s.whatsapp.net') && c.pushName === pn);
      if (!match && pn) {
        const fw = pn.toLowerCase().split(' ')[0];
        match = contactsRes.body.find(c => c.remoteJid?.includes('@s.whatsapp.net') && (c.pushName||'').toLowerCase().startsWith(fw));
      }
      if (match) phone = match.remoteJid.replace('@s.whatsapp.net', '');
    }
  } catch(e) {}
}
phone = phone.replace('@s.whatsapp.net', '').replace('@lid', '');

// Delay inicial — simula tempo de leitura da msg do lead
// 1.5-2.5s antes de começar a digitar
await sleep(1500 + Math.random() * 1000);

// Pausa por bloco semântico: a cada 3 fragmentos, "respira" mais (4-6s) tipo
// humano que mandou um pensamento e parou pra pensar no próximo.
// Dentro do bloco: 1-2s. Antes de pergunta: 1.4-2.1s.
function gapAfter(idx, total, currentFrag, nextFrag) {
  if (idx >= total - 1) return 0;
  const isPergunta = /\?/.test(nextFrag || '');
  const endsWithDot = /[.!]$/.test((currentFrag || '').trim());
  // Quebra de bloco: a cada 3 fragmentos OU quando próximo começa nova ideia
  // (ex: "Funciona assim." → próximo começa explicação)
  const isBlockBreak = (idx + 1) % 3 === 0 && idx + 1 < total - 1;
  if (isBlockBreak) return 4000 + Math.random() * 2000; // 4-6s
  if (isPergunta) return 1400 + Math.random() * 700;     // 1.4-2.1s
  if (endsWithDot) return 1100 + Math.random() * 600;    // 1.1-1.7s
  return 800 + Math.random() * 500;                       // 0.8-1.3s (continuação)
}

for (let i = 0; i < fragments.length; i++) {
  const frag = fragments[i];
  // Typing: 60ms/char com mín 1.8s e máx 5s (humano não digita instantaneamente)
  const typingMs = Math.min(Math.max(frag.length * 60, 1800), 5000);
  // Mostra "digitando..." durante todo o typing
  try {
    await httpsPost(EVO_HOST, `/chat/sendPresence/${INSTANCE}`, HEADERS, {
      number: phone, presence: 'composing', delay: typingMs
    });
  } catch(e) {}
  await sleep(typingMs);
  await httpsPost(EVO_HOST, `/message/sendText/${INSTANCE}`, HEADERS, { number: phone, text: frag });
  const gap = gapAfter(i, fragments.length, frag, fragments[i+1]);
  if (gap > 0) {
    // Em pausa de bloco (>2.5s), mostra "online sem digitar" pra simular pensamento
    if (gap > 2500) {
      try {
        await httpsPost(EVO_HOST, `/chat/sendPresence/${INSTANCE}`, HEADERS, {
          number: phone, presence: 'paused', delay: 0
        });
      } catch(e) {}
    }
    await sleep(gap);
  }
}

// Salvar log no Redis
const redis = new Redis({ host: 'redis', port: 6379, lazyConnect: true });
try {
  await redis.connect();
  const logEntry = JSON.stringify({
    phone, pushName: pr.pushName, nicho: pr.nicho,
    turns: pr.turnCount, handoff: pr.handoff,
    objections: pr.detectedObjections,
    lastReply: fragments.join(' | '),
    ts: new Date().toISOString()
  });
  await redis.lpush('bot-clinic:conv_logs', logEntry);
  await redis.ltrim('bot-clinic:conv_logs', 0, 199);

  // Se handoff, salvar em lista separada para análise de sucesso
  if (pr.handoff) {
    const histData = JSON.parse($('Processar Resposta').first().json.historyJson || '[]');
    await redis.lpush('bot-clinic:success_convs', JSON.stringify({
      phone, pushName: pr.pushName, nicho: pr.nicho,
      scheduleDay: pr.scheduleDay,
      history: histData, ts: new Date().toISOString()
    }));
    await redis.ltrim('bot-clinic:success_convs', 0, 49);
  }

  // Salvar objeções não quebradas (se detectou objeção mas foi handoff mesmo assim = foi quebrada)
  if (pr.detectedObjections && pr.detectedObjections.length > 0 && !pr.handoff) {
    for (const obj of pr.detectedObjections) {
      await redis.lpush(`bot-clinic:objection:${obj}`, JSON.stringify({
        phone, objection: pr.nicho ? `${obj} (${pr.nicho})` : obj,
        context: fragments.join(' | '), ts: new Date().toISOString()
      }));
      await redis.ltrim(`bot-clinic:objection:${obj}`, 0, 29);
    }
  }
} catch(e) {} finally { redis.disconnect(); }

return [{ json: { success: true, phone, fragments, handoff: pr.handoff } }];