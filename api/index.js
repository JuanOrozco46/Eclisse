const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pcmcfhhbpmbrrxpuodoh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjbWNmaGhicG1icnJ4cHVvZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTYwNDcsImV4cCI6MjEwMDA5MjA0N30.nTTSxgA-Lhpl85jGZ1itrTwvbSwa5APZeZOKMvYpiQQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://elhornobotprueba1.onrender.com';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'secreto123';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01';
const FALLBACK_GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const MENU_IMAGE_URL = process.env.MENU || process.env.menuImageUrl || process.env.MENU_IMAGE_URL || 'https://eclisse.vercel.app/assets/menu-eclisse.jpg';

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
        primaryModel: parsed.primaryModel || 'gemini-2.0-flash',
        secondaryModel: parsed.secondaryModel || 'gemini-2.0-flash-lite',
        tertiaryModel: parsed.tertiaryModel || 'gemini-1.5-pro',
        systemPrompt: parsed.systemPrompt || ''
      };
    }
  } catch (e) {
    console.error('Error fetching bot config from Supabase:', e);
  }

  return {
    geminiApiKey: FALLBACK_GEMINI_KEY,
    primaryModel: 'gemini-2.0-flash',
    secondaryModel: 'gemini-2.0-flash-lite',
    tertiaryModel: 'gemini-1.5-pro',
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
  const currentDate = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const pad = (n) => n < 10 ? '0' + n : '' + n;

  let timeStatus = '';
  if (currentHour < 12) {
    timeStatus = `\n⚠️ ESTADO ACTUAL: PRE-APERTURA (Son las ${currentHour}:${pad(currentMinutes)} AM). Atiende amablemente y aclara que nuestro horno abre a las 12:00 PM, pero puedes tomar el pedido de forma anticipada.`;
  } else if (currentHour >= 22) {
    timeStatus = `\n⚠️ ESTADO ACTUAL: CERRADO (Son las ${currentHour}:${pad(currentMinutes)}). Ya cerramos por hoy. Dile amablemente al cliente que abrimos de nuevo mañana a las 12:00 PM.`;
  }

  let catalogText = 'Actualmente no hay productos registrados en la carta.';
  if (menuItems && menuItems.length > 0) {
    catalogText = menuItems.map(item => {
      const price = Number(item.price || 0).toLocaleString('es-CO');
      const ingredients = item.ingredients && item.ingredients.length > 0 ? ` (Ingredientes: ${item.ingredients.join(', ')})` : '';
      return `• ${item.name} - $${price} COP [Categoría: ${item.category || 'General'}]: ${item.description || ''}${ingredients}`;
    }).join('\n');
  }

  return `REGLA DE ORO ANTI-SPAM DE WHATSAPP:
- NUNCA RESPONDAS EXACTAMENTE IGUAL A DOS CLIENTES SEGUIDOS.
- VARÍA SIEMPRE LA ESTRUCTURA, EL TONO, LAS PALABRAS Y EL USO DE EMOJIS.

INFORMACIÓN DEL RESTAURANTE Y CONCEPTO:
- Tu nombre es Luisa y eres la anfitriona virtual de Eclisse Pizza Napoletana.
- Nombre del Restaurante: Eclisse Pizza Napoletana (Artesanal y de Fuego)
- Modelo de Negocio: COCINA OCULTA (Dark Kitchen). NO atendemos mesas en el sitio ni tenemos salón comedor. Solo domicilios y para recoger.
- Dirección Única de Recogida: Calle 2 norte #18-144, Armenia, Quindío.
- Ubicación: Armenia, Quindío, Colombia
- Fecha y Hora Actual: ${currentDate} (${currentHour}:${pad(currentMinutes)}) ${timeStatus}

IMAGEN DE LA CARTA / MENÚ DIGITAL:
- Enlace de la Carta/Menú: ${MENU_IMAGE_URL}
- Si el cliente solicita el menú, la carta o fotos de las pizzas, comparte el enlace: ${MENU_IMAGE_URL}

TARIFAS DE DOMICILIO (ARMENIA, QUINDÍO):
- Domicilio estándar a cualquier barrio dentro de Armenia: $6.000 COP.
- Afueras o Alrededores de Armenia: $8.000 - $12.000 COP.
- Recoger en el local (Calle 2 norte #18-144): $0 (Gratis).

MÉTODOS DE PAGO:
- Aceptamos Efectivo (Contraentrega) y Nequi/Transferencia.
- Datos de Nequi: Nequi al 3223119008 o Llave Nequi @3223119008.

INVENTARIO Y CARTA VIGENTE EN TIEMPO REAL:
${catalogText}

${customPrompt || ''}`;
}

async function callGemini(systemPrompt, userMessage, history = [], config) {
  // Normalize model names if user typed typo models like gemini1-2.5-flash
  const sanitizeModel = (m) => {
    if (!m) return 'gemini-2.0-flash';
    return m.replace(/^gemini1-/, 'gemini-').trim();
  };

  const models = [
    sanitizeModel(config.primaryModel),
    sanitizeModel(config.secondaryModel),
    sanitizeModel(config.tertiaryModel),
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
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
        generationConfig: { temperature: 0.9, maxOutputTokens: 500 }
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

async function sendWhatsAppMessage(number, text) {
  try {
    await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text })
    });
  } catch (e) {}
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
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');

    if (!messageText.trim()) {
      if (messageType === 'audioMessage' || messageType === 'pttMessage') {
        await sendWhatsAppMessage(phoneNumber, '¡Hola! 🍕 Por el momento solo puedo leer mensajes de texto. ¿Podrías escribirme tu pedido o consulta? ¡Muchas gracias!');
        return res.status(200).json({ status: 'audio_handled' });
      }
      return res.status(200).json({ status: 'no_text' });
    }

    const history = getConversation(phoneNumber);
    addToConversation(phoneNumber, 'user', messageText);

    // Fetch dynamic bot config (including API Key & models saved in UI)
    const botConfig = await fetchBotConfig();

    const menuItems = await fetchMenuItems();
    const systemPrompt = buildSystemPrompt(menuItems, botConfig.systemPrompt);
    const aiResponse = await callGemini(systemPrompt, messageText, history, botConfig);

    if (aiResponse) {
      addToConversation(phoneNumber, 'model', aiResponse);
      await sendWhatsAppMessage(phoneNumber, aiResponse);
    }

    return res.status(200).json({ status: 'ok', phone: phoneNumber, responseSent: !!aiResponse });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ error: err.message });
  }
};
