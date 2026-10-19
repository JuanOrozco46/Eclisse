const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ─── Validación fail-fast de variables de entorno ──────────────
function getEnvVar(name) {
  const val = process.env[name];
  if (!val || !val.trim()) {
    throw new Error(`Variable de entorno obligatoria no configurada: ${name}`);
  }
  return val.trim();
}

let _supabaseClient = null;
function getSupabase() {
  if (!_supabaseClient) {
    const supabaseUrl = getEnvVar('SUPABASE_URL');
    // Exclusivamente SUPABASE_SERVICE_ROLE_KEY; nunca degradar a ANON_KEY en el backend
    const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
    _supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabaseClient;
}

function setSupabaseClientForTesting(client) {
  _supabaseClient = client;
}

function getRequiredEnv() {
  return {
    SUPABASE_URL:              getEnvVar('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    EVOLUTION_API_URL:         getEnvVar('EVOLUTION_API_URL').replace(/\/+$/, ''),
    EVOLUTION_API_KEY:         getEnvVar('EVOLUTION_API_KEY'),
    EVOLUTION_INSTANCE:        (process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01').trim(),
    FALLBACK_GEMINI_KEY:       getEnvVar('GEMINI_API_KEY'),
    MENU_IMAGE_URL:            (process.env.MENU_IMAGE_URL || 'https://eclisse.vercel.app/assets/menu-eclisse.jpg').trim(),
    WEBHOOK_SECRET:            getEnvVar('WEBHOOK_SECRET'),
    ADMIN_WHATSAPP_PHONE:      (process.env.ADMIN_WHATSAPP_PHONE || '573004057195').replace(/\D/g, ''),
  };
}

function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── Cache con TTL genérico ───────────────────────────────────
function makeCache(ttlMs) {
  const store = new Map();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (Date.now() - e.ts > ttlMs) { store.delete(key); return null; }
      return e.value;
    },
    set(key, value) { store.set(key, { value, ts: Date.now() }); },
    delete(key) { store.delete(key); },
    has(key) { return this.get(key) !== null; },
    invalidate() { store.clear(); },
  };
}

const processedMessages    = makeCache(60 * 1000);       // dedup messageId 1 min
const configCache          = makeCache(5 * 60 * 1000);   // bot config 5 min
const menuCache            = makeCache(2 * 60 * 1000);   // menú 2 min
const conversationMemCache = makeCache(30 * 60 * 1000);  // conversación + estado pedido activo 30 min

module.exports = {
  getEnvVar,
  getSupabase,
  setSupabaseClientForTesting,
  getRequiredEnv,
  timingSafeMatch,
  makeCache,
  processedMessages,
  configCache,
  menuCache,
  conversationMemCache,
};
