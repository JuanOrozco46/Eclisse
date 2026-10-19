-- ══════════════════════════════════════════════════════════════
-- FASE 1 — FIABILIDAD DEL FLUJO DE PEDIDOS, COMPROBANTES Y TRAZABILIDAD
-- Archivo: supabase/migrations/20261009_fase1_order_reliability.sql
--
-- Objetivo:
-- 1. Soportar cola de verificación de comprobantes Nequi, tarifa de domicilio
--    calculada en servidor y dedup explícito por huella de pedido en public.orders.
-- 2. Vincular el pedido activo en public.bot_conversations para que cambios del
--    cliente actualicen el mismo registro en vez de duplicarlo.
-- 3. Crear la tabla public.bot_events para trazabilidad del funnel del bot
--    (RECEIVED -> RESPONDED -> ORDER_CONFIRMED -> ORDER_INSERTED / ORDER_UPDATED / ERROR).
-- ══════════════════════════════════════════════════════════════

-- 1. Nuevas columnas en public.orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS receipt_image TEXT,
  ADD COLUMN IF NOT EXISTS receipt_ai_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_orders_fingerprint ON public.orders (customer_phone, order_fingerprint);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);

-- 2. Nuevas columnas en public.bot_conversations para seguimiento de pedido activo
ALTER TABLE public.bot_conversations
  ADD COLUMN IF NOT EXISTS active_order_id TEXT,
  ADD COLUMN IF NOT EXISTS last_fingerprint TEXT;

-- 3. Tabla de trazabilidad del bot (public.bot_events)
CREATE TABLE IF NOT EXISTS public.bot_events (
    id          BIGSERIAL PRIMARY KEY,
    phone       TEXT NOT NULL,
    message_id  TEXT,
    stage       TEXT NOT NULL CHECK (stage IN (
                  'RECEIVED',
                  'MENU_SENT',
                  'RESPONDED',
                  'ORDER_CONFIRMED',
                  'ORDER_UPDATED',
                  'ORDER_INSERTED',
                  'RECEIPT_RECEIVED',
                  'VALIDATION_RETRY',
                  'ERROR'
                )),
    order_id    TEXT,
    details     JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_events_created_at ON public.bot_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_phone ON public.bot_events (phone);
CREATE INDEX IF NOT EXISTS idx_bot_events_stage ON public.bot_events (stage);

ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_events_select_admin" ON public.bot_events;
CREATE POLICY "bot_events_select_admin" ON public.bot_events
    FOR SELECT USING (public.current_user_role() = 'ADMIN');
