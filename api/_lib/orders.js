const crypto = require('crypto');
const { z } = require('zod');
const { getSupabase, conversationMemCache } = require('./cache');
const { DELIVERY_FEES, normalizeText, resolveMenuItem } = require('./menu');

// ─── Schemas Zod y JSON Schema para salida estructurada de Gemini ─
const OrderItemSchema = z.object({
  menuItemId: z.string().min(1),
  name:       z.string().min(1),
  quantity:   z.number().int().min(1).max(50),
  note:       z.string().optional().default(''),
});

const StructuredOrderSchema = z.object({
  deliveryType:  z.enum(['ARMENIA', 'OUTSKIRTS', 'PICKUP']),
  address:       z.string().min(3),
  paymentMethod: z.enum(['Efectivo', 'Nequi']),
  items:         z.array(OrderItemSchema).min(1),
});

const ReceiptReviewSchema = z.object({
  isValidPreliminary: z.boolean(),
  detectedAmount:     z.number().nullable().optional(),
  detectedRecipient:  z.string().nullable().optional(),
  reason:             z.string(),
});

const BotTurnSchema = z.object({
  reply:         z.string().min(1),
  intent:        z.enum(['CHAT', 'SEND_MENU', 'CONFIRM_ORDER', 'UPDATE_ORDER', 'RECEIPT_VERIFICATION']),
  order:         StructuredOrderSchema.nullable().optional(),
  receiptReview: ReceiptReviewSchema.nullable().optional(),
});

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['reply', 'intent'],
  properties: {
    reply: {
      type: 'STRING',
      description: 'Mensaje corto (1-2 líneas) directo y natural para enviar al cliente por WhatsApp. Sin bloques técnicos.',
    },
    intent: {
      type: 'STRING',
      enum: ['CHAT', 'SEND_MENU', 'CONFIRM_ORDER', 'UPDATE_ORDER', 'RECEIPT_VERIFICATION'],
      description: 'CONFIRM_ORDER cuando el cliente ya dio productos, dirección y método de pago. UPDATE_ORDER si modifica un pedido ya confirmado. RECEIPT_VERIFICATION si envió foto de comprobante.',
    },
    order: {
      type: 'OBJECT',
      nullable: true,
      required: ['deliveryType', 'address', 'paymentMethod', 'items'],
      properties: {
        deliveryType: {
          type: 'STRING',
          enum: ['ARMENIA', 'OUTSKIRTS', 'PICKUP'],
        },
        address: {
          type: 'STRING',
          description: 'Dirección exacta en Armenia/afueras, o "Recogida en local" si es PICKUP.',
        },
        paymentMethod: {
          type: 'STRING',
          enum: ['Efectivo', 'Nequi'],
        },
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            required: ['menuItemId', 'name', 'quantity', 'note'],
            properties: {
              menuItemId: { type: 'STRING' },
              name:       { type: 'STRING' },
              quantity:   { type: 'INTEGER' },
              note:       { type: 'STRING' },
            },
          },
        },
      },
    },
    receiptReview: {
      type: 'OBJECT',
      nullable: true,
      required: ['isValidPreliminary', 'reason'],
      properties: {
        isValidPreliminary: { type: 'BOOLEAN' },
        detectedAmount:     { type: 'NUMBER', nullable: true },
        detectedRecipient:  { type: 'STRING', nullable: true },
        reason:             { type: 'STRING' },
      },
    },
  },
};

// ─── Trazabilidad (bot_events) ────────────────────────────────
async function logBotEvent(phone, messageId, stage, orderId = null, details = {}) {
  try {
    await getSupabase()
      .from('bot_events')
      .insert({
        phone:      phone || 'unknown',
        message_id: messageId || null,
        stage,
        order_id:   orderId || null,
        details:    details || {},
      });
  } catch (e) {
    console.error('logBotEvent error:', e.message);
  }
}

// ─── Historial de conversación + estado de pedido activo ──────
async function getConversationState(phone) {
  const mem = conversationMemCache.get(phone);
  if (mem) return mem;

  try {
    const { data } = await getSupabase()
      .from('bot_conversations')
      .select('messages, active_order_id, last_fingerprint')
      .eq('phone', phone)
      .maybeSingle();

    if (data) {
      const state = {
        messages:        Array.isArray(data.messages) ? data.messages : [],
        activeOrderId:   data.active_order_id || null,
        lastFingerprint: data.last_fingerprint || null,
      };
      conversationMemCache.set(phone, state);
      return state;
    }
  } catch {}

  const empty = { messages: [], activeOrderId: null, lastFingerprint: null };
  conversationMemCache.set(phone, empty);
  return empty;
}

async function saveConversationState(phone, state) {
  conversationMemCache.set(phone, state);
  try {
    await getSupabase()
      .from('bot_conversations')
      .upsert({
        phone,
        messages:         state.messages,
        active_order_id:  state.activeOrderId || null,
        last_fingerprint: state.lastFingerprint || null,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'phone' });
  } catch {
    getSupabase()
      .from('bot_conversations')
      .upsert({
        phone,
        messages:   state.messages,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'phone' })
      .then(() => {})
      .catch(() => {});
  }
}

async function addToConversation(phone, role, text, orderMeta = null) {
  const state = await getConversationState(phone);
  state.messages.push({ role, text });
  if (state.messages.length > 14) {
    state.messages.splice(0, state.messages.length - 14);
  }
  if (orderMeta) {
    if (orderMeta.activeOrderId !== undefined) state.activeOrderId = orderMeta.activeOrderId;
    if (orderMeta.lastFingerprint !== undefined) state.lastFingerprint = orderMeta.lastFingerprint;
  }
  await saveConversationState(phone, state);
}

// ─── Cálculo autoritativo de totales y fingerprint ────────────
function computeOrderFingerprint(phone, items, address, paymentMethod, deliveryType) {
  const canonicalItems = [...items]
    .map(i => `${i.menuItemId}:${i.quantity}:${normalizeText(i.note || '')}`)
    .sort()
    .join('|');
  const payload = [
    String(phone || '').replace(/\D/g, ''),
    deliveryType || 'ARMENIA',
    normalizeText(address),
    normalizeText(paymentMethod),
    canonicalItems,
  ].join('::');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

function calculateOrderFromStructuredData(structuredOrder, menuItems, phone, pushName, customDeliveryFees = null) {
  if (!structuredOrder || typeof structuredOrder !== 'object') {
    return { valid: false, error: 'El objeto order está vacío o ausente cuando intent es CONFIRM_ORDER/UPDATE_ORDER.' };
  }

  const deliveryType = ['ARMENIA', 'OUTSKIRTS', 'PICKUP'].includes(structuredOrder.deliveryType)
    ? structuredOrder.deliveryType
    : 'ARMENIA';

  const rawAddress = String(structuredOrder.address || '').trim();
  const address = deliveryType === 'PICKUP' && (!rawAddress || rawAddress.length < 3)
    ? 'Recogida en local (Calle 2 Norte #18-144)'
    : rawAddress;

  if (!address || address.length < 4) {
    return { valid: false, error: 'La dirección del pedido es inválida o demasiado corta.' };
  }

  if (!Array.isArray(structuredOrder.items) || structuredOrder.items.length === 0) {
    return { valid: false, error: 'El pedido no contiene ítems.' };
  }

  const resolvedItems = [];
  for (const rawItem of structuredOrder.items) {
    const matched = resolveMenuItem(rawItem, menuItems);
    if (!matched) {
      return {
        valid: false,
        error: `El producto "${rawItem.name || rawItem.menuItemId}" no existe en la carta disponible. Usa exactamente los IDs/nombres de la CARTA.`,
      };
    }
    const qty = Math.max(1, Math.min(50, Math.trunc(Number(rawItem.quantity) || 1)));
    const unitPrice = Number(matched.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { valid: false, error: `Precio inválido en catálogo para "${matched.name}".` };
    }

    const note = String(rawItem.note || '').trim().slice(0, 150);
    const existing = resolvedItems.find(i => i.menuItemId === String(matched.id) && i.note === note);
    if (existing) {
      existing.quantity += qty;
    } else {
      resolvedItems.push({
        menuItemId: String(matched.id),
        name:       matched.name,
        quantity:   qty,
        price:      unitPrice,
        note,
      });
    }
  }

  const fees = {
    PICKUP:    0,
    ARMENIA:   Number.isFinite(Number(customDeliveryFees?.ARMENIA))   ? Number(customDeliveryFees.ARMENIA)   : DELIVERY_FEES.ARMENIA,
    OUTSKIRTS: Number.isFinite(Number(customDeliveryFees?.OUTSKIRTS)) ? Number(customDeliveryFees.OUTSKIRTS) : DELIVERY_FEES.OUTSKIRTS,
  };

  const subtotal    = resolvedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryFee = fees[deliveryType] ?? fees.ARMENIA;
  const total       = subtotal + deliveryFee;

  const paymentMethod = structuredOrder.paymentMethod === 'Nequi' ? 'Nequi' : 'Efectivo';
  const paymentStatus = paymentMethod === 'Nequi' ? 'PENDING_VERIFICATION' : 'UNPAID';
  const fingerprint   = computeOrderFingerprint(phone, resolvedItems, address, paymentMethod, deliveryType);

  return {
    valid: true,
    subtotal,
    deliveryFee,
    deliveryType,
    order: {
      id:                'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      table:             address,
      items:             resolvedItems,
      total,
      delivery_fee:      deliveryFee,
      status:            'PENDING',
      priority:          false,
      timestamp:         Date.now(),
      source:            'WHATSAPP',
      customer_phone:    phone,
      customer_name:     pushName || null,
      delivery_status:   'NONE',
      payment_method:    paymentMethod,
      payment_status:    paymentStatus,
      order_fingerprint: fingerprint,
    },
  };
}

function parseConfirmedOrder(text, menuItems, fallbackPhone, pushName) {
  if (!text || !text.includes('PEDIDO_CONFIRMADO:')) return null;

  const block = text.substring(text.indexOf('PEDIDO_CONFIRMADO:'));
  const get = (key) => {
    const m = block.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
    return m ? m[1].replace(/\[|\]/g, '').trim() : '';
  };

  const rawItems  = get('items');
  const direccion = get('direccion');
  const pagoRaw   = get('pago') || 'Efectivo';
  const telRaw    = get('telefono').replace(/@s\.whatsapp\.net|@lid/g, '').trim();

  if (!direccion || direccion.length < 4) {
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
        name:       item.name,
        quantity:   parseInt(m[1] || m[2] || m[3], 10) || 1,
        price:      Number(item.price),
        note:       '',
      });
    }
  }

  if (parsedItems.length === 0) return null;

  const isPickup = /recog|local/i.test(direccion);
  const isOutskirts = /circasia|calarca|calarcá|tebaida|caimo|campestre|afueras/i.test(direccion);
  const deliveryType = isPickup ? 'PICKUP' : (isOutskirts ? 'OUTSKIRTS' : 'ARMENIA');

  const paymentMethod = /nequi|transfer/i.test(pagoRaw) ? 'Nequi' : 'Efectivo';
  const phone = telRaw || fallbackPhone;

  const res = calculateOrderFromStructuredData(
    { deliveryType, address: direccion, paymentMethod, items: parsedItems },
    menuItems,
    phone,
    pushName
  );
  return res.valid ? res.order : null;
}

// ─── Persistencia de pedidos: Dedup explícito + Actualización in-place ─
function isExplicitSecondOrderRequest(text) {
  const t = normalizeText(text);
  return ['otro pedido', 'segundo pedido', 'pedido adicional', 'pedido nuevo aparte', 'hacer otro pedido']
    .some(k => t.includes(k));
}

async function findActiveOrderForPhone(phone, activeOrderIdHint = null) {
  const sb = getSupabase();
  const since = Date.now() - 2 * 60 * 60 * 1000;

  if (activeOrderIdHint) {
    try {
      const { data } = await sb
        .from('orders')
        .select('*')
        .eq('id', activeOrderIdHint)
        .maybeSingle();
      if (data && ['PENDING', 'PREPARING'].includes(data.status)) {
        return data;
      }
    } catch {}
  }

  try {
    const { data } = await sb
      .from('orders')
      .select('*')
      .eq('customer_phone', phone)
      .in('status', ['PENDING', 'PREPARING'])
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(1);
    return (data && data.length > 0) ? data[0] : null;
  } catch {
    return null;
  }
}

async function insertOrderWithFallback(orderRow) {
  const sb = getSupabase();
  const { data, error } = await sb.from('orders').insert(orderRow).select('id').single();
  if (!error) return { id: data?.id || orderRow.id, error: null };

  const legacyRow = {
    id:              orderRow.id,
    table:           orderRow.table,
    items:           orderRow.items,
    total:           orderRow.total,
    status:          orderRow.status,
    priority:        orderRow.priority,
    timestamp:       orderRow.timestamp,
    source:          orderRow.source,
    customer_phone:  orderRow.customer_phone,
    customer_name:   orderRow.customer_name,
    delivery_status: orderRow.delivery_status,
    payment_method:  orderRow.payment_method,
  };
  const retry = await sb.from('orders').insert(legacyRow).select('id').single();
  return { id: retry.data?.id || orderRow.id, error: retry.error };
}

async function updateOrderWithFallback(orderId, updates) {
  const sb = getSupabase();
  const { error } = await sb.from('orders').update(updates).eq('id', orderId);
  if (!error) return { error: null };

  const legacyUpdates = {
    table:          updates.table,
    items:          updates.items,
    total:          updates.total,
    payment_method: updates.payment_method,
  };
  Object.keys(legacyUpdates).forEach(k => legacyUpdates[k] === undefined && delete legacyUpdates[k]);
  const retry = await sb.from('orders').update(legacyUpdates).eq('id', orderId);
  return { error: retry.error };
}

async function persistValidatedOrder({
  phone,
  messageText,
  intent,
  builtOrder,
  convState,
  existingActiveOrder,
}) {
  const activeOrder = existingActiveOrder !== undefined
    ? existingActiveOrder
    : await findActiveOrderForPhone(phone, convState?.activeOrderId);

  if (
    convState?.lastFingerprint === builtOrder.order_fingerprint &&
    activeOrder &&
    ['PENDING', 'PREPARING'].includes(activeOrder.status)
  ) {
    return {
      action: 'DUPLICATE_IGNORED',
      orderId: activeOrder.id,
      order: { ...builtOrder, id: activeOrder.id },
    };
  }

  if (activeOrder && activeOrder.order_fingerprint === builtOrder.order_fingerprint) {
    return {
      action: 'DUPLICATE_IGNORED',
      orderId: activeOrder.id,
      order: { ...builtOrder, id: activeOrder.id },
    };
  }

  const shouldUpdateExisting =
    activeOrder &&
    ['PENDING', 'PREPARING'].includes(activeOrder.status) &&
    (intent === 'UPDATE_ORDER' || !isExplicitSecondOrderRequest(messageText));

  if (shouldUpdateExisting) {
    const updates = {
      table:             builtOrder.table,
      items:             builtOrder.items,
      total:             builtOrder.total,
      delivery_fee:      builtOrder.delivery_fee,
      payment_method:    builtOrder.payment_method,
      payment_status:    activeOrder.receipt_image
        ? 'PENDING_VERIFICATION'
        : builtOrder.payment_status,
      order_fingerprint: builtOrder.order_fingerprint,
      updated_at:        new Date().toISOString(),
    };
    const { error } = await updateOrderWithFallback(activeOrder.id, updates);
    if (error) {
      return { action: 'ERROR', error: error.message || String(error) };
    }
    return {
      action: 'UPDATED',
      orderId: activeOrder.id,
      order: { ...builtOrder, id: activeOrder.id },
    };
  }

  const { id, error } = await insertOrderWithFallback(builtOrder);
  if (error) {
    return { action: 'ERROR', error: error.message || String(error) };
  }
  return {
    action: 'INSERTED',
    orderId: id,
    order: { ...builtOrder, id },
  };
}

async function attachReceiptToActiveOrder(phone, activeOrderIdHint, mediaPart, receiptReview) {
  const activeOrder = await findActiveOrderForPhone(phone, activeOrderIdHint);
  if (!activeOrder) return null;

  const dataUri = `data:${mediaPart.mimeType};base64,${mediaPart.data}`;
  const aiSummary = receiptReview
    ? `${receiptReview.isValidPreliminary ? '✅ IA Filtro OK' : '⚠️ IA Alerta'}: ${receiptReview.reason}` +
      (receiptReview.detectedAmount ? ` | Monto leído: $${Number(receiptReview.detectedAmount).toLocaleString('es-CO')}` : '')
    : 'Comprobante recibido (pendiente revisión humana)';

  await updateOrderWithFallback(activeOrder.id, {
    payment_method:   'Nequi',
    payment_status:   'PENDING_VERIFICATION',
    receipt_image:    dataUri,
    receipt_ai_notes: aiSummary,
    updated_at:       new Date().toISOString(),
  });

  return activeOrder.id;
}

module.exports = {
  OrderItemSchema,
  StructuredOrderSchema,
  ReceiptReviewSchema,
  BotTurnSchema,
  GEMINI_RESPONSE_SCHEMA,
  logBotEvent,
  getConversationState,
  saveConversationState,
  addToConversation,
  computeOrderFingerprint,
  calculateOrderFromStructuredData,
  parseConfirmedOrder,
  isExplicitSecondOrderRequest,
  findActiveOrderForPhone,
  insertOrderWithFallback,
  updateOrderWithFallback,
  persistValidatedOrder,
  attachReceiptToActiveOrder,
};
