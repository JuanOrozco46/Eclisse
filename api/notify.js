/**
 * api/notify.js
 *
 * Endpoint Vercel serverless: POST /api/notify
 * El dashboard Angular lo llama cuando cambia el estado del pedido para
 * enviarle un WhatsApp automático al cliente.
 *
 * Body: { phone: string, message: string }
 * Headers: Authorization: Bearer <SUPABASE_JWT_USER_TOKEN>
 */

const { createClient } = require('@supabase/supabase-js');

// Helper para validar variables obligatorias de entorno sin exponer secretos
function getEnvVar(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Variable de entorno obligatoria no configurada: ${name}`);
  }
  return val;
}

module.exports = async (req, res) => {
  // CORS seguro
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Extraer y verificar JWT de Supabase de la cabecera Authorization
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authentication token' });
  }

  let supabaseUrl, supabaseAnonKey, evolutionUrl, evolutionKey, evolutionInstance;
  try {
    supabaseUrl = getEnvVar('SUPABASE_URL');
    supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY');
    evolutionUrl = getEnvVar('EVOLUTION_API_URL');
    evolutionKey = getEnvVar('EVOLUTION_API_KEY');
    evolutionInstance = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01';
  } catch (envError) {
    console.error('Configuración de servidor incompleta:', envError.message);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  // Validar sesión del usuario a través del token JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  // 2. Verificar rol en la tabla profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !['ADMIN', 'KITCHEN'].includes(profile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  // 3. Validar payload
  const { phone, message } = req.body || {};
  if (!phone || typeof phone !== 'string' || !message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid phone or message parameters' });
  }

  // Limitar longitud del mensaje y limpiar teléfono
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 7 || cleanPhone.length > 15) {
    return res.status(400).json({ error: 'Invalid phone format' });
  }
  const safeMessage = message.slice(0, 1000);

  // 4. Enviar WhatsApp mediante Evolution API
  try {
    const response = await fetch(
      `${evolutionUrl}/message/sendText/${evolutionInstance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionKey,
        },
        body: JSON.stringify({ number: cleanPhone, text: safeMessage }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Evolution API error:', response.status, errorText);
      return res.status(502).json({ error: 'Failed to send WhatsApp message' });
    }

    return res.status(200).json({ status: 'sent' });
  } catch (err) {
    console.error('notify.js execution error:', err.message);
    return res.status(500).json({ error: 'Internal notification error' });
  }
};
