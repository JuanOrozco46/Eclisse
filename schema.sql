-- Script SQL para Supabase (Eclisse Pizza Napoletana)
-- Puedes copiar y pegar este código en el SQL Editor de tu Dashboard de Supabase

-- ══════════════════════════════════════════════════════════════
-- PASO 0: Habilitar Realtime para la tabla orders
-- (Ejecutar una vez; idempotente si ya está habilitado)
-- ══════════════════════════════════════════════════════════════
-- Esto también se puede hacer desde:
--   Dashboard → Database → Replication → orders ✓
-- pero con el SQL de abajo queda registrado en el repositorio.

-- 1. Tabla para la carta / menú
CREATE TABLE IF NOT EXISTS public.menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    category TEXT NOT NULL,
    image TEXT,
    ingredients JSONB DEFAULT '[]'::jsonb,
    available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS y lectura pública
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura pública en menu_items" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Permitir escrituras en menu_items" ON public.menu_items FOR ALL USING (true);

-- 2. Limpiar e Insertar todos los platos y bebidas de la carta
TRUNCATE TABLE public.menu_items;

INSERT INTO public.menu_items (id, name, description, price, category, ingredients, available) VALUES
('1', 'Bianca', 'Salsa blanca de la casa, queso mozzarella, tocineta ahumada, queso costeño y pimienta.', 25000, 'Pizzas', '["Salsa blanca", "Queso mozzarella", "Tocineta ahumada", "Queso costeño", "Pimienta"]'::jsonb, true),
('2', 'Lumina', 'Salsa de tomate de la casa, queso mozzarella, tomate cherry, pesto y mozzarella di bufala.', 25000, 'Pizzas', '["Salsa de tomate", "Queso mozzarella", "Tomate cherry", "Pesto", "Mozzarella di bufala"]'::jsonb, true),
('3', 'Hawaianna', 'Piña caramelizada, jamón ahumado, queso mozzarella, salsa de tomate de la casa y cilantro.', 25000, 'Pizzas', '["Piña caramelizada", "Jamón ahumado", "Queso mozzarella", "Salsa de tomate", "Cilantro"]'::jsonb, true),
('4', 'Dorato', 'Salsa de tomate de la casa, chorizo ahumado en trozos, maíz dulce y queso costeño.', 25000, 'Pizzas', '["Salsa de tomate", "Chorizo ahumado", "Maíz dulce", "Queso costeño"]'::jsonb, true),
('5', 'Amalgama', 'Salsa de tomate de la casa, queso mozzarella, pollo en trozos, pimentón y cebolla morada.', 25000, 'Pizzas', '["Salsa de tomate", "Queso mozzarella", "Pollo en trozos", "Pimentón", "Cebolla morada"]'::jsonb, true),
('6', 'Dolce Fiamma', 'Salsa de tomate de la casa, queso mozzarella, pepperoni, cebolla morada y miel picante.', 25000, 'Pizzas', '["Salsa de tomate", "Queso mozzarella", "Pepperoni", "Cebolla morada", "Miel picante"]'::jsonb, true),
('7', 'Coca-Cola Original 250ml', 'Coca-Cola Original 250 ml', 3000, 'Bebidas', '[]'::jsonb, true),
('8', 'Coca-Cola Zero 250ml', 'Coca-Cola Zero 250 ml', 3000, 'Bebidas', '[]'::jsonb, true),
('9', 'Quatro 250ml', 'Quatro 250 ml', 3000, 'Bebidas', '[]'::jsonb, true),
('10', 'Coca-Cola Original 1.5L', 'Coca-Cola Original 1.5 Litros', 8000, 'Bebidas', '[]'::jsonb, true),
('11', 'Coca-Cola Zero 1.5L', 'Coca-Cola Zero 1.5 Litros', 8000, 'Bebidas', '[]'::jsonb, true);

-- ══════════════════════════════════════════════════════════════
-- 3. Tabla de pedidos (orders)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.orders (
    -- Identificador único, generado por el bot o el POS
    id TEXT PRIMARY KEY,

    -- Dirección de entrega o número de mesa (para POS)
    "table" TEXT NOT NULL DEFAULT '',

    -- Items del pedido como array JSON
    -- Ejemplo: [{"menuItemId":"1","name":"Bianca","quantity":2,"price":25000,"note":""}]
    items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Total calculado en COP
    total NUMERIC NOT NULL DEFAULT 0,

    -- Estado del pedido
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PREPARING', 'READY', 'DELIVERED', 'PAID')),

    -- Pedido prioritario (se muestra con badge rojo en cocina)
    priority BOOLEAN NOT NULL DEFAULT false,

    -- Timestamp Unix en milisegundos
    timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,

    -- Mesero o cajero que tomó el pedido (solo POS)
    waiter TEXT,

    -- Método de pago registrado al cerrar el pedido
    payment_method TEXT,

    -- Origen del pedido
    source TEXT DEFAULT 'POS'
        CHECK (source IN ('POS', 'WHATSAPP', 'RAPPI')),

    -- Teléfono del cliente (WhatsApp)
    customer_phone TEXT,

    -- Nombre del contacto de WhatsApp (pushName)
    customer_name TEXT,

    -- Estado del domicilio
    delivery_status TEXT DEFAULT 'NONE'
        CHECK (delivery_status IN ('NONE', 'REQUESTED', 'ON_THE_WAY')),

    -- Tarifa de domicilio calculada en el servidor
    delivery_fee NUMERIC NOT NULL DEFAULT 0,

    -- Fingerprint determinístico para deduplicación explícita de pedidos
    order_fingerprint TEXT,

    -- Estado de verificación de pago (cola humana Nequi)
    payment_status TEXT NOT NULL DEFAULT 'UNPAID'
        CHECK (payment_status IN ('UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),

    -- Comprobante de pago completo en base64 data URI y pre-filtro IA
    receipt_image TEXT,
    receipt_ai_notes TEXT,

    -- ID del pedido en Rappi (solo pedidos Rappi)
    rappi_order_id TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices útiles para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_source ON public.orders (source);
CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON public.orders (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_fingerprint ON public.orders (customer_phone, order_fingerprint);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);

-- RLS: cualquier clave anon puede leer y escribir
-- (el bot usa la anon key; ajustar con service_role si se necesita más seguridad)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todas las operaciones en orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

-- Habilitar Realtime en la tabla orders
-- Esto hace que la cocina Angular reciba pedidos nuevos sin refrescar
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ══════════════════════════════════════════════════════════════
-- 4. Tablas auxiliares (ingredientes, staff, transacciones, config)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'unidad',
    stock NUMERIC NOT NULL DEFAULT 0,
    min NUMERIC NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'General',
    cost_per_unit NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todas las operaciones en ingredients" ON public.ingredients FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'WAITER' CHECK (role IN ('ADMIN', 'WAITER', 'KITCHEN')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'OFFLINE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('Venta', 'Gasto')),
    category TEXT NOT NULL DEFAULT 'General',
    amount NUMERIC NOT NULL DEFAULT 0,
    method TEXT NOT NULL DEFAULT 'Efectivo',
    description TEXT,
    date TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    order_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions (date);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todas las operaciones en transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.rappi_config (
    id TEXT PRIMARY KEY,
    connected BOOLEAN DEFAULT false,
    store_id TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    webhook_secret TEXT DEFAULT '',
    connected_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.rappi_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todas las operaciones en rappi_config" ON public.rappi_config FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- 5. Historial de conversación del bot (bot_conversations)
-- ══════════════════════════════════════════════════════════════
-- Persiste el historial de WhatsApp del bot ante cold starts de Vercel.
-- TTL de limpieza: filas no actualizadas en más de 24h se pueden borrar manualmente.
CREATE TABLE IF NOT EXISTS public.bot_conversations (
    phone             TEXT PRIMARY KEY,
    messages          JSONB NOT NULL DEFAULT '[]'::jsonb,
    active_order_id   TEXT,
    last_fingerprint  TEXT,
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_conversations_updated ON public.bot_conversations (updated_at DESC);

ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
-- Solo el service_role puede escribir; la anon key solo puede upsert desde el bot
CREATE POLICY "Bot puede leer y escribir conversaciones" ON public.bot_conversations FOR ALL USING (true) WITH CHECK (true);

-- Función para limpiar conversaciones viejas (ejecutar con pg_cron o manualmente)
-- SELECT clean_old_conversations(); → borra entradas con más de 24h de inactividad
CREATE OR REPLACE FUNCTION public.clean_old_conversations()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM public.bot_conversations
  WHERE updated_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 6. Trazabilidad del funnel del bot (bot_events)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bot_events (
    id          BIGSERIAL PRIMARY KEY,
    phone       TEXT NOT NULL,
    message_id  TEXT,
    stage       TEXT NOT NULL
        CHECK (stage IN (
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
    details     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_events_phone_created ON public.bot_events (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_stage_created ON public.bot_events (stage, created_at DESC);
ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- 7. BLINDAJE DE SEGURIDAD RLS (FASE 3)
-- ══════════════════════════════════════════════════════════════
-- Reemplaza políticas abiertas por control de acceso estricto basado en roles:
-- ADMIN: control total
-- WAITER: lectura/creación/actualización de pedidos y caja
-- KITCHEN: lectura y cambio de estado de pedidos/stock de ingredientes
-- Anon: solo lectura de carta (menu_items)

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'ACTIVE'
      AND role = ANY(roles)
  );
$$;

-- menu_items
DROP POLICY IF EXISTS "Permitir lectura pública en menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Permitir escrituras en menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_select_public" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_modify_admin" ON public.menu_items;

CREATE POLICY "menu_items_select_public" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "menu_items_modify_admin" ON public.menu_items FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- orders
DROP POLICY IF EXISTS "Permitir todas las operaciones en orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_update_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_admin" ON public.orders;

CREATE POLICY "orders_select_staff" ON public.orders FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]));
CREATE POLICY "orders_insert_staff" ON public.orders FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'WAITER']::TEXT[]));
CREATE POLICY "orders_update_staff" ON public.orders FOR UPDATE TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]));
CREATE POLICY "orders_delete_admin" ON public.orders FOR DELETE TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- transactions
DROP POLICY IF EXISTS "Permitir todas las operaciones en transactions" ON public.transactions;
DROP POLICY IF EXISTS "transactions_select_admin" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_staff" ON public.transactions;
DROP POLICY IF EXISTS "transactions_modify_admin" ON public.transactions;

CREATE POLICY "transactions_select_admin" ON public.transactions FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]));
CREATE POLICY "transactions_insert_staff" ON public.transactions FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'WAITER']::TEXT[]));
CREATE POLICY "transactions_modify_admin" ON public.transactions FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- ingredients
DROP POLICY IF EXISTS "Permitir todas las operaciones en ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_select_staff" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_update_stock" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_modify_admin" ON public.ingredients;

CREATE POLICY "ingredients_select_staff" ON public.ingredients FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]));
CREATE POLICY "ingredients_update_stock" ON public.ingredients FOR UPDATE TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'KITCHEN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'KITCHEN']::TEXT[]));
CREATE POLICY "ingredients_modify_admin" ON public.ingredients FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- profiles
DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;
DROP POLICY IF EXISTS "profiles_modify_admin" ON public.profiles;

CREATE POLICY "profiles_select_staff" ON public.profiles FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]) OR id = auth.uid());
CREATE POLICY "profiles_modify_admin" ON public.profiles FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- rappi_config
DROP POLICY IF EXISTS "Permitir todas las operaciones en rappi_config" ON public.rappi_config;
DROP POLICY IF EXISTS "rappi_config_admin" ON public.rappi_config;

CREATE POLICY "rappi_config_admin" ON public.rappi_config FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- bot_events
DROP POLICY IF EXISTS "bot_events_select_admin" ON public.bot_events;

CREATE POLICY "bot_events_select_admin" ON public.bot_events FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]));


