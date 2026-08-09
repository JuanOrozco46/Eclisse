const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pcmcfhhbpmbrrxpuodoh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjbWNmaGhicG1icnJ4cHVvZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTYwNDcsImV4cCI6MjEwMDA5MjA0N30.nTTSxgA-Lhpl85jGZ1itrTwvbSwa5APZeZOKMvYpiQQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EVOLUTION_API_URL = 'https://elhornobotprueba1.onrender.com';
const EVOLUTION_API_KEY = 'secreto123';
const EVOLUTION_INSTANCE = 'ECLISSE_WA_01';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDdlFUJubsRWVAMERl2sJODSBx41WE7tWM';
const MENU_IMAGE_URL = 'https://eclisse.vercel.app/assets/menu-eclisse.jpg';

// ─── Memory Store for WhatsApp Conversations ───────────────
const conversationCache = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 mins

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

// ─── Fetch Menu Items from Supabase ─────────────────────────
async function fetchMenuItems() {
  try {
    const { data } = await supabase.from('menu_items').select('*').eq('available', true);
    return data || [];
  } catch (e) {
    console.error('Error fetching menu items:', e);
    return [];
  }
}

// ─── Build Rich System Prompt ───────────────────────────────
function buildSystemPrompt(menuItems) {
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
  } else if (currentHour >= 21 && currentMinutes >= 30) {
    timeStatus = `\n⚠️ ESTADO ACTUAL: ÚLTIMAS ÓRDENES / SOLO RECOGER. No hay domicilios disponibles a esta hora, solo para recoger en el local.`;
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
- Ejemplos de variaciones (Inspírate en ellos, NO los copies al pie de la letra):
  * Estilo directo: "¡Hola! Con gusto te tomo el pedido. ¿A qué dirección lo enviamos?"
  * Estilo acogedor: "¡Buenas tardes! 🍕 Qué gusto saludarte. ¿Qué pizza se te antoja hoy?"
  * Estilo breve: "Dale, perfecto. ¿Me confirmas tu nombre y barrio en Armenia?"
  * Estilo explicativo: "Con todo gusto. Te confirmo que el domicilio dentro de Armenia es de $6.000 COP."

INFORMACIÓN DEL RESTAURANTE Y CONCEPTO:
- Tu nombre es Luisa y eres la anfitriona virtual de Eclisse Pizza Napoletana.
- Tu tono es profesional pero muy acogedor y sofisticado.
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

NOTAS PARA COCINA:
- Si el cliente solicita especificaciones especiales ("sin cebolla", "masa tostada"), regístralas claramente.

INVENTARIO Y CARTA VIGENTE EN TIEMPO REAL:
${catalogText}`;
}

// ─── Call Gemini with Fallbacks and History ────────────────
async function callGemini(systemPrompt, userMessage, history = []) {
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  const contents = [];
  for (const h of history) {
    contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
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

// ─── Send WhatsApp Message via Evolution API ───────────────
async function sendWhatsAppMessage(number, text) {
  try {
    await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text })
    });
  } catch (e) {
    console.error('Error sending WhatsApp message:', e.message);
  }
}

// ─── Main Vercel Serverless Webhook Handler ─────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ok', message: 'Eclisse WhatsApp Webhook Active' });
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

    // Ignore group chats and self messages
    if (remoteJid.includes('@g.us') || fromMe) {
      return res.status(200).json({ status: 'ignored_group_or_self' });
    }

    const messageText = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');

    // Handle audio messages gracefully
    if (!messageText.trim()) {
      if (messageType === 'audioMessage' || messageType === 'pttMessage') {
        await sendWhatsAppMessage(phoneNumber, '¡Hola! 🍕 Por el momento solo puedo leer mensajes de texto. ¿Podrías escribirme tu pedido o consulta? ¡Muchas gracias!');
        return res.status(200).json({ status: 'audio_handled' });
      }
      return res.status(200).json({ status: 'no_text' });
    }

    // Load history and add current user message
    const history = getConversation(phoneNumber);
    addToConversation(phoneNumber, 'user', messageText);

    // Fetch live menu catalog from Supabase
    const menuItems = await fetchMenuItems();
    const systemPrompt = buildSystemPrompt(menuItems);

    // Generate AI response
    const aiResponse = await callGemini(systemPrompt, messageText, history);

    if (aiResponse) {
      // Save model response to conversation history
      addToConversation(phoneNumber, 'model', aiResponse);

      // Human-like delay (1.5 seconds)
      await new Promise(r => setTimeout(r, 1500));

      await sendWhatsAppMessage(phoneNumber, aiResponse);
    }

    return res.status(200).json({ status: 'ok', phone: phoneNumber });
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
