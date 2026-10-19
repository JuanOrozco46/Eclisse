-- ══════════════════════════════════════════════════════════════
-- FASE 3 — BLINDAJE DE SEGURIDAD RLS (ROW LEVEL SECURITY) POR ROLES
-- Archivo: supabase/migrations/20261009_fase3_rls_hardening.sql
--
-- Objetivo:
-- 1. Cerrar políticas permisivas (anon no lee ni escribe orders, transacciones, etc.)
-- 2. Asegurar que WAITER y KITCHEN no puedan borrar pedidos (DELETE solo ADMIN).
-- 3. KITCHEN solo puede ver y actualizar pedidos (no insertar ni borrar).
-- 4. Mantener menu_items con SELECT público para clientes del sitio web.
-- ══════════════════════════════════════════════════════════════

-- 1. Helper function para verificar roles del usuario autenticado
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

-- 2. Habilitar RLS en todas las tablas
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rappi_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;

-- 3. Políticas para menu_items
DROP POLICY IF EXISTS "Permitir lectura pública en menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Permitir escrituras en menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_select_public" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_modify_admin" ON public.menu_items;

CREATE POLICY "menu_items_select_public" ON public.menu_items
    FOR SELECT USING (true);

CREATE POLICY "menu_items_modify_admin" ON public.menu_items
    FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- 4. Políticas para orders
DROP POLICY IF EXISTS "Permitir todas las operaciones en orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_update_staff" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_admin" ON public.orders;

CREATE POLICY "orders_select_staff" ON public.orders
    FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]));

CREATE POLICY "orders_insert_staff" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'WAITER']::TEXT[]));

CREATE POLICY "orders_update_staff" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]));

CREATE POLICY "orders_delete_admin" ON public.orders
    FOR DELETE TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- 5. Políticas para transactions
DROP POLICY IF EXISTS "Permitir todas las operaciones en transactions" ON public.transactions;
DROP POLICY IF EXISTS "transactions_select_admin" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_staff" ON public.transactions;
DROP POLICY IF EXISTS "transactions_modify_admin" ON public.transactions;

CREATE POLICY "transactions_select_admin" ON public.transactions
    FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

CREATE POLICY "transactions_insert_staff" ON public.transactions
    FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'WAITER']::TEXT[]));

CREATE POLICY "transactions_modify_admin" ON public.transactions
    FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- 6. Políticas para ingredients
DROP POLICY IF EXISTS "Permitir todas las operaciones en ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_select_staff" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_update_stock" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_modify_admin" ON public.ingredients;

CREATE POLICY "ingredients_select_staff" ON public.ingredients
    FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]));

CREATE POLICY "ingredients_update_stock" ON public.ingredients
    FOR UPDATE TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'KITCHEN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'KITCHEN']::TEXT[]));

CREATE POLICY "ingredients_modify_admin" ON public.ingredients
    FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- 7. Políticas para profiles
DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;
DROP POLICY IF EXISTS "profiles_modify_admin" ON public.profiles;

CREATE POLICY "profiles_select_staff" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]) OR id = auth.uid());

CREATE POLICY "profiles_modify_admin" ON public.profiles
    FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- 8. Políticas para rappi_config
DROP POLICY IF EXISTS "Permitir todas las operaciones en rappi_config" ON public.rappi_config;
DROP POLICY IF EXISTS "rappi_config_admin" ON public.rappi_config;

CREATE POLICY "rappi_config_admin" ON public.rappi_config
    FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]))
    WITH CHECK (public.has_any_role(ARRAY['ADMIN']::TEXT[]));

-- 9. Políticas para bot_events
DROP POLICY IF EXISTS "bot_events_select_admin" ON public.bot_events;

CREATE POLICY "bot_events_select_admin" ON public.bot_events
    FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['ADMIN']::TEXT[]));
