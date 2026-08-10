const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL      || 'https://pcmcfhhbpmbrrxpuodoh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjbWNmaGhicG1icnJ4cHVvZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTYwNDcsImV4cCI6MjEwMDA5MjA0N30.nTTSxgA-Lhpl85jGZ1itrTwvbSwa5APZeZOKMvYpiQQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://elhornobotprueba1.onrender.com';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'secreto123';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01';
const FALLBACK_GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || 'https://eclisse.vercel.app/assets/menu-eclisse.jpg';

// ─── Horario del restaurante ──────────────────────────────────
const OPEN_HOUR  = 17; // 5 PM
const CLOSE_HOUR = 23; // 11 PM

function getBogoraHour() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).getHours();
}

function isOpen() {
  const h = getBogoraHour();
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
}

// ─── Cache con TTL genérico ───────────────────────────────────
function makeCache(ttlMs) {
  const store = new Map();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (Date.now() - e.ts > ttlMs) { store.delete(key); return null; }
      return e.value;
    },
    set(key, value) { store.set(key, { value, ts: Date.now() }); },
    delete(key) { store.delete(key); },
    has(key) { return this.get(key) !== null; },
    invalidate() { store.clear(); },
  };
}

const processedMessages = makeCache(60 * 1000);       // dedup 1 min
const configCache       = makeCache(5 * 60 * 1000);   // bot config 5 min
const menuCache         = makeCache(2 * 60 * 1000);   // menú 2 min (se invalida al guardar desde dashboard)
const orderStateCache   = makeCache(15 * 60 * 1000);  // estado pedido por cliente 15 min

// ─── Historial de conversación (en memoria + Supabase) ────────
// In-memory para performance; Supabase como persistencia ante cold starts.
const conversationMemCache = makeCache(30 * 60 * 1000);

async function getConversation(phone) {
  const mem = conversationMemCache.get(phone);
  if (mem) return mem;

  // Cold start → intentar recuperar de Supabase
  try {
    const { data } = await supabase
      .from('bot_conversations')
      .select('messages')
      .eq('phone', phone)
      .maybeSingle();
    if (data && Array.isArray(data.messages)) {
      conversationMemCache.set(phone, data.messages);
      return data.messages;
    }
  } catch (e) {}
  return [];
}

async function addToConversation(phone, role, text) {
  const msgs = await getConversation(phone);
  msgs.push({ role, text });
  if (msgs.length > 14) msgs.splice(0, msgs.length - 14);
  conversationMemCache.set(phone, msgs);

  // Persistir en Supabase (fire-and-forget, no bloquea la respuesta)
  supabase
    .from('bot_conversations')
    .upsert({ phone, messages: msgs, updated_at: new Date().toISOString() }, { onConflict: 'phone' })
    .then(() => {})
    .catch(() => {});
}

function getOrderState(phone) { return orderStateCache.get(phone) || { inserted: false }; }
function markOrderInserted(phone) { orderStateCache.set(phone, { inserted: true }); }
function resetOrderState(phone) { orderStateCache.delete(phone); }

// ─── Fetch Bot Config (cacheado 5 min) ───────────────────────
async function fetchBotConfig() {
  const cached = configCache.get('config');
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('rappi_config').select('*').eq('id', 'bot_config').maybeSingle();
    if (data && data.api_key) {
      const p = JSON.parse(data.api_key);
      const cfg = {
        geminiApiKey:   p.geminiApiKey   || FALLBACK_GEMINI_KEY,
        primaryModel:   p.primaryModel   || 'gemini-2.5-flash',
        secondaryModel: p.secondaryModel || 'gemini-2.5-pro',
        tertiaryModel:  p.tertiaryModel  || 'gemini-1.5-flash',
        systemPrompt:   p.systemPrompt   || '',
      };
      configCache.set('config', cfg);
      return cfg;
    }
  } catch (e) { console.error('fetchBotConfig:', e.message); }
  const fb = { geminiApiKey: FALLBACK_GEMINI_KEY, primaryModel: 'gemini-2.5-flash',
               secondaryModel: 'gemini-2.5-pro', tertiaryModel: 'gemini-1.5-flash', systemPrompt: '' };
  configCache.set('config', fb);
  return fb;
}

// ─── Menú por defecto ────────────────────────────────────────
const DEFAULT_MENU = [
  { id: '1',  name: 'Bianca',               price: 25000 },
  { id: '2',  name: 'Lumina',               price: 25000 },
  { id: '3',  name: 'Hawaianna',            price: 25000 },
  { id: '4',  name: 'Dorato',               price: 25000 },
  { id: '5',  name: 'Amalgama',             price: 25000 },
  { id: '6',  name: 'Dolce Fiamma',         price: 25000 },
  { id: '7',  name: 'Coca-Cola Original 250ml', price: 3000 },
  { id: '8',  name: 'Coca-Cola Zero 250ml', price: 3000  },
  { id: '9',  name: 'Quatro 250ml',         price: 3000  },
  { id: '10', name: 'Coca-Cola Original 1.5L', price: 8000 },
  { id: '11', name: 'Coca-Cola Zero 1.5L',  price: 8000  },
];

async function fetchMenuItems() {
  const cached = menuCache.get('menu');
  if (cached) return cached;
  try {
    const { data } = await supabase.from('menu_items').select('*').eq('available', true);
    if (data && data.length > 0) { menuCache.set('menu', data); return data; }
  } catch (e) {}
  menuCache.set('menu', DEFAULT_MENU);
  return DEFAULT_MENU;
}

// ─── System prompt ────────────────────────────────────────────
function buildSystemPrompt(menuItems, customPrompt) {
  const hour = getBogoraHour();
  let timeNote = '';
  if (hour < OPEN_HOUR) timeNote = `\nNOTA: Todavía no abrimos (abrimos a las 5 PM). Podés tomar el pedido de forma anticipada.`;

  const catalog = menuItems
    .map(i => `• ${i.name} $${Number(i.price || 0).toLocaleString('es-CO')}`)
    .join('\n');

  return `Sos Luisa, asistente de Eclisse Pizza Napoletana (Armenia, Quindío). Cocina oculta — solo domicilios y recogida en Calle 2 norte #18-144.
${timeNote}
CÓMO HABLAR:
- Mensajes cortos y naturales, como WhatsApp real. Máximo 2-3 líneas.
- No repitas saludos ni info que ya diste en esta conversación.
- Si te piden el menú, respondé solo "Aquí está nuestra carta 🍕" (el sistema manda la imagen automáticamente, vos no la mandás).
- Emojis con moderación, no en cada mensaje.
- Variá el tono para que no suene a robot.
- No repitas el resumen del pedido si ya lo confirmaste antes.

CUANDO EL CLIENTE CONFIRME EL PEDIDO:
El cliente confirma cuando da su dirección Y su método de pago (o dice "confirmo", "listo", etc.).
Respondé con UN mensaje corto de confirmación natural que incluya un estimado de tiempo (ej: "¡Perfecto! Pedido recibido, en unos 35-40 min está en tu puerta 🍕") y al FINAL de ese mensaje agregá este bloque exacto sin modificarlo:

PEDIDO_CONFIRMADO:
items: [describí los ítems, ej: 2x Bianca, 1x Coca-Cola Zero 250ml]
direccion: [dirección completa que dio el cliente]
total: [número, solo dígitos, sin puntos ni símbolo $]
pago: [Efectivo o Nequi]
telefono: [número del cliente sin @s.whatsapp.net ni @lid]

Si el cliente quiere CAMBIAR el pedido después de confirmarlo, incluí el bloque PEDIDO_CONFIRMADO: nuevamente con el pedido actualizado.

HORARIO: 5 PM – 11 PM todos los días.
DOMICILIO: Armenia $6.000 | Afueras $8.000–$12.000 | Recogida gratis.
PAGO: Efectivo o Nequi al 3223119008.

CARTA:
${catalog}

${customPrompt || ''}`.trim();
}

// ─── Parsear bloque PEDIDO_CONFIRMADO: ───────────────────────
function parseConfirmedOrder(text, menuItems, fallbackPhone, pushName) {
  if (!text || !text.includes('PEDIDO_CONFIRMADO:')) return null;

  const block = text.substring(text.indexOf('PEDIDO_CONFIRMADO:'));
  const get = (key) => {
    const m = block.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
    return m ? m[1].replace(/\[|\]/g, '').trim() : '';
  };

  const rawItems  = get('items');
  const direccion = get('direccion');
  const totalStr  = get('total').replace(/[^0-9]/g, '');
  const pago      = get('pago') || 'Efectivo';
  const telRaw    = get('telefono').replace(/@s\.whatsapp\.net|@lid/g, '').trim();

  if (!direccion || direccion.length < 4) {
    console.warn('PEDIDO_CONFIRMADO sin dirección válida');
    return null;
  }

  const parsedItems = [];
  for (const item of menuItems) {
    const esc = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = rawItems.match(new RegExp(
      `(\\d+)\\s*x\\s*${esc}|${esc}\\s*x\\s*(\\d+)|(\\d+)\\s+${esc}|${esc}`, 'i'
    ));
    if (m) {
      parsedItems.push({
        menuItemId: String(item.id),
        name: item.name,
        quantity: parseInt(m[1] || m[2] || m[3]) || 1,
        price: Number(item.price),
        note: '',
      });
    }
  }

  if (parsedItems.length === 0 && rawItems) {
    parsedItems.push({ menuItemId: 'custom', name: rawItems.slice(0, 120), quantity: 1, price: parseInt(totalStr) || 0, note: '' });
  }

  if (!parsedItems.some(i => i.price > 0 || i.menuItemId !== 'custom')) {
    console.warn('PEDIDO_CONFIRMADO sin ítems válidos');
    return null;
  }

  const calculated = parsedItems.reduce((a, i) => a + i.price * i.quantity, 0);
  const total = parseInt(totalStr) || calculated;
  const phone = telRaw || fallbackPhone;

  return {
    id: 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    table: direccion,
    items: parsedItems,
    total,
    status: 'PENDING',
    priority: false,
    timestamp: Date.now(),
    source: 'WHATSAPP',
    customer_phone: phone,
    customer_name: pushName || null,   // ← nombre del contacto de WhatsApp
    delivery_status: 'NONE',
    payment_method: pago,
  };
}

// ─── Dedup DB ─────────────────────────────────────────────────
async function hasRecentOrderInDB(phone) {
  try {
    const since = Date.now() - 15 * 60 * 1000;
    const { data } = await supabase
      .from('orders').select('id')
      .eq('customer_phone', phone).eq('status', 'PENDING')
      .gte('timestamp', since).limit(1);
    return data && data.length > 0;
  } catch (e) { return false; }
}

async function insertOrderToSupabase(order) {
  try {
    const { data, error } = await supabase.from('orders').insert(order).select('id').single();
    if (error) { console.error('Insert order error:', error.message); return null; }
    return data?.id || order.id;
  } catch (e) { console.error('Insert order exception:', e.message); return null; }
}

// ─── Gemini ───────────────────────────────────────────────────
async function callGemini(systemPrompt, userMessage, history, config) {
  const san = (m) => m ? m.toLowerCase().replace(/^gemini1-/, 'gemini-').trim() : '';
  const models = [...new Set([
    san(config.primaryModel), san(config.secondaryModel), san(config.tertiaryModel),
    'gemini-2.5-flash', 'gemini-1.5-flash',
  ].filter(Boolean))];

  const contents = [
    ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.75, maxOutputTokens: 400 },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (e) { console.error(`Gemini ${model}:`, e.message); }
  }
  return null;
}

// ─── Delay humano ─────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function humanDelay(text = '') {
  return Math.min(1100 + (text.length / 12) * 1000 + Math.random() * 700, 4500);
}

// ─── Envío de mensajes ────────────────────────────────────────
async function sendWhatsAppMessage(jid, text) {
  try {
    await sleep(humanDelay(text));
    await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, text }),
    });
  } catch (e) { console.error('sendText:', e.message); }
}

async function sendWhatsAppImage(jid, imageUrl, caption) {
  try {
    await sleep(humanDelay(caption || ''));
    await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, mediatype: 'image', media: imageUrl, caption: caption || '' }),
    });
  } catch (e) { console.error('sendMedia:', e.message); }
}

// ─── Detectores ───────────────────────────────────────────────
function isMenuRequest(text) {
  const t = text.toLowerCase();
  return ['menu','menú','carta','que tienen','qué tienen','que hay','qué hay','foto','fotos']
    .some(w => t.includes(w));
}

function isCurtMessage(text) {
  const clean = text.trim().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?¡!¿]/g, '');
  return ['ok','okey','vale','gracias','grx','bueno','listo','thanks','ty','chao','adios','dale','👍','👌']
    .includes(clean);
}

// Frases que indican que el cliente quiere modificar un pedido ya confirmado
const MOD_KEYWORDS = ['cambi','modific','en realidad','mejor pón','quiero cambiar','cambia','anula'];

// ─── Handler principal ────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version,x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET /api?action=bust-cache — invalida el caché del menú desde el dashboard ──
  if (req.method === 'GET') {
    if (req.query?.action === 'bust-cache') {
      const key = req.headers['x-api-key'];
      if (key === EVOLUTION_API_KEY) {
        menuCache.invalidate();
        configCache.invalidate();
        return res.status(200).json({ status: 'cache_cleared' });
      }
      return res.status(403).json({ error: 'unauthorized' });
    }
    return res.status(200).send('Eclisse WhatsApp Bot activo ✅');
  }

  try {
    const body = req.body || {};

    if (body.event !== 'messages.upsert') return res.status(200).json({ status: 'ignored_event' });

    const data = body.data;
    if (!data) return res.status(200).json({ status: 'no_data' });

    const remoteJid   = data.key?.remoteJid || '';
    const fromMe      = data.key?.fromMe || false;
    const messageId   = data.key?.id || '';
    const messageType = data.messageType || '';
    const pushName    = data.pushName || null; // ← nombre del contacto

    if (remoteJid.includes('@g.us') || fromMe) return res.status(200).json({ status: 'ignored' });

    // Dedup por messageId
    if (messageId && processedMessages.has(messageId)) return res.status(200).json({ status: 'duplicate_ignored' });
    if (messageId) processedMessages.set(messageId, true);

    const messageText = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
    const phone       = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
    const sendToJid   = remoteJid;

    // ── Voz / audio ──
    if (!messageText.trim()) {
      if (messageType === 'audioMessage' || messageType === 'pttMessage') {
        await sendWhatsAppMessage(sendToJid, 'Solo puedo leer texto 😊 ¿Me escribís el pedido?');
        return res.status(200).json({ status: 'audio_handled' });
      }
      return res.status(200).json({ status: 'no_text' });
    }

    // ── Saludos cortos → silencio ──
    if (isCurtMessage(messageText)) return res.status(200).json({ status: 'curt_ignored' });

    // ── CIERRE: si el restaurante está cerrado, respuesta fija sin Gemini ──
    if (!isOpen()) {
      const hour = getBogoraHour();
      const msg = hour >= CLOSE_HOUR
        ? `Ya cerramos por esta noche 😔 Abrimos mañana a las 5 PM. ¡Nos vemos!`
        : `Aún no abrimos, nuestro horario es de 5 PM a 11 PM 🍕 ¿Te puedo ayudar con algo de igual forma?`;
      await sendWhatsAppMessage(sendToJid, msg);
      return res.status(200).json({ status: 'closed_reply' });
    }

    // ── Menú → imagen directa ──
    if (isMenuRequest(messageText)) {
      await addToConversation(phone, 'user', messageText);
      await sendWhatsAppImage(sendToJid, MENU_IMAGE_URL, '');
      await addToConversation(phone, 'model', '[Menú enviado]');
      return res.status(200).json({ status: 'menu_sent' });
    }

    // ── Modificación de pedido ──
    if (MOD_KEYWORDS.some(k => messageText.toLowerCase().includes(k))) resetOrderState(phone);

    // ── Gemini ──
    await addToConversation(phone, 'user', messageText);
    const history = await getConversation(phone);

    const [botConfig, menuItems] = await Promise.all([fetchBotConfig(), fetchMenuItems()]);
    const systemPrompt = buildSystemPrompt(menuItems, botConfig.systemPrompt);
    const aiResponse   = await callGemini(systemPrompt, messageText, history.slice(0, -1), botConfig);

    // ── Fallback si todos los modelos fallan ──
    if (!aiResponse) {
      const fallback = 'Perdón, tuve un problema técnico 🙏 Intentá de nuevo en un momento o escribinos directo.';
      await sendWhatsAppMessage(sendToJid, fallback);
      return res.status(200).json({ status: 'gemini_fallback' });
    }

    await addToConversation(phone, 'model', aiResponse);

    // ── Detectar pedido confirmado ──
    if (aiResponse.includes('PEDIDO_CONFIRMADO:')) {
      const state = getOrderState(phone);
      if (!state.inserted) {
        const alreadyInDB = await hasRecentOrderInDB(phone);
        if (!alreadyInDB) {
          const order = parseConfirmedOrder(aiResponse, menuItems, phone, pushName);
          if (order) {
            const insertedId = await insertOrderToSupabase(order);
            if (insertedId) {
              markOrderInserted(phone);
              console.log(`✅ Pedido #${insertedId.slice(-4).toUpperCase()} de ${pushName || phone} → cocina`);
            }
          }
        } else {
          markOrderInserted(phone);
        }
      }
    }

    // ── Quitar bloque técnico y enviar al cliente ──
    const clientMessage = aiResponse.replace(/PEDIDO_CONFIRMADO:[\s\S]*/i, '').trim();
    if (clientMessage) await sendWhatsAppMessage(sendToJid, clientMessage);

    return res.status(200).json({ status: 'ok' });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};
