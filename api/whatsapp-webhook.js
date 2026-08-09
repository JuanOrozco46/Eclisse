// Vercel Serverless Function: WhatsApp Webhook Handler
// Receives incoming WhatsApp messages from Evolution API,
// processes them with Gemini AI, and sends responses back.

const SUPABASE_URL = 'https://pcmcfhhbpmbrrxpuodoh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjbWNmaGhicG1icnJ4cHVvZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTYwNDcsImV4cCI6MjEwMDA5MjA0N30.nTTSxgA-Lhpl85jGZ1itrTwvbSwa5APZeZOKMvYpiQQ';

const EVOLUTION_API_URL = 'https://elhornobotprueba1.onrender.com';
const EVOLUTION_API_KEY = 'secreto123';
const EVOLUTION_INSTANCE = 'ECLISSE_WA_01';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDdlFUJubsRWVAMERl2sJODSBx41WE7tWM';
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || 'https://eclisse.vercel.app/assets/menu-eclisse.jpg';

// ─── Fetch menu items from Supabase ────────────────────────
async function fetchMenuItems() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/menu_items?select=*&available=eq.true`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error('Error fetching menu from Supabase:', e);
    return [];
  }
}

// ─── Build system prompt ───────────────────────────────────
function buildSystemPrompt(menuItems) {
  // Colombia timezone (UTC-5)
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
      const ingredients = item.ingredients && item.ingredients.length > 0
        ? ` (Ingredientes: ${item.ingredients.join(', ')})`
        : '';
      const cat = item.category || 'General';
      const desc = item.description || '';
      return `• ${item.name} - $${price} COP [Categoría: ${cat}]: ${desc}${ingredients}`;
    }).join('\n');
  }

  return `INSTRUCCIONES PARA VARIAR LA RESPUESTA:
- NUNCA repitas la misma frase dos veces seguidas.
- Usa DIFERENTES ESTRUCTURAS cada vez. Inspírate en estos estilos pero CREA variaciones nuevas:

Estilo corto y directo:
  "Hola! Con gusto te tomo el pedido. ¿A qué barrio lo enviamos?"
Estilo con emojis:
  "¡Buenas! 🍕🔥 ¿Qué pizza se te antoja hoy?"
Estilo amable:
  "¡Hola! Qué gusto saludarte. Somos Eclisse Pizza Napoletana, ¿te comparto nuestra carta?"
Estilo breve:
  "Dale, perfecto 👍"
  "Listo, anotado"

REGLA DE ORO ANTI-SPAM: PARA EVITAR RESTRICCIONES DE WHATSAPP, NUNCA RESPONDAS EXACTAMENTE IGUAL A DOS CLIENTES. VARÍA SIEMPRE LA ESTRUCTURA, EL TONO, LAS PALABRAS Y EL USO DE EMOJIS.

EQUILIBRIO HUMANO Y BREVEDAD: Compórtate como un humano amable al explicar el menú o resolver dudas. PERO si el cliente confirma algo ("ok", "listo", "perfecto"), RESPONDE CON MÁXIMO 1-4 PALABRAS CASUALES: "Dale, anotado", "Listo 👍", "Bueno", "Entendido". NUNCA repitas información ya dada.

INFORMACIÓN DEL RESTAURANTE Y CONCEPTO:
- Tu nombre es Luisa y eres la anfitriona virtual de Eclisse Pizza Napoletana.
- Tu tono es profesional pero muy acogedor y sofisticado.
- Nombre del Restaurante: Eclisse Pizza Napoletana (Artesanal y de Fuego)
- Modelo de Negocio: COCINA OCULTA (Dark Kitchen). NO atendemos mesas en el sitio ni tenemos salón comedor. Solo domicilios y para recoger.
- Dirección Única de Recogida: Calle 2 norte #18-144, Armenia, Quindío.
- Si el cliente pregunta dónde estamos o desea RECOGER su pedido, aclárale amablemente que somos una cocina oculta y dale la dirección exacta: Calle 2 norte #18-144, Armenia.
- Ubicación: Armenia, Quindío, Colombia
- Fecha y Hora Actual: ${currentDate} (${currentHour}:${pad(currentMinutes)}) ${timeStatus}

IMAGEN DE LA CARTA / MENÚ DIGITAL:
- Enlace de la Carta/Menú: ${MENU_IMAGE_URL}
- Si el cliente solicita el menú, la carta o fotos de las pizzas, RESPONDE con una frase acogedora corta y comparte el enlace. Ejemplo: "¡Claro! Aquí te comparto nuestra carta 👇 ${MENU_IMAGE_URL}"
- NUNCA listes los precios en texto largo, solo comparte el link de la carta.

TARIFAS DE DOMICILIO (ARMENIA, QUINDÍO):
- Domicilio estándar a cualquier barrio dentro de Armenia: $6.000 COP.
- Afueras o Alrededores de Armenia (ej. Circasia, Calarcá, Tébaras, El Caimo, Club Campestre): $8.000 - $12.000 COP.
- Recoger en el local (Calle 2 norte #18-144): $0 (Gratis).

MÉTODOS DE PAGO:
- Aceptamos Efectivo (Contraentrega) y Nequi/Transferencia.
- Datos de Nequi: Nequi al 3223119008 o Llave Nequi @3223119008.
- Para pagos por Transferencia/Nequi: Solicita siempre la foto del comprobante de pago ANTES de confirmar la orden.
- Revisa en el comprobante que la fecha sea de hoy y el valor coincida con el total.

NOTAS Y OBSERVACIONES PARA COCINA:
- Si el cliente solicita cualquier cambio o especificación (ej: "Sin cebolla", "Masa bien tostada", "Salsa aparte"), DEBES registrarlo en el campo 'notes'.

RECOLECCIÓN DE DATOS PARA PEDIDO:
- Para DOMICILIO pide: Nombre, Dirección/Barrio en Armenia, y Forma de Pago.
- Para RECOGER: Solo Nombre y Forma de Pago. NUNCA pidas dirección si va a recoger.
- Si faltan VARIOS datos, pídelos TODOS JUNTOS en una sola respuesta.

AUDIOS: Si el cliente envía un audio, indícale amablemente que solo puedes leer texto.

INVENTARIO Y CARTA VIGENTE EN TIEMPO REAL:
${catalogText}

FORMATO DE RESPUESTA:
Responde SIEMPRE en texto plano natural. NO uses formato JSON. Escribe como lo haría un humano amable por WhatsApp. Usa emojis con moderación. Usa *negritas* de WhatsApp para destacar información importante (precios, nombres de pizza, totales).`;
}

// ─── Call Gemini API ───────────────────────────────────────
async function callGemini(systemPrompt, userMessage, conversationHistory = []) {
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      // Build conversation contents with system instruction
      const contents = [];

      // Add conversation history for context
      for (const msg of conversationHistory.slice(-6)) {
        contents.push({
          role: msg.role,
          parts: [{ text: msg.text }]
        });
      }

      // Add current user message
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });

      const body = {
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 500,
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Gemini ${model} error ${res.status}:`, errText);
        continue;
      }

      const data = await res.json();

      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      }

      continue;
    } catch (err) {
      console.error(`Gemini ${model} exception:`, err.message);
      continue;
    }
  }

  return null;
}

// ─── Send WhatsApp message via Evolution API ───────────────
async function sendWhatsAppMessage(number, text) {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({ number, text })
    });

    const data = await res.json();
    console.log('Message sent to', number, '- Status:', res.status);
    return data;
  } catch (err) {
    console.error('Error sending WhatsApp message:', err.message);
    return null;
  }
}

// ─── Simple conversation memory (in-memory per serverless instance) ───
const conversationCache = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes

function getConversation(phoneNumber) {
  const entry = conversationCache.get(phoneNumber);
  if (!entry) return [];
  if (Date.now() - entry.lastUpdated > CONVERSATION_TTL) {
    conversationCache.delete(phoneNumber);
    return [];
  }
  return entry.messages;
}

function addToConversation(phoneNumber, role, text) {
  const existing = conversationCache.get(phoneNumber) || { messages: [], lastUpdated: Date.now() };
  existing.messages.push({ role, text });
  // Keep only last 10 messages
  if (existing.messages.length > 10) {
    existing.messages = existing.messages.slice(-10);
  }
  existing.lastUpdated = Date.now();
  conversationCache.set(phoneNumber, existing);

  // Cleanup old conversations periodically
  if (conversationCache.size > 100) {
    const now = Date.now();
    for (const [key, val] of conversationCache.entries()) {
      if (now - val.lastUpdated > CONVERSATION_TTL) {
        conversationCache.delete(key);
      }
    }
  }
}

// ─── Main webhook handler ──────────────────────────────────
export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ok', method: req.method });
  }

  try {
    const body = req.body;

    // Log incoming event type
    const event = body.event || 'unknown';
    console.log(`[Webhook] Event: ${event}`);

    // Only process incoming text messages
    if (event !== 'messages.upsert') {
      return res.status(200).json({ status: 'ignored', event });
    }

    const data = body.data;
    if (!data) {
      return res.status(200).json({ status: 'no_data' });
    }

    // Extract message info
    const remoteJid = data.key?.remoteJid || '';
    const fromMe = data.key?.fromMe || false;
    const messageType = data.messageType || '';

    // ─── CRITICAL: Ignore ALL group messages ───────────
    if (remoteJid.includes('@g.us')) {
      console.log(`[Webhook] Ignoring group message from: ${remoteJid}`);
      return res.status(200).json({ status: 'ignored_group' });
    }

    // Ignore messages sent by us
    if (fromMe) {
      return res.status(200).json({ status: 'ignored_from_me' });
    }

    // Ignore non-text messages (images, audio, video, stickers, etc.)
    // For now we only handle text. We can add image support later for payment receipts.
    const messageText = data.message?.conversation
      || data.message?.extendedTextMessage?.text
      || '';

    if (!messageText.trim()) {
      // If it's an audio, politely tell them we only read text
      if (messageType === 'audioMessage' || messageType === 'pttMessage') {
        const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
        await sendWhatsAppMessage(phoneNumber, '¡Hola! 🙏 Disculpa, por el momento solo puedo leer mensajes de texto. ¿Podrías escribirme tu pedido o consulta? ¡Gracias!');
        return res.status(200).json({ status: 'audio_reply_sent' });
      }

      console.log(`[Webhook] No text content in message type: ${messageType}`);
      return res.status(200).json({ status: 'no_text' });
    }

    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
    console.log(`[Webhook] Processing message from ${phoneNumber}: "${messageText.substring(0, 50)}..."`);

    // ─── Fetch live menu from Supabase ─────────────────
    const menuItems = await fetchMenuItems();

    // ─── Build system prompt ───────────────────────────
    const systemPrompt = buildSystemPrompt(menuItems);

    // ─── Get conversation history ──────────────────────
    const history = getConversation(phoneNumber);
    addToConversation(phoneNumber, 'user', messageText);

    // ─── Call Gemini ────────────────────────────────────
    const aiResponse = await callGemini(systemPrompt, messageText, history);

    if (!aiResponse) {
      await sendWhatsAppMessage(phoneNumber, '¡Hola! 🍕 Disculpa, estamos teniendo un pequeño problema técnico. ¿Podrías intentar de nuevo en un momento? ¡Gracias por tu paciencia!');
      return res.status(200).json({ status: 'ai_error' });
    }

    // Clean up AI response (remove any JSON artifacts if Gemini outputs JSON despite instructions)
    let cleanResponse = aiResponse.trim();
    try {
      const parsed = JSON.parse(cleanResponse);
      if (parsed.replyText) {
        cleanResponse = parsed.replyText;
      }
    } catch {
      // Not JSON, use as-is (expected behavior)
    }

    // Save bot response to conversation history
    addToConversation(phoneNumber, 'model', cleanResponse);

    // ─── Anti-spam delay (1-3 seconds random) ──────────
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // ─── Send response via Evolution API ───────────────
    await sendWhatsAppMessage(phoneNumber, cleanResponse);

    console.log(`[Webhook] Response sent to ${phoneNumber}`);
    return res.status(200).json({ status: 'ok', phone: phoneNumber });

  } catch (error) {
    console.error('[Webhook] Unhandled error:', error);
    return res.status(200).json({ status: 'error', message: error.message });
  }
}
