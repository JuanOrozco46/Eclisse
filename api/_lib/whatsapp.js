const { logBotEvent } = require('./orders');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function humanDelay(text = '') {
  return Math.min(1100 + (text.length / 12) * 1000 + Math.random() * 700, 4500);
}

async function sendWhatsAppMessage(env, jid, text) {
  try {
    await sleep(humanDelay(text));
    await fetch(`${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': env.EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, text }),
    });
  } catch (e) {
    console.error('sendText error:', e.message);
  }
}

async function sendWhatsAppImage(env, jid, imageUrl, caption) {
  try {
    await sleep(humanDelay(caption || ''));
    await fetch(`${env.EVOLUTION_API_URL}/message/sendMedia/${env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': env.EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, mediatype: 'image', media: imageUrl, caption: caption || '' }),
    });
  } catch (e) {
    console.error('sendMedia error:', e.message);
  }
}

async function sendAdminAlert(env, { phone, pushName, messageId, reason, messageText, details }) {
  await logBotEvent(phone, messageId, 'ERROR', null, { reason, messageText, ...details });

  const adminPhone = env.ADMIN_WHATSAPP_PHONE;
  if (!adminPhone) return;

  const alertText =
    `🚨 *ALERTA BOT ECLISSE*\n\n` +
    `👤 *Cliente:* ${pushName || 'Sin nombre'} (${phone})\n` +
    `⚠️ *Fallo:* ${reason}\n` +
    (messageText ? `💬 *Mensaje:* "${messageText.slice(0, 200)}"\n` : '') +
    `\nPor favor revisá el chat de WhatsApp o el monitor de cocina.`;

  try {
    await fetch(`${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': env.EVOLUTION_API_KEY },
      body: JSON.stringify({ number: adminPhone, text: alertText }),
    });
  } catch (e) {
    console.error('sendAdminAlert error:', e.message);
  }
}

// ─── Descarga de media completo desde Evolution API v2 ────────
async function fetchFullReceiptMedia(env, webhookData) {
  const imgMsg = webhookData?.message?.imageMessage;
  if (!imgMsg) return null;

  const mimeType = imgMsg.mimetype || 'image/jpeg';

  // 1. Si Evolution ya incluyó el base64 completo en el payload (> 8KB)
  const inlineBase64 = webhookData.message?.base64 || imgMsg.base64 || null;
  if (inlineBase64 && inlineBase64.length > 8000) {
    const clean = inlineBase64.replace(/^data:[^;]+;base64,/, '');
    return { mimeType, data: clean, source: 'webhook_base64' };
  }

  // 2. Descargar media completo mediante Evolution API v2: /chat/getBase64FromMediaMessage/{instance}
  try {
    const response = await fetch(
      `${env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${env.EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          message: {
            key: webhookData.key,
            message: webhookData.message,
          },
          convertToMp4: false,
        }),
      }
    );

    if (response.ok) {
      const json = await response.json();
      const rawB64 = json?.base64 || json?.data?.base64 || null;
      if (rawB64 && typeof rawB64 === 'string' && rawB64.length > 100) {
        const clean = rawB64.replace(/^data:[^;]+;base64,/, '');
        return {
          mimeType: json?.mimetype || mimeType,
          data: clean,
          source: 'evolution_v2_media',
        };
      }
    } else {
      console.warn('Evolution getBase64FromMediaMessage status:', response.status);
    }
  } catch (e) {
    console.warn('fetchFullReceiptMedia evolution_v2 error:', e.message);
  }

  // 3. Fallback secundario: si imgMsg.url es accesible directamente sin cifrado WhatsApp
  if (imgMsg.url && /^https?:\/\//i.test(imgMsg.url) && !imgMsg.url.includes('mmg.whatsapp.net')) {
    try {
      const res = await fetch(imgMsg.url);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const b64 = Buffer.from(arrayBuf).toString('base64');
        if (b64.length > 100) {
          return { mimeType, data: b64, source: 'direct_url' };
        }
      }
    } catch {}
  }

  // 4. Último recurso: miniatura jpegThumbnail
  if (imgMsg.jpegThumbnail) {
    const clean = String(imgMsg.jpegThumbnail).replace(/^data:[^;]+;base64,/, '');
    return { mimeType: 'image/jpeg', data: clean, source: 'thumbnail_fallback' };
  }

  return null;
}

module.exports = {
  sleep,
  humanDelay,
  sendWhatsAppMessage,
  sendWhatsAppImage,
  sendAdminAlert,
  fetchFullReceiptMedia,
};
