const { getSupabase, configCache } = require('./cache');
const { OPEN_HOUR, CLOSE_HOUR, DELIVERY_FEES, getBogotaHour } = require('./menu');
const {
  BotTurnSchema,
  GEMINI_RESPONSE_SCHEMA,
  calculateOrderFromStructuredData,
  logBotEvent,
} = require('./orders');

const LEGACY_PLACEHOLDER_PREFIX = 'Tu nombre es Luisa y eres la anfitriona virtual de Eclisse Pizza Napoletana';

const DEFAULT_BOT_RULES = `Sos Luisa, anfitriona virtual de Eclisse Pizza Napoletana (Armenia, Quindío). Solo domicilios y recogida en Calle 2 Norte #18-144.

REGLAS DE ATENCIÓN Y ESTILO:
- Respuestas cortas de máximo 1 a 2 líneas, directas y naturales como en WhatsApp.
- Usa emojis con moderación solo cuando aporten calidez.
- No repitas información que ya diste en la conversación.
- Nunca envíes la carta escrita en texto; si piden ver el menú o la carta, envía la imagen de la carta.

FLUJO PARA TOMAR UN PEDIDO (haz UNA pregunta a la vez):
1. Confirma qué pizzas o bebidas desea y las cantidades.
2. Pregunta la dirección exacta de entrega en Armenia/alrededores (o si pasa a recoger al local).
3. Pregunta el método de pago: Efectivo o Nequi (si elige Nequi, indícale el número de Nequi y pídele foto del comprobante).
4. Cuando tengas productos, dirección y medio de pago completos, confirma el pedido indicando el tiempo estimado (35-40 min para domicilio, 20-25 min para recogida en base).`;

function normalizeBotRules(rawPrompt) {
  const trimmed = String(rawPrompt || '').trim();
  if (!trimmed || trimmed.startsWith(LEGACY_PLACEHOLDER_PREFIX)) {
    return DEFAULT_BOT_RULES;
  }
  return trimmed;
}

// ─── Fetch Bot Config (cacheado 5 min) ───────────────────────
async function fetchBotConfig(fallbackGeminiKey) {
  const cached = configCache.get('config');
  if (cached) return cached;
  try {
    const { data } = await getSupabase()
      .from('rappi_config').select('*').eq('id', 'bot_config').maybeSingle();
    if (data && data.api_key) {
      const p = JSON.parse(data.api_key);
      const cfg = {
        geminiApiKey:       p.geminiApiKey   || fallbackGeminiKey,
        primaryModel:       p.primaryModel   || 'gemini-2.5-flash',
        secondaryModel:     p.secondaryModel || 'gemini-2.5-pro',
        tertiaryModel:      p.tertiaryModel  || 'gemini-1.5-flash',
        systemPrompt:       normalizeBotRules(p.systemPrompt),
        openHour:           Number.isFinite(Number(p.openHour))     ? Number(p.openHour)     : OPEN_HOUR,
        closeHour:          Number.isFinite(Number(p.closeHour))    ? Number(p.closeHour)    : CLOSE_HOUR,
        armeniaFee:         Number.isFinite(Number(p.armeniaFee))   ? Number(p.armeniaFee)   : DELIVERY_FEES.ARMENIA,
        outskirtsFee:       Number.isFinite(Number(p.outskirtsFee)) ? Number(p.outskirtsFee) : DELIVERY_FEES.OUTSKIRTS,
        nequiPhone:         p.nequiPhone         || '3223119008',
        whatsappOrderPhone: p.whatsappOrderPhone || '573004057195',
      };
      configCache.set('config', cfg);
      return cfg;
    }
  } catch (e) {
    console.error('fetchBotConfig:', e.message);
  }
  const fb = {
    geminiApiKey:       fallbackGeminiKey,
    primaryModel:       'gemini-2.5-flash',
    secondaryModel:     'gemini-2.5-pro',
    tertiaryModel:      'gemini-1.5-flash',
    systemPrompt:       DEFAULT_BOT_RULES,
    openHour:           OPEN_HOUR,
    closeHour:          CLOSE_HOUR,
    armeniaFee:         DELIVERY_FEES.ARMENIA,
    outskirtsFee:       DELIVERY_FEES.OUTSKIRTS,
    nequiPhone:         '3223119008',
    whatsappOrderPhone: '573004057195',
  };
  configCache.set('config', fb);
  return fb;
}

// ─── System prompt con Reglas del Admin + Contrato JSON ──────
function buildSystemPrompt(menuItems, customPrompt, activeOrderSummary = null, businessConfig = null) {
  const openH        = Number.isFinite(Number(businessConfig?.openHour))     ? Number(businessConfig.openHour)     : OPEN_HOUR;
  const closeH       = Number.isFinite(Number(businessConfig?.closeHour))    ? Number(businessConfig.closeHour)    : CLOSE_HOUR;
  const armeniaFee   = Number.isFinite(Number(businessConfig?.armeniaFee))   ? Number(businessConfig.armeniaFee)   : DELIVERY_FEES.ARMENIA;
  const outskirtsFee = Number.isFinite(Number(businessConfig?.outskirtsFee)) ? Number(businessConfig.outskirtsFee) : DELIVERY_FEES.OUTSKIRTS;
  const nequiPhone   = businessConfig?.nequiPhone || '3223119008';

  const formatHour12 = (h) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };
  const openLabel  = formatHour12(openH);
  const closeLabel = formatHour12(closeH);

  const hour = getBogotaHour();
  let timeNote = '';
  if (hour < openH) {
    timeNote = `\nNOTA HORARIA ACTUAL: Aún no abrimos (abrimos a las ${openLabel}). Puedes responder dudas o tomar pedidos anticipados.`;
  }

  const catalog = menuItems
    .map(i => `• [id: "${i.id}"] ${i.name} — $${Number(i.price || 0).toLocaleString('es-CO')}${i.description ? ` (${i.description})` : ''}`)
    .join('\n');

  const activeOrderNote = activeOrderSummary
    ? `\nPEDIDO ACTIVO ACTUAL DEL CLIENTE (ID ${activeOrderSummary.id}):\n- Dirección: ${activeOrderSummary.table}\n- Pago: ${activeOrderSummary.payment_method}\n- Ítems: ${JSON.stringify(activeOrderSummary.items)}\nSi el cliente pide cambiar, agregar o quitar algo de este pedido, usa intent = "UPDATE_ORDER" con la lista completa actualizada de ítems. Si pide hacer un pedido aparte nuevo, usa intent = "CONFIRM_ORDER".`
    : '';

  const rulesBlock = normalizeBotRules(customPrompt);

  return `=== REGLAS PRINCIPALES Y PERSONALIDAD DE LUISA (CONFIGURADAS POR EL ADMINISTRADOR) ===
${rulesBlock}
${timeNote}${activeOrderNote}

=== PARÁMETROS OFICIALES DEL NEGOCIO ===
- Horario de atención: ${openLabel} a ${closeLabel} todos los días.
- Tarifas de domicilio: Armenia $${armeniaFee.toLocaleString('es-CO')} | Afueras/Alrededores (Circasia, Calarcá, El Caimo, Club Campestre) $${outskirtsFee.toLocaleString('es-CO')} | Recogida en base (Calle 2 Norte #18-144): $0.
- Pagos aceptados: Efectivo o transferencia Nequi al número ${nequiPhone}.

=== CARTA DISPONIBLE EN TIEMPO REAL (USA ESTOS menuItemId Y name EXACTOS) ===
${catalog}

=== CONTRATO TÉCNICO DE SALIDA JSON (OBLIGATORIO) ===
- Responde SIEMPRE en JSON válido cumpliendo el esquema estructurado.
- Nunca escribas bloques técnicos como PEDIDO_CONFIRMADO dentro de "reply".
- Si el cliente pide ver la carta/menú, usa intent = "SEND_MENU" y en "reply" pon un mensaje corto como "Aquí está nuestra carta 🍕".
- Mientras estés conversando o haciendo preguntas para completar datos del pedido, usa intent = "CHAT".
- Cuando el cliente ya haya definido productos, dirección (o recogida) y método de pago (Efectivo o Nequi), usa intent = "CONFIRM_ORDER" (o "UPDATE_ORDER" si modifica un pedido activo) y llena el objeto "order" clasificando deliveryType en "ARMENIA", "OUTSKIRTS" o "PICKUP". El servidor calculará y adjuntará el total automáticamente.
- Cuando recibas una imagen de comprobante de pago Nequi, usa intent = "RECEIPT_VERIFICATION" y completa "receiptReview" verificando destinatario (${nequiPhone}), monto en detectedAmount, fecha de hoy y marcando isValidPreliminary (true/false).`.trim();
}

// ─── Llamada a Gemini con JSON estructurado + Re-prompt con Zod ─
async function callGeminiStructured(systemPrompt, contents, config) {
  const san = (m) => m ? m.toLowerCase().replace(/^gemini1-/, 'gemini-').trim() : '';
  const models = [...new Set([
    san(config.primaryModel),
    san(config.secondaryModel),
    san(config.tertiaryModel),
    'gemini-2.5-flash',
    'gemini-1.5-flash',
  ].filter(Boolean))];

  const errors = [];

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
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 500,
              responseMimeType: 'application/json',
              responseSchema: GEMINI_RESPONSE_SCHEMA,
            },
          }),
        }
      );
      if (!res.ok) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error?.message) errDetail = errJson.error.message;
        } catch {}
        errors.push(`${model}: ${errDetail}`);
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        if (config && typeof config === 'object') {
          config._lastUsedModel = model;
        }
        return text;
      }
      errors.push(`${model}: respuesta vacía`);
    } catch (e) {
      errors.push(`${model}: ${e.message}`);
      console.error(`Gemini ${model}:`, e.message);
    }
  }
  if (config && typeof config === 'object') {
    config._lastErrors = errors;
  }
  return null;
}

function validateTurnOutput(rawJsonText, menuItems, phone, pushName, customDeliveryFees = null) {
  let parsedObj;
  try {
    const cleaned = String(rawJsonText || '')
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsedObj = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: `JSON malformado: ${e.message}` };
  }

  const zodResult = BotTurnSchema.safeParse(parsedObj);
  if (!zodResult.success) {
    const issues = zodResult.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Error de esquema Zod: ${issues}` };
  }

  const turn = zodResult.data;

  // Si el modelo indica confirmación o modificación de pedido, validar y calcular total en servidor
  if (turn.intent === 'CONFIRM_ORDER' || turn.intent === 'UPDATE_ORDER') {
    const calc = calculateOrderFromStructuredData(turn.order, menuItems, phone, pushName, customDeliveryFees);
    if (!calc.valid) {
      return { ok: false, error: calc.error };
    }
    return { ok: true, turn, calculatedOrder: calc };
  }

  return { ok: true, turn, calculatedOrder: null };
}

async function generateValidatedBotTurn({
  systemPrompt,
  userMessage,
  history,
  config,
  menuItems,
  phone,
  pushName,
  imagePart,
  messageId,
}) {
  const userParts = imagePart
    ? [{ inlineData: { mimeType: imagePart.mimeType, data: imagePart.data } }, { text: userMessage || 'Verificá este comprobante de pago.' }]
    : [{ text: userMessage }];

  const baseContents = [
    ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: userParts },
  ];

  const customFees = config ? { ARMENIA: config.armeniaFee, OUTSKIRTS: config.outskirtsFee } : null;

  // Intento 1
  const firstRaw = await callGeminiStructured(systemPrompt, baseContents, config);
  if (!firstRaw) {
    const detail = Array.isArray(config?._lastErrors) && config._lastErrors.length > 0
      ? ` (${config._lastErrors[0]})`
      : '';
    return { ok: false, reason: `Todos los modelos de Gemini fallaron al responder${detail}.` };
  }

  const firstValidation = validateTurnOutput(firstRaw, menuItems, phone, pushName, customFees);
  if (firstValidation.ok) {
    return { ok: true, usedModel: config?._lastUsedModel || config?.primaryModel, ...firstValidation };
  }

  // Intento 2: Re-prompt automático con el error específico de Zod / catálogo
  await logBotEvent(phone, messageId, 'VALIDATION_RETRY', null, {
    error: firstValidation.error,
    rawSample: String(firstRaw).slice(0, 300),
  });

  const retryContents = [
    ...baseContents,
    { role: 'model', parts: [{ text: String(firstRaw) }] },
    {
      role: 'user',
      parts: [{
        text: `[CORRECCIÓN AUTOMÁTICA DE SISTEMA]: Tu JSON anterior no pasó la validación: ${firstValidation.error}. Devuelve ÚNICAMENTE el JSON corregido respetando el schema y usando los menuItemId y name exactos de la CARTA.`,
      }],
    },
  ];

  const secondRaw = await callGeminiStructured(systemPrompt, retryContents, config);
  if (!secondRaw) {
    return { ok: false, reason: `Fallo en re-prompt tras error de validación: ${firstValidation.error}` };
  }

  const secondValidation = validateTurnOutput(secondRaw, menuItems, phone, pushName, customFees);
  if (secondValidation.ok) {
    return { ok: true, usedModel: config?._lastUsedModel || config?.primaryModel, ...secondValidation };
  }

  return {
    ok: false,
    reason: `JSON inválido tras re-prompt: ${secondValidation.error}`,
    rawSample: String(secondRaw).slice(0, 300),
  };
}

module.exports = {
  DEFAULT_BOT_RULES,
  normalizeBotRules,
  fetchBotConfig,
  buildSystemPrompt,
  callGeminiStructured,
  validateTurnOutput,
  generateValidatedBotTurn,
};
