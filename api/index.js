const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pcmcfhhbpmbrrxpuodoh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjbWNmaGhicG1icnJ4cHVvZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTYwNDcsImV4cCI6MjEwMDA5MjA0N30.nTTSxgA-Lhpl85jGZ1itrTwvbSwa5APZeZOKMvYpiQQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://elhornobotprueba1.onrender.com';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'secreto123';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01';
const FALLBACK_GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || 'https://eclisse.vercel.app/assets/menu-eclisse.jpg';

// ─── Deduplicación de mensajes entrantes ─────────────────────
// Evita procesar dos veces el mismo mensaje si Evolution lo dispara dos veces
const processedMessages = new Map(); // messageId → timestamp
const MESSAGE_DEDUP_TTL = 60 * 1000; // 1 minuto

function isAlreadyProcessed(messageId) {
  const ts = processedMessages.get(messageId);
  if (ts && Date.now() - ts < MESSAGE_DEDUP_TTL) return true;
  processedMessages.set(messageId, Date.now());
  // Limpiar entradas viejas cada tanto
  if (processedMessages.size > 500) {
    const cutoff = Date.now() - MESSAGE_DEDUP_TTL;
    for (const [k, v] of processedMessages) {
      if (v < cutoff) processedMessages.delete(k);
    }
  }
  return false;
}

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
  if (existing.messages.length > 12) {
    existing.messages = existing.messages.slice(-12);
  }
  existing.lastUpdated = Date.now();
  conversationCache.set(phone, existing);
}

// ─── Estado de pedido por cliente ────────────────────────────
// Guarda si ya se insertó el pedido para esta "sesión de compra"
// Se resetea cuando el pedido cambia o pasan más de 10 minutos
const orderStateCache = new Map(); // phone → { orderInserted: bool, lastOrderTime: number }

function getOrderState(phone) {
  const s = orderStateCache.get(phone);
  if (!s) return { orderInserted: false };
  // Si pasaron más de 10 min desde el último pedido, permitir nuevo pedido
  if (Date.now() - s.lastOrderTime > 10 * 60 * 1000) {
    orderStateCache.delete(phone);
    return { orderInserted: false };
  }
  return s;
}

function markOrderInserted(phone) {
  orderStateCache.set(phone, { orderInserted: true, lastOrderTime: Date.now() });
}

function resetOrderState(phone) {
  orderStateCache.delete(phone);
}

// ─── Fetch Bot Config ────────────────────────────────────────
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
        tertiaryModel: parsed.tertiaryModel || 'gemini-1.5-flash',
        systemPrompt: parsed.systemPrompt || ''
      };
    }
  } catch (e) {
    console.error('Error fetching bot config:', e.message);
  }
  return {
    geminiApiKey: FALLBACK_GEMINI_KEY,
    primaryModel: 'gemini-2.5-flash',
    secondaryModel: 'gemini-2.5-pro',
    tertiaryModel: 'gemini-1.5-flash',
    systemPrompt: ''
  };
}

// ─── Menú por defecto ────────────────────────────────────────
const DEFAULT_MENU = [
  { id: '1', name: 'Bianca', price: 25000, category: 'Pizzas', description: 'Salsa blanca, mozzarella, tocineta ahumada, queso costeño y pimienta.', ingredients: ['Salsa blanca', 'Queso mozzarella', 'Tocineta ahumada', 'Queso costeño', 'Pimienta'], available: true },
  { id: '2', name: 'Lumina', price: 25000, category: 'Pizzas', description: 'Salsa de tomate, mozzarella, tomate cherry, pesto y mozzarella di bufala.', ingredients: ['Salsa de tomate', 'Queso mozzarella', 'Tomate cherry', 'Pesto', 'Mozzarella di bufala'], available: true },
  { id: '3', name: 'Hawaianna', price: 25000, category: 'Pizzas', description: 'Piña caramelizada, jamón ahumado, mozzarella, salsa de tomate y cilantro.', ingredients: ['Piña caramelizada', 'Jamón ahumado', 'Queso mozzarella', 'Salsa de tomate', 'Cilantro'], available: true },
  { id: '4', name: 'Dorato', price: 25000, category: 'Pizzas', description: 'Salsa de tomate, chorizo ahumado en trozos, maíz dulce y queso costeño.', ingredients: ['Salsa de tomate', 'Chorizo ahumado', 'Maíz dulce', 'Queso costeño'], available: true },
  { id: '5', name: 'Amalgama', price: 25000, category: 'Pizzas', description: 'Salsa de tomate, mozzarella, pollo en trozos, pimentón y cebolla morada.', ingredients: ['Salsa de tomate', 'Queso mozzarella', 'Pollo en trozos', 'Pimentón', 'Cebolla morada'], available: true },
  { id: '6', name: 'Dolce Fiamma', price: 25000, category: 'Pizzas', description: 'Salsa de tomate, mozzarella, pepperoni, cebolla morada y miel picante.', ingredients: ['Salsa de tomate', 'Queso mozzarella', 'Pepperoni', 'Cebolla morada', 'Miel picante'], available: true },
  { id: '7', name: 'Coca-Cola Original 250ml', price: 3000, category: 'Bebidas', description: 'Coca-Cola Original 250 ml', ingredients: [], available: true },
  { id: '8', name: 'Coca-Cola Zero 250ml', price: 3000, category: 'Bebidas', description: 'Coca-Cola Zero 250 ml', ingredients: [], available: true },
  { id: '9', name: 'Quatro 250ml', price: 3000, category: 'Bebidas', description: 'Quatro 250 ml', ingredients: [], available: true },
  { id: '10', name: 'Coca-Cola Original 1.5L', price: 8000, category: 'Bebidas', description: 'Coca-Cola Original 1.5 Litros', ingredients: [], available: true },
  { id: '11', name: 'Coca-Cola Zero 1.5L', price: 8000, category: 'Bebidas', description: 'Coca-Cola Zero 1.5 Litros', ingredients: [], available: true }
];

async function fetchMenuItems() {
  try {
    const { data } = await supabase.from('menu_items').select('*').eq('available', true);
    if (data && data.length > 0) return data;
  } catch (e) {}
  return DEFAULT_MENU;
}

// ─── System prompt ───────────────────────────────────────────
function buildSystemPrompt(menuItems, customPrompt) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const hour = now.getHours();

  let timeStatus = '';
  if (hour < 17) {
    timeStatus = `NOTA: Aún no abrimos (abrimos 5 PM). Podés tomar el pedido de forma anticipada.`;
  } else if (hour >= 23) {
    timeStatus = `NOTA: Ya cerramos. Abrimos mañana a las 5 PM.`;
  }

  const catalog = menuItems.map(item => {
    const price = Number(item.price || 0).toLocaleString('es-CO');
    return `• ${item.name} $${price}`;
  }).join('\n');

  return `Sos Luisa, la asistente de Eclisse Pizza Napoletana (Armenia, Quindío). Cocina oculta — solo domicilios y recogida en Calle 2 norte #18-144.

CÓMO HABLAR:
- Mensajes cortos, naturales, como WhatsApp de verdad. Máximo 2-3 líneas por mensaje.
- No repitas saludos ni información que ya diste antes.
- No pongas listas largas a menos que te pidan el menú. Si te piden el menú respondé solo "Aquí está la carta 🍕" (el sistema manda la imagen).
- Usá emojis con moderación, no en cada frase.
- Variá el tono entre mensajes para sonar natural.
- Si el cliente ya confirmó el pedido, NO lo repitas ni agregues más texto innecesario.
${timeStatus ? '\n' + timeStatus : ''}

DETECTAR PEDIDO CONFIRMADO:
Cuando el cliente confirme su pedido (diga su dirección + método de pago, o confirme explícitamente), respondé con un mensaje corto de confirmación que CONTENGA EXACTAMENTE este bloque al final (no lo omitas):

PEDIDO_CONFIRMADO:
items: [lista de ítems]
direccion: [dirección del cliente]
total: [total en números]
pago: [efectivo/nequi]
telefono: [número del cliente]

HORARIO: 5 PM a 11 PM todos los días.
DOMICILIO: Armenia $6.000 | Afueras $8.000-$12.000 | Recogida gratis
PAGO: Efectivo o Nequi 3223119008

CARTA:
${catalog}

${customPrompt || ''}`;
}

// ─── Parsear bloque de pedido confirmado ─────────────────────
function parseConfirmedOrder(text, menuItems, fallbackPhone) {
  if (!text || !text.includes('PEDIDO_CONFIRMADO:')) return null;

  const block = text.substring(text.indexOf('PEDIDO_CONFIRMADO:'));

  const getValue = (key) => {
    const regex = new RegExp(`${key}:\\s*(.+)`, 'i');
    const match = block.match(regex);
    return match ? match[1].trim() : '';
  };

  const rawItems = getValue('items');
  const direccion = getValue('direccion');
  const totalStr = getValue('total').replace(/[^0-9]/g, '');
  const pago = getValue('pago');
  const telefonoRaw = getValue('telefono');

  if (!rawItems || !direccion) return null;

  // Parsear items del texto libre con el catálogo
  const parsedItems = [];
  let total = parseInt(totalStr) || 0;

  for (const menuItem of menuItems) {
    // Buscar cantidad por nombre en el texto de items
    const nameEscaped = menuItem.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(\\d+)\\s*x?\\s*${nameEscaped}|${nameEscaped}\\s*x?\\s*(\\d+)`, 'i');
    const match = rawItems.match(regex);
    if (match) {
      const qty = parseInt(match[1] || match[2]) || 1;
      parsedItems.push({
        menuItemId: String(menuItem.id),
        name: menuItem.name,
        quantity: qty,
        price: Number(menuItem.price),
        note: ''
      });
    }
  }

  // Si no pudo parsear items pero hay texto, crear item genérico
  if (parsedItems.length === 0) {
    parsedItems.push({
      menuItemId: 'custom',
      name: rawItems.substring(0, 120),
      quantity: 1,
      price: total,
      note: ''
    });
  }

  // Calcular total real si no vino bien
  const calculatedTotal = parsedItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
  if (!total && calculatedTotal > 0) total = calculatedTotal;

  const phone = telefonoRaw || fallbackPhone;

  return {
    id: 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    table: direccion,
    items: parsedItems,
    total: total,
    status: 'PENDING',
    priority: false,
    timestamp: Date.now(),
    source: 'WHATSAPP',
    customer_phone: phone,
    delivery_status: 'NONE',
    payment_method: pago || 'Efectivo'
  };
}

// ─── Insertar pedido en Supabase ─────────────────────────────
async function insertOrderToSupabase(order) {
  try {
    const { data, error } = await supabase.from('orders').insert(order).select().single();
    if (error) {
      console.error('Error insertando pedido:', error.message);
      return false;
    }
    console.log('Pedido insertado en Supabase:', data?.id);
    return true;
  } catch (e) {
    console.error('Exception insertando pedido:', e.message);
    return false;
  }
}

// ─── Gemini ──────────────────────────────────────────────────
async function callGemini(systemPrompt, userMessage, history, config) {
  const sanitizeModel = (m) => m ? m.toLowerCase().replace(/^gemini1-/, 'gemini-').trim() : 'gemini-2.5-flash';
  const models = [
    sanitizeModel(config.primaryModel),
    sanitizeModel(config.secondaryModel),
    sanitizeModel(config.tertiaryModel),
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ];

  const contents = [];
  for (const h of history) {
    contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  for (const model of [...new Set(models)]) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;
      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.75, maxOutputTokens: 350 }
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (e) {
      console.error(`Gemini ${model} error:`, e.message);
    }
  }
  return null;
}

// ─── Delay humano ────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Simula el tiempo que tarda una persona en escribir según la longitud del texto
function humanDelay(text) {
  const baseDelay = 1200;                        // mínimo 1.2s
  const charsPerSecond = 12;                     // velocidad de tipeo simulada
  const typingTime = (text.length / charsPerSecond) * 1000;
  const jitter = Math.random() * 800;            // variación aleatoria hasta 0.8s
  return Math.min(baseDelay + typingTime + jitter, 5000); // máximo 5s
}

// ─── Envío de mensajes ───────────────────────────────────────
async function sendWhatsAppMessage(jid, text) {
  try {
    await sleep(humanDelay(text));
    await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, text })
    });
  } catch (e) {
    console.error('Error enviando mensaje:', e.message);
  }
}

async function sendWhatsAppImage(jid, imageUrl, caption) {
  try {
    await sleep(humanDelay(caption || ''));
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
    console.error('Error enviando imagen:', e.message);
  }
}

// ─── Detectores de intención ─────────────────────────────────
function isMenuRequest(text) {
  const t = text.toLowerCase();
  return t.includes('menu') || t.includes('menú') || t.includes('carta') ||
    t.includes('que tienen') || t.includes('qué tienen') ||
    t.includes('que hay') || t.includes('qué hay') ||
    t.includes('foto') || t.includes('fotos');
}

function isCurtMessage(text) {
  const clean = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?¡!]/g, '');
  const curtWords = ['ok', 'okey', 'vale', 'gracias', 'grx', 'bueno', 'listo', 'thanks', 'ty', 'chao', 'adios', 'dale'];
  return curtWords.includes(clean);
}

// ─── Handler principal (Vercel serverless) ───────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).send('Eclisse WhatsApp Bot activo ✅');

  try {
    const body = req.body || {};

    if (body.event !== 'messages.upsert') {
      return res.status(200).json({ status: 'ignored_event' });
    }

    const data = body.data;
    if (!data) return res.status(200).json({ status: 'no_data' });

    const remoteJid = data.key?.remoteJid || '';
    const fromMe = data.key?.fromMe || false;
    const messageId = data.key?.id || '';
    const messageType = data.messageType || '';

    // Ignorar grupos y mensajes propios
    if (remoteJid.includes('@g.us') || fromMe) {
      return res.status(200).json({ status: 'ignored' });
    }

    // Deduplicar: si ya procesamos este messageId, ignorar
    if (messageId && isAlreadyProcessed(messageId)) {
      console.log('Mensaje duplicado ignorado:', messageId);
      return res.status(200).json({ status: 'duplicate_ignored' });
    }

    const messageText = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
    const sendToJid = remoteJid;
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');

    // Audio/voz → respuesta rápida sin Gemini
    if (!messageText.trim()) {
      if (messageType === 'audioMessage' || messageType === 'pttMessage') {
        await sendWhatsAppMessage(sendToJid, 'Solo puedo leer texto 😊 ¿Me escribís tu pedido?');
        return res.status(200).json({ status: 'audio_handled' });
      }
      return res.status(200).json({ status: 'no_text' });
    }

    // Mensajes cortantes → no responder
    if (isCurtMessage(messageText)) {
      return res.status(200).json({ status: 'curt_ignored' });
    }

    // Si pide el menú → mandar imagen directo sin pasar por Gemini
    if (isMenuRequest(messageText)) {
      addToConversation(phoneNumber, 'user', messageText);
      await sendWhatsAppImage(sendToJid, MENU_IMAGE_URL, '');
      addToConversation(phoneNumber, 'model', '[Menú enviado]');
      return res.status(200).json({ status: 'menu_sent' });
    }

    // Construir contexto y llamar a Gemini
    addToConversation(phoneNumber, 'user', messageText);
    const history = getConversation(phoneNumber);

    const [botConfig, menuItems] = await Promise.all([fetchBotConfig(), fetchMenuItems()]);
    const systemPrompt = buildSystemPrompt(menuItems, botConfig.systemPrompt);
    const aiResponse = await callGemini(systemPrompt, messageText, history.slice(0, -1), botConfig);

    if (!aiResponse) {
      return res.status(200).json({ status: 'no_ai_response' });
    }

    addToConversation(phoneNumber, 'model', aiResponse);

    // ─── Detectar pedido confirmado en la respuesta de la IA ──
    const orderState = getOrderState(phoneNumber);
    if (!orderState.orderInserted && aiResponse.includes('PEDIDO_CONFIRMADO:')) {
      const order = parseConfirmedOrder(aiResponse, menuItems, phoneNumber);
      if (order) {
        const inserted = await insertOrderToSupabase(order);
        if (inserted) {
          markOrderInserted(phoneNumber);
          console.log(`Pedido de ${phoneNumber} enviado a cocina.`);
        }
      }
    }

    // Limpiar el bloque técnico antes de enviar al cliente
    const clientMessage = aiResponse
      .replace(/PEDIDO_CONFIRMADO:[\s\S]*$/i, '')
      .trim();

    if (clientMessage) {
      await sendWhatsAppMessage(sendToJid, clientMessage);
    }

    return res.status(200).json({ status: 'ok' });

  } catch (err) {
    console.error('Error en webhook:', err);
    return res.status(500).json({ error: err.message });
  }
};
