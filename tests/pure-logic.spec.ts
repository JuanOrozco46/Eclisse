import { describe, it, expect } from 'vitest';
import bot from '../api/index';
import { toSnake, toCamel, getBogotaDateString } from '../src/app/services/data.service';

const menu = bot.DEFAULT_MENU;

describe('Fase 3: Pure Logic Unit Tests', () => {
  describe('Server-Side Pricing and Total Calculation', () => {
    it('calculates items x unit price from menu catalog plus delivery fee for ARMENIA', () => {
      const res = bot.calculateOrderFromStructuredData(
        {
          items: [
            { menuItemId: '1', name: 'Bianca', quantity: 2, note: 'Sin picante' },
            { menuItemId: '10', name: 'Coca-Cola Original 1.5L', quantity: 1, note: '' },
          ],
          deliveryType: 'ARMENIA',
          address: 'Carrera 14 #9-20',
          paymentMethod: 'Efectivo',
        },
        menu,
        '573001234567',
        'Carlos Gómez'
      );

      expect(res.valid).toBe(true);
      expect(res.subtotal).toBe(25000 * 2 + 8000); // 58000
      expect(res.deliveryFee).toBe(6000);
      expect(res.order.total).toBe(64000);
      expect(res.order.table).toBe('Carrera 14 #9-20');
      expect(res.order.payment_method).toBe('Efectivo');
      expect(res.order.payment_status).toBe('UNPAID');
    });

    it('sets $0 delivery fee and fallback address for PICKUP', () => {
      const res = bot.calculateOrderFromStructuredData(
        {
          items: [{ menuItemId: '2', name: 'Lumina', quantity: 1, note: '' }],
          deliveryType: 'PICKUP',
          address: 'Recojo en local',
          paymentMethod: 'Nequi',
        },
        menu,
        '573001234567',
        'Laura'
      );

      expect(res.valid).toBe(true);
      expect(res.deliveryFee).toBe(0);
      expect(res.order.total).toBe(25000);
      expect(res.order.payment_method).toBe('Nequi');
      expect(res.order.payment_status).toBe('PENDING_VERIFICATION');
    });

    it('applies $10.000 delivery fee for OUTSKIRTS (Circasia, Calarcá, etc.)', () => {
      const res = bot.calculateOrderFromStructuredData(
        {
          items: [{ menuItemId: '3', name: 'Hawaianna', quantity: 1, note: '' }],
          deliveryType: 'OUTSKIRTS',
          address: 'Condominio Campestre Circasia',
          paymentMethod: 'Nequi',
        },
        menu,
        '573001234567',
        'Andrés'
      );

      expect(res.valid).toBe(true);
      expect(res.deliveryFee).toBe(10000);
      expect(res.order.total).toBe(35000);
    });

    it('supports custom delivery fees from business configuration', () => {
      const res = bot.calculateOrderFromStructuredData(
        {
          items: [{ menuItemId: '1', name: 'Bianca', quantity: 1, note: '' }],
          deliveryType: 'ARMENIA',
          address: 'Calle 2 Norte #18-144',
          paymentMethod: 'Efectivo',
        },
        menu,
        '573001234567',
        'Cliente',
        { ARMENIA: 7500, OUTSKIRTS: 12000 }
      );

      expect(res.valid).toBe(true);
      expect(res.deliveryFee).toBe(7500);
      expect(res.order.total).toBe(32500);
    });

    it('rejects hallucinated or non-existent items to trigger automatic re-prompt', () => {
      const res = bot.calculateOrderFromStructuredData(
        {
          items: [{ menuItemId: '999', name: 'Pizza Cuatro Quesos Inexistente', quantity: 1, note: '' }],
          deliveryType: 'ARMENIA',
          address: 'Calle 10 #12-34',
          paymentMethod: 'Efectivo',
        },
        menu,
        '573001234567',
        'Pepe'
      );

      expect(res.valid).toBe(false);
      expect(res.error).toContain('no existe en la carta disponible');
    });

    it('ignores arbitrary LLM-generated totals and calculates authoritative server total in parseConfirmedOrder', () => {
      const legacyBlock = `
PEDIDO_CONFIRMADO:
- CLIENTE: Juan Pérez
- ITEMS: 2x Bianca | 1x Coca-Cola Original 1.5L
- DIRECCION: Cra 12 #34-56
- PAGO: Efectivo
- TOTAL: $1000
      `.trim();

      const parsed = bot.parseConfirmedOrder(legacyBlock, menu, '573001234567', 'Juan');
      expect(parsed).not.toBeNull();
      // Even though LLM wrote $1000, authoritative total MUST be 25k*2 + 8k + 6k = 64000
      expect(parsed.total).toBe(64000);
      expect(parsed.delivery_fee).toBe(6000);
    });
  });

  describe('Order Fingerprint Deduplication', () => {
    it('produces the same fingerprint for identical order configurations regardless of item order', () => {
      const fp1 = bot.computeOrderFingerprint(
        '573001234567',
        [
          { menuItemId: '1', quantity: 2, note: '' },
          { menuItemId: '2', quantity: 1, note: '' },
        ],
        'Calle 2 Norte #18-144',
        'Efectivo',
        'ARMENIA'
      );

      const fp2 = bot.computeOrderFingerprint(
        '+57 300 123 4567',
        [
          { menuItemId: '2', quantity: 1, note: '' },
          { menuItemId: '1', quantity: 2, note: '' },
        ],
        'calle 2 norte #18-144',
        'efectivo',
        'ARMENIA'
      );

      expect(fp1).toBe(fp2);
    });

    it('produces a different fingerprint when items, quantity, or address change', () => {
      const fp1 = bot.computeOrderFingerprint(
        '573001234567',
        [{ menuItemId: '1', quantity: 1, note: '' }],
        'Calle 10 #20',
        'Efectivo',
        'ARMENIA'
      );

      const fp2 = bot.computeOrderFingerprint(
        '573001234567',
        [{ menuItemId: '1', quantity: 2, note: '' }],
        'Calle 10 #20',
        'Efectivo',
        'ARMENIA'
      );

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('Intent and Message Classification', () => {
    it('detects menu and catalog requests accurately', () => {
      expect(bot.isMenuRequest('Me mandas la carta por favor?')).toBe(true);
      expect(bot.isMenuRequest('Hola, qué menú tienen hoy?')).toBe(true);
      expect(bot.isMenuRequest('Tienen fotos de las pizzas?')).toBe(true);
      expect(bot.isMenuRequest('Quiero dos pizzas Bianca')).toBe(false);
    });

    it('detects curt acknowledgements that should be ignored without calling Gemini', () => {
      expect(bot.isCurtMessage('ok')).toBe(true);
      expect(bot.isCurtMessage('gracias!')).toBe(true);
      expect(bot.isCurtMessage('vale 👍')).toBe(true);
      expect(bot.isCurtMessage('listo')).toBe(true);
      expect(bot.isCurtMessage('Quiero pedir una pizza')).toBe(false);
    });

    it('evaluates business hours correctly (5 PM to 11 PM)', () => {
      expect(bot.isOpen(16)).toBe(false);
      expect(bot.isOpen(17)).toBe(true);
      expect(bot.isOpen(20)).toBe(true);
      expect(bot.isOpen(22)).toBe(true);
      expect(bot.isOpen(23)).toBe(false);
      expect(bot.isOpen(2)).toBe(false);
    });
  });

  describe('Zod Schema Turn Validation', () => {
    it('validates a correct bot turn with order confirmation', () => {
      const raw = JSON.stringify({
        reply: 'Tu pedido quedó confirmado 🔥 En 35 min te llega.',
        intent: 'CONFIRM_ORDER',
        order: {
          items: [{ menuItemId: '1', name: 'Bianca', quantity: 1, note: 'Bien tostada' }],
          deliveryType: 'ARMENIA',
          address: 'Cra 15 #2-10',
          paymentMethod: 'Efectivo',
        },
        receiptReview: null,
      });

      const res = bot.validateTurnOutput(raw, menu, '573001234567', 'Cliente');
      expect(res.ok).toBe(true);
      expect(res.turn.intent).toBe('CONFIRM_ORDER');
      expect(res.calculatedOrder.order.total).toBe(31000); // 25k + 6k
    });

    it('rejects invalid JSON structure', () => {
      const raw = '{ invalidJson: true ';
      const res = bot.validateTurnOutput(raw, menu, '573001234567', 'Cliente');
      expect(res.ok).toBe(false);
      expect(res.error).toContain('JSON malformado');
    });

    it('rejects missing required fields in order object', () => {
      const raw = JSON.stringify({
        reply: 'Listo tu pedido.',
        intent: 'CONFIRM_ORDER',
        order: {
          // address is missing
          deliveryType: 'ARMENIA',
          paymentMethod: 'Efectivo',
          items: [{ menuItemId: '1', name: 'Bianca', quantity: 1, note: '' }],
        },
      });

      const res = bot.validateTurnOutput(raw, menu, '573001234567', 'Cliente');
      expect(res.ok).toBe(false);
      expect(res.error).toContain('address');
    });
  });

  describe('Database Mappers and Timezone Helpers', () => {
    it('keeps Colombia local date after 7:00 PM Bogota time (00:00+ UTC)', () => {
      // 2026-10-19 at 9:30 PM Bogota (UTC-5) = 2026-10-20T02:30:00Z in UTC
      const eveningBogotaTimestamp = Date.parse('2026-10-20T02:30:00Z');
      expect(getBogotaDateString(eveningBogotaTimestamp)).toBe('2026-10-19');
    });

    it('converts camelCase object to snake_case correctly', () => {
      const input = {
        deliveryFee: 6000,
        orderFingerprint: 'abc123xyz',
        paymentStatus: 'VERIFIED',
        customerPhone: '573001234567',
        customerName: 'Santiago',
        deliveryStatus: 'REQUESTED',
        receiptImage: 'data:image/jpeg;base64,xxxx',
        receiptAiNotes: 'Pago verificado',
      };

      const snake = toSnake(input);
      expect(snake.delivery_fee).toBe(6000);
      expect(snake.order_fingerprint).toBe('abc123xyz');
      expect(snake.payment_status).toBe('VERIFIED');
      expect(snake.customer_phone).toBe('573001234567');
      expect(snake.customer_name).toBe('Santiago');
      expect(snake.delivery_status).toBe('REQUESTED');
      expect(snake.receipt_image).toBe('data:image/jpeg;base64,xxxx');
      expect(snake.receipt_ai_notes).toBe('Pago verificado');
    });

    it('converts snake_case object to camelCase and parses jsonb items', () => {
      const input = {
        delivery_fee: 6000,
        order_fingerprint: 'abc123xyz',
        payment_status: 'VERIFIED',
        customer_phone: '573001234567',
        customer_name: 'Santiago',
        delivery_status: 'REQUESTED',
        receipt_image: 'data:image/jpeg;base64,xxxx',
        receipt_ai_notes: 'Pago verificado',
        items: JSON.stringify([
          { menu_item_id: '1', name: 'Bianca', quantity: 2, price: 25000, note: '' },
        ]),
      };

      const camel = toCamel(input);
      expect(camel.deliveryFee).toBe(6000);
      expect(camel.orderFingerprint).toBe('abc123xyz');
      expect(camel.paymentStatus).toBe('VERIFIED');
      expect(camel.customerPhone).toBe('573001234567');
      expect(camel.customerName).toBe('Santiago');
      expect(camel.deliveryStatus).toBe('REQUESTED');
      expect(camel.receiptImage).toBe('data:image/jpeg;base64,xxxx');
      expect(camel.receiptAiNotes).toBe('Pago verificado');
      expect(Array.isArray(camel.items)).toBe(true);
      expect(camel.items[0].menuItemId).toBe('1');
    });
  });
});
