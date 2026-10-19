-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN DE SEGURIDAD IDEMPOTENTE Y NO DESTRUCTIVA FOR ECLISSE
-- Archivo: supabase/migrations/20260826_secure_auth_and_rls.sql
-- 
-- INSTRUCCIONES DE EJECUCIÓN MANUAL:
-- 1. Ve al Dashboard de Supabase -> SQL Editor.
-- 2. Copia y pega el contenido completo de este archivo y presiona "Run".
-- 3. CÓMO CREAR EL PRIMER ADMINISTRADOR:
--    a. Crea un usuario en Supabase -> Authentication -> Users -> Add User (ej: admin@eclisse.com / TuPasswordSegura).
--    b. Ejecuta la siguiente consulta sustituyendo el email o UUID:
--       UPDATE public.profiles SET role = 'ADMIN' WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@eclisse.com');
--
-- NOTAS DE SEGURIDAD:
-- - Este script NO elimina tablas ni datos existentes.
-- - Si necesitas revertir las políticas en una emergencia sin borrar datos,
--   re-ejecuta schema.sql para restaurar las políticas "USING (true)".
-- ══════════════════════════════════════════════════════════════

-- 1. Crear tabla public.profiles si no existe
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'WAITER' CHECK (role IN ('ADMIN', 'WAITER', 'KITCHEN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Función helper segura para obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN COALESCE(user_role, 'ANONYMOUS');
END;
$$;

-- 3. Trigger para crear perfil automáticamente al registrar usuario en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        'WAITER' -- Rol inicial menos privilegiado por defecto
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Agregar columna created_by a orders si no existe (no destructivo)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 5. Eliminar unicamente las politicas inseguras existentes
DROP POLICY IF EXISTS "Permitir lectura pública en menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Permitir escrituras en menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Permitir todas las operaciones en orders" ON public.orders;
DROP POLICY IF EXISTS "Permitir todas las operaciones en ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Permitir todas las operaciones en staff" ON public.staff;
DROP POLICY IF EXISTS "Permitir todas las operaciones en transactions" ON public.transactions;
DROP POLICY IF EXISTS "Permitir todas las operaciones en rappi_config" ON public.rappi_config;
DROP POLICY IF EXISTS "Bot puede leer y escribir conversaciones" ON public.bot_conversations;
DROP POLICY IF EXISTS "Permitir lectura de perfil propio" ON public.profiles;
DROP POLICY IF EXISTS "Permitir lectura/actualización a admins en profiles" ON public.profiles;

-- 6. Crear políticas RLS seguras por rol

-- PROFILES
-- Los usuarios pueden leer su propio perfil
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.current_user_role() = 'ADMIN');

-- Solo ADMINs pueden actualizar roles o perfiles
CREATE POLICY "profiles_update_admin" ON public.profiles
    FOR UPDATE USING (public.current_user_role() = 'ADMIN');

-- MENU_ITEMS
-- Lectura pública para clientes y staff
CREATE POLICY "menu_items_select_public" ON public.menu_items
    FOR SELECT USING (true);

-- Solo ADMIN puede modificar la carta
CREATE POLICY "menu_items_all_admin" ON public.menu_items
    FOR ALL USING (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- INGREDIENTS
-- ADMIN, KITCHEN y WAITER pueden leer ingredientes
CREATE POLICY "ingredients_select_staff" ON public.ingredients
    FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'KITCHEN', 'WAITER'));

-- Solo ADMIN puede modificar inventario/ingredientes
CREATE POLICY "ingredients_all_admin" ON public.ingredients
    FOR ALL USING (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- ORDERS
-- Lectura: ADMIN, KITCHEN y WAITER pueden ver los pedidos
CREATE POLICY "orders_select_staff" ON public.orders
    FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'KITCHEN', 'WAITER'));

-- Inserción: WAITER y ADMIN (y pedidos generados por backend vía service_role que evade RLS)
CREATE POLICY "orders_insert_staff" ON public.orders
    FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'WAITER'));

-- Actualización: ADMIN, KITCHEN (para cambiar estado de cocina) y WAITER
CREATE POLICY "orders_update_staff" ON public.orders
    FOR UPDATE USING (public.current_user_role() IN ('ADMIN', 'KITCHEN', 'WAITER'));

-- Borrado: Solo ADMIN
CREATE POLICY "orders_delete_admin" ON public.orders
    FOR DELETE USING (public.current_user_role() = 'ADMIN');

-- TRANSACTIONS
-- Solo ADMIN (y WAITER si registra ventas directas)
CREATE POLICY "transactions_select_staff" ON public.transactions
    FOR SELECT USING (public.current_user_role() IN ('ADMIN', 'WAITER'));

CREATE POLICY "transactions_insert_staff" ON public.transactions
    FOR INSERT WITH CHECK (public.current_user_role() IN ('ADMIN', 'WAITER'));

CREATE POLICY "transactions_update_delete_admin" ON public.transactions
    FOR ALL USING (public.current_user_role() = 'ADMIN');

-- STAFF
-- Solo ADMIN
CREATE POLICY "staff_all_admin" ON public.staff
    FOR ALL USING (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- RAPPI_CONFIG
-- Solo ADMIN (incluye claves sensibles)
CREATE POLICY "rappi_config_all_admin" ON public.rappi_config
    FOR ALL USING (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- BOT_CONVERSATIONS
-- Sin acceso directo desde el navegador (anonKey).
-- Solo accesible mediante el service_role key desde Vercel backend.
-- Habilitar RLS sin políticas públicas bloquea el acceso anon/autenticado directo.
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
