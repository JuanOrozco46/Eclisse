/**
 * bot-server.js — DESHABILITADO
 *
 * Este servidor local fue reemplazado por api/index.js (Vercel serverless).
 * Tener ambos activos al mismo tiempo causaba que cada mensaje de WhatsApp
 * recibiera DOS respuestas (una de cada bot).
 *
 * Si necesitás correr el bot localmente para desarrollo, usá:
 *   vercel dev
 * o copiá la lógica de api/index.js aquí y asegurate de que solo
 * UNO de los dos esté registrado como webhook en Evolution API.
 */

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'disabled', message: 'Bot local deshabilitado. El bot activo corre en Vercel (api/index.js).' });
});

// Acepta el webhook pero no hace nada — evita errores 404 si Evolution
// todavía apunta a esta URL mientras migrás el webhook
app.post('/webhook', (req, res) => {
  res.status(200).json({ status: 'disabled' });
});

app.listen(PORT, () => {
  console.log(`[bot-server.js] Servidor stub en puerto ${PORT} — no procesa mensajes.`);
  console.log(`[bot-server.js] El bot activo está en api/index.js (Vercel).`);
});
