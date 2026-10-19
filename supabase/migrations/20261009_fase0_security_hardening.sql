-- ══════════════════════════════════════════════════════════════
-- FASE 0 — HARDENING DE SEGURIDAD Y UNIFICACIÓN DE USUARIOS
-- Archivo: supabase/migrations/20261009_fase0_security_hardening.sql
--
-- Objetivo:
-- 1. Unificar el sistema de personal en Supabase Auth (auth.users) + public.profiles.
-- 2. Agregar columnas email y status ('ACTIVE' | 'OFFLINE') a public.profiles.
-- 3. Eliminar las columnas de credenciales en texto plano (username, password)
--    y retirar la tabla legacy public.staff.
-- ══════════════════════════════════════════════════════════════

-- 1. Extender public.profiles con email y status
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'OFFLINE'));

-- Sincronizar emails existentes desde auth.users hacia public.profiles
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 2. Actualizar el trigger handle_new_user para poblar email, role y status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        CASE
            WHEN NEW.raw_user_meta_data->>'role' IN ('ADMIN', 'WAITER', 'KITCHEN')
            THEN NEW.raw_user_meta_data->>'role'
            ELSE 'WAITER'
        END,
        'ACTIVE'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name  = COALESCE(public.profiles.name, EXCLUDED.name);
    RETURN NEW;
END;
$$;

-- 3. Eliminar columnas de contraseñas en texto plano de la tabla legacy staff y eliminar la tabla
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff') THEN
    ALTER TABLE public.staff DROP COLUMN IF EXISTS password;
    ALTER TABLE public.staff DROP COLUMN IF EXISTS username;
    DROP POLICY IF EXISTS "Permitir todas las operaciones en staff" ON public.staff;
    DROP POLICY IF EXISTS "staff_all_admin" ON public.staff;
    DROP TABLE public.staff;
  END IF;
END $$;
