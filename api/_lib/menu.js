const { getSupabase, menuCache } = require('./cache');

// ─── Horario del restaurante y tarifas de servidor ────────────
const OPEN_HOUR  = 17; // 5 PM
const CLOSE_HOUR = 23; // 11 PM

// Tarifas de domicilio autoritativas en el servidor (el LLM nunca dicta precios ni tarifas)
const DELIVERY_FEES = {
  PICKUP:    0,
  ARMENIA:   6000,
  OUTSKIRTS: 10000,
};

function getBogotaHour() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).getHours();
}

function isOpen(forcedHour = null, openHour = OPEN_HOUR, closeHour = CLOSE_HOUR) {
  const h = forcedHour !== null ? forcedHour : getBogotaHour();
  const start = Number.isFinite(Number(openHour)) ? Number(openHour) : OPEN_HOUR;
  const end   = Number.isFinite(Number(closeHour)) ? Number(closeHour) : CLOSE_HOUR;
  return h >= start && h < end;
}

// ─── Menú por defecto y consulta de carta ────────────────────
const DEFAULT_MENU = [
  { id: '1',  name: 'Bianca',                   price: 25000 },
  { id: '2',  name: 'Lumina',                   price: 25000 },
  { id: '3',  name: 'Hawaianna',                price: 25000 },
  { id: '4',  name: 'Dorato',                   price: 25000 },
  { id: '5',  name: 'Amalgama',                 price: 25000 },
  { id: '6',  name: 'Dolce Fiamma',             price: 25000 },
  { id: '7',  name: 'Coca-Cola Original 250ml', price: 3000  },
  { id: '8',  name: 'Coca-Cola Zero 250ml',     price: 3000  },
  { id: '9',  name: 'Quatro 250ml',             price: 3000  },
  { id: '10', name: 'Coca-Cola Original 1.5L',  price: 8000  },
  { id: '11', name: 'Coca-Cola Zero 1.5L',      price: 8000  },
];

async function fetchMenuItems() {
  const cached = menuCache.get('menu');
  if (cached) return cached;
  try {
    const { data } = await getSupabase().from('menu_items').select('*').eq('available', true);
    if (data && data.length > 0) { menuCache.set('menu', data); return data; }
  } catch {}
  menuCache.set('menu', DEFAULT_MENU);
  return DEFAULT_MENU;
}

// ─── Resolución de ítems y cálculo autoritativo en servidor ──
function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveMenuItem(rawItem, menuItems) {
  if (!rawItem || !Array.isArray(menuItems)) return null;

  // 1. Por ID exacto
  if (rawItem.menuItemId) {
    const byId = menuItems.find(m => String(m.id) === String(rawItem.menuItemId).trim());
    if (byId) return byId;
  }

  // 2. Por nombre normalizado exacto o contenido
  const targetName = normalizeText(rawItem.name || rawItem.menuItemId);
  if (!targetName) return null;

  const exactByName = menuItems.find(m => normalizeText(m.name) === targetName);
  if (exactByName) return exactByName;

  return menuItems.find(m => {
    const candidate = normalizeText(m.name);
    return candidate.includes(targetName) || targetName.includes(candidate);
  }) || null;
}

function isMenuRequest(text) {
  const t = String(text || '').toLowerCase();
  return ['menu', 'menú', 'carta', 'que tienen', 'qué tienen', 'que hay', 'qué hay', 'foto', 'fotos']
    .some(w => t.includes(w));
}

function isCurtMessage(text) {
  const clean = String(text || '').trim().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?¡!¿]/g, '').trim();
  const curtWords = ['ok', 'okey', 'vale', 'gracias', 'grx', 'bueno', 'listo', 'thanks', 'ty', 'chao', 'adios', 'dale', '👍', '👌'];
  if (curtWords.includes(clean)) return true;
  const tokens = clean.split(/\s+/).filter(Boolean);
  return tokens.length >= 1 && tokens.length <= 2 && tokens.every(t => curtWords.includes(t));
}


module.exports = {
  OPEN_HOUR,
  CLOSE_HOUR,
  DELIVERY_FEES,
  DEFAULT_MENU,
  getBogotaHour,
  isOpen,
  fetchMenuItems,
  normalizeText,
  resolveMenuItem,
  isMenuRequest,
  isCurtMessage,
};
