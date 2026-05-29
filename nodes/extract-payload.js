const https = require('https');

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

const body = $input.first().json.body;
const data = body.data || {};
const key = data.key || {};
const msg = data.message || {};

const remoteJid = key.remoteJid || '';
const fromMe = key.fromMe || false;
const isGroup = remoteJid.includes('@g.us');
const pushName = data.pushName || 'Lead';
const instanceName = body.instance || '';

// Detectar áudio
const audioMessage = msg.audioMessage || null;
const isAudio = !!audioMessage;
const messageId = key.id || '';

// Texto (vai ser sobrescrito pela transcrição se for áudio)
let message = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || '';

// === SOURCE TRACKING ===
// Detecta códigos [OLY-*] no texto e remove pra Bot não ver
let detectedSource = null;
if (message) {
  // 1) Código explícito [OLY-*]
  const sourceMatch = message.match(/\[OLY-([A-Z0-9-]+)\]/i);
  if (sourceMatch) {
    detectedSource = 'OLY-' + sourceMatch[1].toUpperCase();
    message = message.replace(/\s*\[OLY-[A-Z0-9-]+\]\s*/gi, ' ').trim();
  } else {
    // 2) Inferência por keywords no texto livre
    const lower = message.toLowerCase();
    if (/\b(anuncio|anúncio|propaganda)\b.*\b(insta|instagram|ig)\b|\b(insta|instagram|ig)\b.*\b(anuncio|anúncio|propaganda)\b/.test(lower)) detectedSource = 'OLY-ADS-IG';
    else if (/\b(anuncio|anúncio|propaganda)\b.*\b(face|facebook|fb)\b|\b(face|facebook|fb)\b.*\b(anuncio|anúncio|propaganda)\b/.test(lower)) detectedSource = 'OLY-ADS-FB';
    else if (/\b(anuncio|anúncio).*google|google.*(anuncio|anúncio)/.test(lower)) detectedSource = 'OLY-ADS-GG';
    else if (/google meu neg|gmb|maps/.test(lower)) detectedSource = 'OLY-GMN';
    else if (/\b(insta|instagram|ig)\b/.test(lower)) detectedSource = 'OLY-BIO-IG';
    else if (/\b(tik\s*tok|tiktok)\b/.test(lower)) detectedSource = 'OLY-BIO-TT';
    else if (/\b(youtube|yt)\b/.test(lower)) detectedSource = 'OLY-YT';
    else if (/\b(facebook|fb)\b/.test(lower)) detectedSource = 'OLY-BIO-FB';
    else if (/\b(site|agencyclinic|nodushub)\b/.test(lower)) detectedSource = 'OLY-LP';
  }
}

let phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');

if (remoteJid.includes('@lid')) {
  // sender no payload Evolution é o NÚMERO DA PRÓPRIA INSTÂNCIA, não o remetente.
  // Quando remoteJid é @lid (encrypted), só dá pra resolver via findContacts por pushName.
  try {
      const EVO_HOST = 'evolution.nodushub.com.br';
      const EVO_KEY = 'd463f8dbb9d86fb84c20e35ac882ffea';
      const INSTANCE = 'bot-agency';
      const HEADERS = { 'apikey': EVO_KEY, 'Content-Type': 'application/json' };
      const contactsRes = await httpsPost(EVO_HOST, `/chat/findContacts/${INSTANCE}`, HEADERS, { where: {} });
      if (Array.isArray(contactsRes.body)) {
        let match = contactsRes.body.find(c => c.remoteJid && c.remoteJid.includes('@s.whatsapp.net') && c.pushName === pushName);
        if (!match && pushName) {
          const firstWord = pushName.toLowerCase().split(' ')[0];
          match = contactsRes.body.find(c => c.remoteJid && c.remoteJid.includes('@s.whatsapp.net') && (c.pushName || '').toLowerCase().startsWith(firstWord));
        }
        if (match) phone = match.remoteJid.replace('@s.whatsapp.net', '');
      }
  } catch(e) {}
  if (phone.includes('@lid')) phone = phone.replace('@lid', '');
}

return [{ json: {
  phone, message, fromMe, isGroup, pushName, instanceName, remoteJidRaw: remoteJid,
  isAudio, messageId, detectedSource,
  audioBase64: null  // preenchido pelo node Baixar Áudio se isAudio
} }];
