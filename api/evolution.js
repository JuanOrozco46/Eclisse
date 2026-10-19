/**
 * api/evolution.js
 *
 * Endpoint Vercel serverless protegido: GET / POST / DELETE /api/evolution
 * Reemplaza el antiguo proxy público (/api/evolution/*) validando JWT de Supabase
 * y rol en la tabla public.profiles antes de comunicarse con Evolution API.
 * La EVOLUTION_API_KEY vive únicamente en variables de entorno del servidor.
 *
 * Operaciones soportadas (query ?action=... o body.action):
 * - status       (GET/POST)   → Estado de conexión de la instancia (Rol: ADMIN)
 * - connect      (POST)       → Obtener QR / crear instancia si no existe (Rol: ADMIN)
 * - logout       (POST/DELETE)→ Cerrar sesión de WhatsApp en la instancia (Rol: ADMIN)
 * - groups       (GET/POST)   → Listar grupos de WhatsApp de la instancia (Rol: ADMIN)
 * - send-message (POST)       → Enviar mensaje de texto o a grupo JID (Rol: ADMIN, KITCHEN)
 */

const { createClient } = require('@supabase/supabase-js');

function getEnvVar(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Variable de entorno obligatoria no configurada: ${name}`);
  }
  return val;
}

function sanitizeInstanceName(name, fallback) {
  const raw = (typeof name === 'string' && name.trim()) ? name.trim() : fallback;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(raw)) {
    throw new Error('Invalid instanceName format');
  }
  return raw;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Extraer y verificar JWT de Supabase
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authentication token' });
  }

  let supabaseUrl, supabaseAnonKey, evolutionUrl, evolutionKey, defaultInstance;
  try {
    supabaseUrl     = getEnvVar('SUPABASE_URL');
    supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY');
    evolutionUrl    = getEnvVar('EVOLUTION_API_URL').replace(/\/+$/, '');
    evolutionKey    = getEnvVar('EVOLUTION_API_KEY');
    defaultInstance = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01';
  } catch (envError) {
    console.error('Configuración de servidor incompleta en api/evolution.js:', envError.message);
    return res.status(500).json({ error: `Server configuration error: ${envError.message}` });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  // 2. Verificar rol del usuario en public.profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: 'Forbidden: User profile not found' });
  }

  const action = (req.query?.action || req.body?.action || '').toString().trim();
  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter' });
  }

  // Control de acceso basado en roles:
  // 'send-message' permite ADMIN y KITCHEN (para solicitar domiciliarios desde KDS).
  // El resto de operaciones administrativas de la instancia requieren rol ADMIN exclusivo.
  const allowedRoles = action === 'send-message' ? ['ADMIN', 'KITCHEN'] : ['ADMIN'];
  if (!allowedRoles.includes(profile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions for this action' });
  }

  let instanceName;
  try {
    instanceName = sanitizeInstanceName(
      req.query?.instance || req.body?.instanceName,
      defaultInstance
    );
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const evoHeaders = {
    'Content-Type': 'application/json',
    'apikey': evolutionKey,
  };

  try {
    // ── ACCIÓN 1: Estado de la instancia ──────────────────────────────────────
    if (action === 'status') {
      const response = await fetch(
        `${evolutionUrl}/instance/connectionState/${instanceName}`,
        { method: 'GET', headers: evoHeaders }
      );
      if (response.status === 404) {
        return res.status(404).json({ instance: { state: 'disconnected' } });
      }
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch instance status' });
      }
      const data = await response.json();
      return res.status(200).json(data);
    }

    // ── ACCIÓN 2: Conectar / Generar QR ───────────────────────────────────────
    if (action === 'connect') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      let response = await fetch(
        `${evolutionUrl}/instance/connect/${instanceName}`,
        { method: 'GET', headers: evoHeaders }
      );

      // Si no existe la instancia (404), crearla con QR habilitado
      if (response.status === 404) {
        response = await fetch(`${evolutionUrl}/instance/create`, {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });
      }

      if (!response.ok) {
        const errBody = await response.text();
        console.error('Evolution connect error:', response.status, errBody);
        return res.status(response.status).json({ error: 'Failed to connect or create instance' });
      }

      const data = await response.json();
      return res.status(200).json(data);
    }

    // ── ACCIÓN 3: Cerrar sesión de la instancia ───────────────────────────────
    if (action === 'logout') {
      if (!['POST', 'DELETE'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const response = await fetch(
        `${evolutionUrl}/instance/logout/${instanceName}`,
        { method: 'DELETE', headers: evoHeaders }
      );

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to logout instance' });
      }
      const data = await response.json().catch(() => ({ status: 'logged_out' }));
      return res.status(200).json(data);
    }

    // ── ACCIÓN 4: Listar grupos de WhatsApp ───────────────────────────────────
    if (action === 'groups') {
      const response = await fetch(
        `${evolutionUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`,
        { method: 'GET', headers: evoHeaders }
      );

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch WhatsApp groups' });
      }

      const data = await response.json();
      const groups = Array.isArray(data)
        ? data.map((g) => ({ id: g.id, subject: g.subject || g.id }))
        : [];
      return res.status(200).json(groups);
    }

    // ── ACCIÓN 5: Enviar mensaje de texto (a número o grupo @g.us) ────────────
    if (action === 'send-message') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const { number, text } = req.body || {};
      if (!number || typeof number !== 'string' || !text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid number or text parameters' });
      }

      const trimmed = number.trim();
      let destination;
      if (trimmed.endsWith('@g.us')) {
        if (!/^[0-9-]+@g\.us$/.test(trimmed)) {
          return res.status(400).json({ error: 'Invalid WhatsApp group JID format' });
        }
        destination = trimmed;
      } else {
        const cleanDigits = trimmed.replace(/\D/g, '');
        if (cleanDigits.length < 7 || cleanDigits.length > 15) {
          return res.status(400).json({ error: 'Invalid phone number format' });
        }
        destination = cleanDigits;
      }

      const safeText = text.slice(0, 1500);
      const response = await fetch(
        `${evolutionUrl}/message/sendText/${instanceName}`,
        {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({ number: destination, text: safeText }),
        }
      );

      if (!response.ok) {
        console.error('Evolution sendText error:', response.status);
        return res.status(502).json({ error: 'Failed to send WhatsApp message' });
      }

      return res.status(200).json({ status: 'sent' });
    }

    return res.status(400).json({ error: `Unsupported action: ${action}` });
  } catch (err) {
    console.error('api/evolution.js error:', err.message);
    return res.status(500).json({ error: 'Internal Evolution API gateway error' });
  }
};
