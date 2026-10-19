/**
 * api/staff.js
 *
 * Endpoint Vercel serverless exclusivo para ADMIN: /api/staff
 * Unifica la gestión de personal sobre Supabase Auth (auth.users) + public.profiles,
 * eliminando el almacenamiento de contraseñas en texto plano en la antigua tabla staff.
 *
 * Métodos:
 * - POST   /api/staff          → Crea usuario en Supabase Auth + perfil en public.profiles
 * - DELETE /api/staff?id=UUID  → Elimina usuario de Supabase Auth (cascade a public.profiles)
 */

const { createClient } = require('@supabase/supabase-js');

function getEnvVar(name) {
  const val = process.env[name];
  if (!val || !val.trim()) {
    throw new Error(`Variable de entorno obligatoria no configurada: ${name}`);
  }
  return val.trim();
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Validar token JWT del solicitante
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }

  let supabaseUrl, supabaseAnonKey, supabaseServiceKey;
  try {
    supabaseUrl        = getEnvVar('SUPABASE_URL');
    supabaseAnonKey    = getEnvVar('SUPABASE_ANON_KEY');
    supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  } catch (envError) {
    console.error('Configuración incompleta en api/staff.js:', envError.message);
    return res.status(500).json({ error: `Server configuration error: ${envError.message}` });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  // 2. Verificar que el solicitante tenga rol ADMIN en public.profiles
  const { data: callerProfile, error: profileError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !callerProfile || callerProfile.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only ADMIN can manage staff accounts' });
  }

  // Cliente con privilegios service_role para administrar Supabase Auth
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    // ── CREAR MIEMBRO DEL PERSONAL ──────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, email, password, role } = req.body || {};
      const cleanName  = (typeof name === 'string') ? name.trim() : '';
      const cleanEmail = (typeof email === 'string') ? email.trim().toLowerCase() : '';
      const cleanRole  = ['ADMIN', 'WAITER', 'KITCHEN'].includes(role) ? role : 'WAITER';

      if (!cleanName || !cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Nombre y correo electrónico válido son obligatorios' });
      }
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { name: cleanName, role: cleanRole },
      });

      if (createError || !created?.user) {
        return res.status(400).json({ error: createError?.message || 'No se pudo crear el usuario en Supabase Auth' });
      }

      const profileRow = {
        id: created.user.id,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        status: 'ACTIVE',
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await adminClient
        .from('profiles')
        .upsert(profileRow, { onConflict: 'id' });

      if (upsertError) {
        console.error('Error upserting profile:', upsertError.message);
      }

      return res.status(201).json({
        id: created.user.id,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        status: 'ACTIVE',
        createdAt: created.user.created_at || new Date().toISOString(),
      });
    }

    // ── ELIMINAR MIEMBRO DEL PERSONAL ───────────────────────────────────────
    if (req.method === 'DELETE') {
      const targetId = (req.query?.id || req.body?.id || '').toString().trim();
      if (!targetId) {
        return res.status(400).json({ error: 'Missing staff user id' });
      }
      if (targetId === user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador activa' });
      }

      const { error: delAuthError } = await adminClient.auth.admin.deleteUser(targetId);
      if (delAuthError) {
        return res.status(400).json({ error: delAuthError.message });
      }

      await adminClient.from('profiles').delete().eq('id', targetId);
      return res.status(200).json({ status: 'deleted', id: targetId });
    }
  } catch (err) {
    console.error('api/staff.js unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal staff management error' });
  }
};
