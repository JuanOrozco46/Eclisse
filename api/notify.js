/**
 * api/notify.js
 *
 * Endpoint Vercel serverless: POST /api/notify
 * El dashboard Angular lo llama cuando cambia el estado del pedido para
 * enviarle un WhatsApp automático al cliente.
 *
 * Body: { phone: string, message: string }
 * Headers: x-api-key: <EVOLUTION_API_KEY>
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://elhornobotprueba1.onrender.com';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'secreto123';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'ECLISSE_WA_01';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type,X-Requested-With,Accept,x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Validación básica del API key para que solo el dashboard autorizado pueda llamar este endpoint
  const incomingKey = req.headers['x-api-key'];
  if (incomingKey !== EVOLUTION_API_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { phone, message } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone or message' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const response = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: cleanPhone, text: message }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Evolution API error:', response.status, errorText);
      return res.status(502).json({ error: 'Failed to send WhatsApp message', detail: errorText });
    }

    return res.status(200).json({ status: 'sent' });
  } catch (err) {
    console.error('notify.js error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
