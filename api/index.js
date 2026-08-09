const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pcmcfhhbpmbrrxpuodoh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjbWNmaGhicG1icnJ4cHVvZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTYwNDcsImV4cCI6MjEwMDA5MjA0N30.nTTSxgA-Lhpl85jGZ1itrTwvbSwa5APZeZOKMvYpiQQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://elhornobotprueba1.onrender.com';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'secreto123';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01';
const FALLBACK_GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const MENU_IMAGE_URL = process.env.MENU || process.env.menuImageUrl || process.env.MENU_IMAGE_URL || 'https://eclisse.vercel.app/assets/menu-eclisse.jpg';

// ─── Conversation cache ───────────────────────────────────────
const conversationCache = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000;

function getConversation(phone) {
  const entry = conversationCache.get(phone);
  if (!entry) return [];
  if (Date.now() - entry.lastUpdated > CONVERSATION_TTL) {
    conversationCache.delete(phone);
    return [];
  }
  return entry.messages;
}

function addToConversation(phone, role, text) {
  const existing = conversationCache.get(phone) || { messages: [], lastUpdated: Date.now() };
  existing.messages.push({ role, text });
  if (existing.messages.length > 10) {
    existing.messages = existing.messages.slice(-10);
  }
  existing.lastUpdated = Date.now();
  conversationCache.set(phone, existing);
}

// ─── Fetch Bot Config & Gemini API Key dynamically ──────────
async function fetchBotConfig() {
  try {
    const { data } = await supabase
      .from('rappi_config')
      .select('*')
      .eq('id', 'bot_config')
      .maybeSingle();

    if (data && data.api_key) {
      const parsed = JSON.parse(data.api_key);
      return {
        geminiApiKey: parsed.geminiApiKey || FALLBACK_GEMINI_KEY,
        primaryModel: parsed.primaryModel || 'gemini-2.5-flash',
        secondaryModel: parsed.secondaryModel || 'gemini-2.5-pro',
        tertiaryModel: parsed.tertiaryModel || 'gemini-3.5-flash',
        systemPrompt: parsed.systemPrompt || ''
      };
    }
  } catch (e) {
    console.error('Error fetching bot config from Supabase:', e);
  }

  return {
    geminiApiKey: FALLBACK_GEMINI_KEY,
    primaryModel: 'gemini-2.5-flash',
    secondaryModel: 'gemini-2.5-pro',
    tertiaryModel: 'gemini-3.5-flash',
    systemPrompt: ''
  };
}

async function fetchMenuItems() {
  try {
    const { data } = await supabase.from('menu_items').select('*').eq('available', true);
    return data || [];
  } catch (e) {
    return [];
  }
}

function buildSystemPrompt(menuItems, customPrompt) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const pad = (n) => n < 10 ? '0' + n : '' + n;

  let timeStatus = '';
  if (currentHour < 12) {
    timeStatus = `⚠️ PRE-APERTURA: Abrimos a las 12:00 PM. Puedes tomar el pedido anticipado.`;
  } else if (currentHour >= 22) {
    timeStatus = `⚠️ CERRADO. Abrimos mañana a las 12:00 PM.`;
  }

  let catalogText = 'Sin productos disponibles en este momento.';
  if (menuItems && menuItems.length > 0) {
    catalogText = menuItems.map(item => {
      const price = Number(item.price || 0).toLocaleString('es-CO');
      const ingredients = item.ingredients && item.ingredients.length > 0 ? ` (${item.ingredients.join(', ')})` : '';
      return `• ${item.name} $${price} COP: ${item.description || ''}${ingredients}`;
    }).join('\n');
  }

  return `Eres Luisa, asistente de Eclisse Pizza Napoletana (Armenia, Quindío). Cocina oculta: solo domicilios y recogida en Calle 2 norte #18-144.

REGLAS CRÍTICAS:
- Respuestas MUY CORTAS. Máximo 2-3 líneas.
- Solo responde lo que te preguntan. Sin información extra.
- Nunca menciones que no hay productos si no te lo preguntan.
- Si piden el menú, responde SOLO: "Aquí está nuestra carta 🍕" (sin más texto, el sistema enviará la imagen).
- Varía siempre el tono para evitar spam.
${timeStatus ? '\n' + timeStatus : ''}

Domicilio Armenia: $6.000 | Afueras: $8.000-$12.000 | Recogida: gratis
Pago: Efectivo o Nequi 3223119008

CARTA:
${catalogText}

${customPrompt || ''}`;
}

async function callGemini(systemPrompt, userMessage, history = [], config) {
  const sanitizeModel = (m) => {
    if (!m) return 'gemini-2.5-flash';
    return m.toLowerCase().replace(/^gemini1-/, 'gemini-').trim();
  };

  const models = [
    sanitizeModel(config.primaryModel)   || 'gemini-2.5-flash',
    sanitizeModel(config.secondaryModel) || 'gemini-2.5-pro',
    sanitizeModel(config.tertiaryModel)  || 'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3.5-flash'
  ];

  const contents = [];
  for (const h of history) {
    contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;
      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      }
    } catch (e) {
      console.error(`Gemini model ${model} error:`, e.message);
    }
  }
  return null;
}

async function sendWhatsAppMessage(jid, text) {
  try {
    await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, text })
    });
  } catch (e) {
    console.error('Error sending text message:', e.message);
  }
}

async function sendWhatsAppImage(jid, imageUrl, caption) {
  try {
    await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({
        number: jid,
        mediatype: 'image',
        media: imageUrl,
        caption: caption || ''
      })
    });
  } catch (e) {
    console.error('Error sending image message:', e.message);
  }
}

// Detecta si el cliente está pidiendo el menú
function isMenuRequest(text) {
  const lower = text.toLowerCase();
  return lower.includes('menu') || lower.includes('menú') || lower.includes('carta') ||
    lower.includes('que tienen') || lower.includes('qué tienen') ||
    lower.includes('que hay') || lower.includes('qué hay') ||
    lower.includes('pizzas') || lower.includes('productos') ||
    lower.includes('foto') || lower.includes('fotos');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).send('Eclisse WhatsApp Webhook Active');
  }

  try {
    const body = req.body || {};
    if (body.event !== 'messages.upsert') {
      return res.status(200).json({ status: 'ignored_event' });
    }

    const data = body.data;
    if (!data) return res.status(200).json({ status: 'no_data' });

    const remoteJid = data.key?.remoteJid || '';
    const fromMe = data.key?.fromMe || false;
    const messageType = data.messageType || '';

    if (remoteJid.includes('@g.us') || fromMe) {
      return res.status(200).json({ status: 'ignored_group_or_self' });
    }

    const messageText = data.message?.conversation || data.message?.extendedTextMessage?.text || '';

    // Usar remoteJid completo para enviar (Evolution API maneja @lid nativamente)
    const sendToJid = remoteJid;
    // Usar como clave de caché solo el ID limpio
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');

    if (!messageText.trim()) {
      if (messageType === 'audioMessage' || messageType === 'pttMessage') {
        await sendWhatsAppMessage(sendToJid, 'Solo puedo leer texto 😊 ¿Podrías escribirme?');
        return res.status(200).json({ status: 'audio_handled' });
      }
      return res.status(200).json({ status: 'no_text' });
    }

    addToConversation(phoneNumber, 'user', messageText);

    // Si pide el menú, enviar imagen directamente
    if (isMenuRequest(messageText)) {
      await sendWhatsAppImage(sendToJid, MENU_IMAGE_URL, '');
      addToConversation(phoneNumber, 'model', '[Imagen del menú enviada]');
      return res.status(200).json({ status: 'menu_sent' });
    }

    const botConfig = await fetchBotConfig();
    const menuItems = await fetchMenuItems();
    const systemPrompt = buildSystemPrompt(menuItems, botConfig.systemPrompt);
    const aiResponse = await callGemini(systemPrompt, messageText, getConversation(phoneNumber), botConfig);

    if (aiResponse) {
      addToConversation(phoneNumber, 'model', aiResponse);
      await sendWhatsAppMessage(sendToJid, aiResponse);
    }

    return res.status(200).json({ status: 'ok', responseSent: !!aiResponse });

  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: err.message });
  }
};
