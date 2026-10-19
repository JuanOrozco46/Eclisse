const {
  getSupabase,
  setSupabaseClientForTesting,
  getRequiredEnv,
  timingSafeMatch,
  processedMessages,
  configCache,
  menuCache,
  conversationMemCache,
} = require('./_lib/cache');

const {
  OPEN_HOUR,
  CLOSE_HOUR,
  DELIVERY_FEES,
  DEFAULT_MENU,
  getBogotaHour,
  isOpen,
  fetchMenuItems,
  resolveMenuItem,
  isMenuRequest,
  isCurtMessage,
} = require('./_lib/menu');

const {
  BotTurnSchema,
  logBotEvent,
  getConversationState,
  addToConversation,
  computeOrderFingerprint,
  calculateOrderFromStructuredData,
  parseConfirmedOrder,
  findActiveOrderForPhone,
  persistValidatedOrder,
  attachReceiptToActiveOrder,
} = require('./_lib/orders');

const {
  sendWhatsAppMessage,
  sendWhatsAppImage,
  sendAdminAlert,
  fetchFullReceiptMedia,
} = require('./_lib/whatsapp');

const {
  DEFAULT_BOT_RULES,
  normalizeBotRules,
  fetchBotConfig,
  buildSystemPrompt,
  validateTurnOutput,
  generateValidatedBotTurn,
} = require('./_lib/gemini');

// ─── Handler principal ────────────────────────────────────────
const handler = async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,x-webhook-secret,x-api-key'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. Validar variables de entorno obligatorias (fail-fast)
  let env;
  try {
    env = getRequiredEnv();
  } catch (envError) {
    console.error('Configuración de servidor incompleta en api/index.js:', envError.message);
    return res.status(500).json({ error: `Server configuration error: ${envError.message}` });
  }

  // ── GET /api?action=bust-cache — invalida el caché del menú desde el dashboard ──
  if (req.method === 'GET') {
    if (req.query?.action === 'bust-cache') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const incomingSecret = (req.headers['x-webhook-secret'] || req.headers['x-api-key'] || req.query?.secret || '').toString();

      let authorized = timingSafeMatch(incomingSecret, env.WEBHOOK_SECRET);
      if (!authorized && token) {
        const { data: { user }, error } = await getSupabase().auth.getUser(token);
        if (!error && user) authorized = true;
      }

      if (!authorized) {
        return res.status(401).json({ error: 'Unauthorized cache invalidation request' });
      }

      menuCache.invalidate();
      configCache.invalidate();
      return res.status(200).json({ status: 'cache_cleared' });
    }
    return res.status(200).send('Eclisse WhatsApp Bot activo ✅');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── POST /api?action=playground — simula turno real del bot desde el dashboard ──
  if (req.query?.action === 'playground' || req.body?.action === 'playground') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const incomingSecret = (req.headers['x-webhook-secret'] || req.headers['x-api-key'] || req.query?.secret || '').toString();

    let authorized = timingSafeMatch(incomingSecret, env.WEBHOOK_SECRET);
    if (!authorized && token) {
      const { data: { user }, error } = await getSupabase().auth.getUser(token);
      if (!error && user) authorized = true;
    }

    if (!authorized) {
      return res.status(401).json({ error: 'Unauthorized playground request' });
    }

    const userMessage = String(req.body?.message || '').trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'Missing message parameter' });
    }

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter(h => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
      .slice(-12);

    const [storedConfig, menuItems] = await Promise.all([
      fetchBotConfig(env.FALLBACK_GEMINI_KEY),
      fetchMenuItems(),
    ]);

    const overrideCfg = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};
    const effectiveConfig = {
      ...storedConfig,
      primaryModel:   overrideCfg.primaryModel   || storedConfig.primaryModel,
      secondaryModel: overrideCfg.secondaryModel || storedConfig.secondaryModel,
      tertiaryModel:  overrideCfg.tertiaryModel  || storedConfig.tertiaryModel,
      systemPrompt:   overrideCfg.systemPrompt !== undefined ? overrideCfg.systemPrompt : storedConfig.systemPrompt,
      geminiApiKey:   overrideCfg.geminiApiKey   || storedConfig.geminiApiKey || env.FALLBACK_GEMINI_KEY,
      openHour:       overrideCfg.openHour       !== undefined ? Number(overrideCfg.openHour)       : storedConfig.openHour,
      closeHour:      overrideCfg.closeHour      !== undefined ? Number(overrideCfg.closeHour)      : storedConfig.closeHour,
      armeniaFee:     overrideCfg.armeniaFee     !== undefined ? Number(overrideCfg.armeniaFee)     : storedConfig.armeniaFee,
      outskirtsFee:   overrideCfg.outskirtsFee   !== undefined ? Number(overrideCfg.outskirtsFee)   : storedConfig.outskirtsFee,
      nequiPhone:     overrideCfg.nequiPhone     || storedConfig.nequiPhone,
    };

    const systemPrompt = buildSystemPrompt(menuItems, effectiveConfig.systemPrompt, null, effectiveConfig);
    const turnResult = await generateValidatedBotTurn({
      systemPrompt,
      userMessage,
      history,
      config: effectiveConfig,
      menuItems,
      phone: '573000000000',
      pushName: 'Cliente Playground',
      imagePart: null,
      messageId: 'PLAYGROUND_' + Date.now(),
    });

    if (!turnResult.ok) {
      return res.status(502).json({ error: turnResult.reason });
    }

    const { turn, calculatedOrder } = turnResult;
    let formattedReply = turn.reply.trim();

    if ((turn.intent === 'CONFIRM_ORDER' || turn.intent === 'UPDATE_ORDER') && calculatedOrder?.valid) {
      const { order: builtOrder, deliveryFee } = calculatedOrder;
      const itemsSummary = builtOrder.items
        .map(i => `• ${i.quantity}x ${i.name} ($${(i.price * i.quantity).toLocaleString('es-CO')})`)
        .join('\n');
      const deliveryLine = deliveryFee > 0
        ? `🛵 Domicilio: $${deliveryFee.toLocaleString('es-CO')}`
        : `🏪 Recogida en local: $0`;
      formattedReply =
        `${formattedReply}\n\n` +
        `🧾 *Resumen simulado #${String(builtOrder.id).slice(-4).toUpperCase()}:*\n${itemsSummary}\n${deliveryLine}\n` +
        `💰 *Total calculado en servidor: $${builtOrder.total.toLocaleString('es-CO')} COP* (${builtOrder.payment_method})`;
    }

    return res.status(200).json({
      status: 'ok',
      reply: formattedReply,
      intent: turn.intent,
      usedModel: turnResult.usedModel || effectiveConfig.primaryModel,
      calculatedOrder: calculatedOrder || null,
    });
  }

  // 2. Validar WEBHOOK_SECRET obligatorio en cada request al webhook
  const incomingSecret = (
    req.headers['x-webhook-secret'] ||
    req.headers['x-api-key'] ||
    req.query?.secret ||
    ''
  ).toString();

  if (!incomingSecret || !timingSafeMatch(incomingSecret, env.WEBHOOK_SECRET)) {
    return res.status(403).json({ error: 'Unauthorized webhook request' });
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
    const pushName    = data.pushName || null;

    if (remoteJid.includes('@g.us') || fromMe) return res.status(200).json({ status: 'ignored' });

    // Dedup por messageId de WhatsApp
    if (messageId && processedMessages.has(messageId)) {
      return res.status(200).json({ status: 'duplicate_ignored' });
    }
    if (messageId) processedMessages.set(messageId, true);

    const messageText = (
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      data.message?.imageMessage?.caption ||
      ''
    ).trim();
    const phone     = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
    const sendToJid = remoteJid;

    // ── Descargar media completo si el cliente envió imagen (comprobante Nequi) ──
    let imagePart = null;
    if (data.message?.imageMessage) {
      imagePart = await fetchFullReceiptMedia(env, data);
    }

    // ── Sin texto ni imagen → ignorar (excepto audio) ─────────────────────
    if (!messageText && !imagePart) {
      if (messageType === 'audioMessage' || messageType === 'pttMessage' || data.message?.audioMessage) {
        await logBotEvent(phone, messageId, 'RECEIVED', null, { type: 'audio' });
        await sendWhatsAppMessage(env, sendToJid, 'Solo puedo leer texto 😊 ¿Me escribís el pedido?');
        return res.status(200).json({ status: 'audio_handled' });
      }
      return res.status(200).json({ status: 'no_content' });
    }

    // Registrar recepción en bot_events
    await logBotEvent(phone, messageId, 'RECEIVED', null, {
      pushName,
      hasImage: Boolean(imagePart),
      imageSource: imagePart?.source || null,
      textPreview: messageText.slice(0, 120),
    });

    // ── Saludos cortos / agradecimientos → silencio (solo si no hay imagen) ──
    if (!imagePart && isCurtMessage(messageText)) {
      return res.status(200).json({ status: 'curt_ignored' });
    }

    // ── Cargar configuración activa del bot (caché 60s) para horario y reglas ──
    const botConfig = await fetchBotConfig(env.FALLBACK_GEMINI_KEY);
    const activeOpenHour  = Number.isFinite(Number(botConfig.openHour))  ? Number(botConfig.openHour)  : OPEN_HOUR;
    const activeCloseHour = Number.isFinite(Number(botConfig.closeHour)) ? Number(botConfig.closeHour) : CLOSE_HOUR;

    // ── CIERRE: si el restaurante está cerrado, respuesta fija sin Gemini ──
    if (!handler.isOpen(null, activeOpenHour, activeCloseHour)) {
      const hour = getBogotaHour();
      const fmtH = (h) => `${h > 12 ? h - 12 : (h === 0 ? 12 : h)} ${h >= 12 ? 'PM' : 'AM'}`;
      const msg = hour >= activeCloseHour
        ? `Ya cerramos por esta noche 😔 Abrimos mañana a las ${fmtH(activeOpenHour)}. ¡Nos vemos!`
        : `Aún no abrimos, nuestro horario es de ${fmtH(activeOpenHour)} a ${fmtH(activeCloseHour)} 🍕 ¿Te puedo ayudar con algo de igual forma?`;
      await sendWhatsAppMessage(env, sendToJid, msg);
      await logBotEvent(phone, messageId, 'RESPONDED', null, { closedReply: true });
      return res.status(200).json({ status: 'closed_reply' });
    }

    // ── Menú → imagen directa (solo si no viene imagen del cliente) ──
    if (!imagePart && isMenuRequest(messageText)) {
      await addToConversation(phone, 'user', messageText);
      await sendWhatsAppImage(env, sendToJid, env.MENU_IMAGE_URL, '');
      await addToConversation(phone, 'model', 'Aquí está nuestra carta 🍕');
      await logBotEvent(phone, messageId, 'MENU_SENT', null, {});
      return res.status(200).json({ status: 'menu_sent' });
    }

    // ── Preparar contexto e historial para Gemini ──
    const userContent = imagePart
      ? (messageText || 'El cliente envió una imagen de comprobante de pago.')
      : messageText;

    await addToConversation(phone, 'user', userContent);
    const convState = await getConversationState(phone);
    const [menuItems, existingActiveOrder] = await Promise.all([
      fetchMenuItems(),
      findActiveOrderForPhone(phone, convState.activeOrderId),
    ]);

    const systemPrompt = buildSystemPrompt(menuItems, botConfig.systemPrompt, existingActiveOrder, botConfig);

    const turnResult = await generateValidatedBotTurn({
      systemPrompt,
      userMessage: userContent,
      history: convState.messages.slice(0, -1),
      config: botConfig,
      menuItems,
      phone,
      pushName,
      imagePart,
      messageId,
    });

    // ── Si falló Gemini o la validación tras re-prompt → alerta a Admin + respuesta segura ──
    if (!turnResult.ok) {
      await sendAdminAlert(env, {
        phone,
        pushName,
        messageId,
        reason: turnResult.reason,
        messageText: userContent,
        details: { rawSample: turnResult.rawSample || null },
      });
      const fallback = 'Perdón, tuve un problema técnico procesando tu mensaje 🙏 Ya le avisé al equipo para atenderte de inmediato.';
      await sendWhatsAppMessage(env, sendToJid, fallback);
      return res.status(200).json({ status: 'gemini_fallback', error: turnResult.reason });
    }

    const { turn, calculatedOrder } = turnResult;
    let clientReply = turn.reply.trim();

    // ── Caso 1: El modelo solicitó enviar el menú ──
    if (turn.intent === 'SEND_MENU' && !imagePart) {
      await sendWhatsAppImage(env, sendToJid, env.MENU_IMAGE_URL, clientReply);
      await addToConversation(phone, 'model', clientReply);
      await logBotEvent(phone, messageId, 'MENU_SENT', null, { viaIntent: true });
      return res.status(200).json({ status: 'menu_sent' });
    }

    // ── Caso 2: El cliente envió foto de comprobante Nequi ──
    if (imagePart) {
      const linkedOrderId = await attachReceiptToActiveOrder(
        phone,
        convState.activeOrderId,
        imagePart,
        turn.receiptReview
      );
      await logBotEvent(phone, messageId, 'RECEIPT_RECEIVED', linkedOrderId, {
        imageSource: imagePart.source,
        receiptReview: turn.receiptReview || null,
      });
    }

    // ── Caso 3: Confirmación o actualización de pedido con total calculado en servidor ──
    if ((turn.intent === 'CONFIRM_ORDER' || turn.intent === 'UPDATE_ORDER') && calculatedOrder?.valid) {
      const { order: builtOrder, subtotal, deliveryFee } = calculatedOrder;

      await logBotEvent(phone, messageId, 'ORDER_CONFIRMED', builtOrder.id, {
        intent: turn.intent,
        subtotal,
        deliveryFee,
        total: builtOrder.total,
        itemsCount: builtOrder.items.length,
      });

      const persistResult = await persistValidatedOrder({
        phone,
        messageText: userContent,
        intent: turn.intent,
        builtOrder,
        convState,
        existingActiveOrder,
      });

      if (persistResult.action === 'ERROR') {
        await sendAdminAlert(env, {
          phone,
          pushName,
          messageId,
          reason: `No se pudo guardar el pedido en Supabase: ${persistResult.error}`,
          messageText: userContent,
          details: { order: builtOrder },
        });
      } else if (persistResult.action === 'INSERTED' || persistResult.action === 'UPDATED') {
        const finalOrderId = persistResult.orderId;
        await addToConversation(phone, 'model', clientReply, {
          activeOrderId: finalOrderId,
          lastFingerprint: builtOrder.order_fingerprint,
        });

        await logBotEvent(
          phone,
          messageId,
          persistResult.action === 'UPDATED' ? 'ORDER_UPDATED' : 'ORDER_INSERTED',
          finalOrderId,
          { total: builtOrder.total, paymentMethod: builtOrder.payment_method }
        );

        // Si hubo comprobante en el mismo mensaje de confirmación, vincularlo
        if (imagePart) {
          await attachReceiptToActiveOrder(phone, finalOrderId, imagePart, turn.receiptReview);
        }

        // Asegurar que el cliente siempre vea el desglose y total calculado por el servidor
        const itemsSummary = builtOrder.items
          .map(i => `• ${i.quantity}x ${i.name} ($${(i.price * i.quantity).toLocaleString('es-CO')})`)
          .join('\n');
        const deliveryLine = deliveryFee > 0
          ? `🛵 Domicilio: $${deliveryFee.toLocaleString('es-CO')}`
          : `🏪 Recogida en local: $0`;
        const actionTitle = persistResult.action === 'UPDATED'
          ? `🔄 *Pedido #${String(finalOrderId).slice(-4).toUpperCase()} actualizado:*`
          : `🧾 *Resumen de tu pedido #${String(finalOrderId).slice(-4).toUpperCase()}:*`;

        clientReply =
          `${clientReply}\n\n` +
          `${actionTitle}\n${itemsSummary}\n${deliveryLine}\n` +
          `💰 *Total a pagar: $${builtOrder.total.toLocaleString('es-CO')} COP* (${builtOrder.payment_method})`;

        await sendWhatsAppMessage(env, sendToJid, clientReply);
        await logBotEvent(phone, messageId, 'RESPONDED', finalOrderId, { action: persistResult.action });
        return res.status(200).json({ status: 'ok', orderAction: persistResult.action, orderId: finalOrderId });
      }
    }

    // ── Respuesta normal de conversación ──
    await addToConversation(phone, 'model', clientReply);
    if (clientReply) {
      await sendWhatsAppMessage(env, sendToJid, clientReply);
    }
    await logBotEvent(phone, messageId, 'RESPONDED', convState.activeOrderId || null, { intent: turn.intent });

    return res.status(200).json({ status: 'ok', intent: turn.intent });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Exportar funciones puras y utilidades de test sin romper el handler de Vercel
handler.parseConfirmedOrder              = parseConfirmedOrder;
handler.calculateOrderFromStructuredData = calculateOrderFromStructuredData;
handler.computeOrderFingerprint          = computeOrderFingerprint;
handler.resolveMenuItem                  = resolveMenuItem;
handler.validateTurnOutput               = validateTurnOutput;
handler.isMenuRequest                    = isMenuRequest;
handler.isCurtMessage                    = isCurtMessage;
handler.isOpen                           = isOpen;
handler.OPEN_HOUR                        = OPEN_HOUR;
handler.CLOSE_HOUR                       = CLOSE_HOUR;
handler.DELIVERY_FEES                    = DELIVERY_FEES;
handler.DEFAULT_MENU                     = DEFAULT_MENU;
handler.BotTurnSchema                    = BotTurnSchema;
handler.setSupabaseClientForTesting      = setSupabaseClientForTesting;
handler.processedMessages                = processedMessages;
handler.menuCache                        = menuCache;
handler.configCache                      = configCache;
handler.conversationMemCache             = conversationMemCache;
handler.DEFAULT_BOT_RULES                = DEFAULT_BOT_RULES;
handler.normalizeBotRules                = normalizeBotRules;
handler.buildSystemPrompt                = buildSystemPrompt;

module.exports = handler;
