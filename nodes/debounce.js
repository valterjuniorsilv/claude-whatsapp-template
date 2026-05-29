const Redis = require('ioredis');
const redis = new Redis({ host: 'redis', port: 6379 });

const inp = $input.first().json;
const { phone, message, pushName, fromMe, isGroup, instanceName, remoteJidRaw, detectedSource, transcribed } = inp;

// Persistir source na primeira detecção (não sobrescreve se já existe)
if (detectedSource) {
  const SOURCE_KEY = `bot-clinic:source:${phone}`;
  const existing = await (new Redis({ host: 'redis', port: 6379 })).get(SOURCE_KEY).catch(()=>null);
  if (!existing) {
    const r2 = new Redis({ host: 'redis', port: 6379 });
    await r2.set(SOURCE_KEY, detectedSource, 'EX', 60 * 60 * 24 * 30); // 30 dias
    await r2.incr(`bot-clinic:metrics:source:${detectedSource}`);
    await r2.quit();
  }
}

const QUEUE_KEY    = `bot-clinic:queue:${phone}`;
const ACTIVITY_KEY = `bot-clinic:lastmsg:${phone}`;
const LOCK_KEY     = `bot-clinic:debounce:${phone}`;
const RATE_KEY     = `bot-clinic:rate:${phone}`;

// Anti-spam: máximo 30 mensagens por hora por phone
const rateCount = await redis.incr(RATE_KEY);
if (rateCount === 1) await redis.expire(RATE_KEY, 3600);
if (rateCount > 30) {
  await redis.quit();
  console.log(`[anti-spam] ${phone} bloqueado: ${rateCount} msgs em 1h`);
  return [];
}

// Sempre empilha mensagem e marca última atividade
await redis.rpush(QUEUE_KEY, message);
await redis.expire(QUEUE_KEY, 60);
await redis.set(ACTIVITY_KEY, Date.now().toString(), 'EX', 60);

// Lock atômico: só uma execução vira "processadora"
const gotLock = await redis.set(LOCK_KEY, '1', 'EX', 30, 'NX');
if (!gotLock) {
  await redis.quit();
  return [];
}

// Debounce DESLIZANTE: dorme 5s, checa se houve atividade nova, se sim dorme +5s
const SLIDE_MS = 9000;
const MAX_TOTAL_WAIT_MS = 35000; // teto: nunca espera mais que 40s
const startedAt = Date.now();

while (true) {
  await new Promise(r => setTimeout(r, SLIDE_MS));
  const lastActivity = parseInt(await redis.get(ACTIVITY_KEY) || '0', 10);
  const sinceLast = Date.now() - lastActivity;
  const totalElapsed = Date.now() - startedAt;
  if (sinceLast >= SLIDE_MS) break;          // 5s sem msg nova → processa
  if (totalElapsed >= MAX_TOTAL_WAIT_MS) break; // teto de segurança
}

const messages = await redis.lrange(QUEUE_KEY, 0, -1);
await redis.del(QUEUE_KEY);
await redis.del(LOCK_KEY);
await redis.del(ACTIVITY_KEY);
await redis.quit();

// join com \n preserva separação visual pro Claude entender que eram msgs picadas
const combined = messages.join('\n');
return [{ json: { phone, message: combined, pushName, fromMe, isGroup, instanceName, remoteJidRaw, transcribed: transcribed || false } }];
