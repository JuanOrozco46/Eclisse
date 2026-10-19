import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import bot from '../api/index';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key: string, value: string) {
      res.headers[key] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
    send(text: string) {
      res.body = text;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

describe('Fase 3: Webhook Integration Tests (Evolution API Payloads)', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://mock-supabase.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-xyz';
    process.env.EVOLUTION_API_URL = 'https://mock-evolution.com';
    process.env.EVOLUTION_API_KEY = 'mock-evolution-key';
    process.env.EVOLUTION_INSTANCE = 'ECLISSE_WA_01';
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    process.env.WEBHOOK_SECRET = 'secret_webhook_12345';
    process.env.ADMIN_WHATSAPP_PHONE = '573004057195';
    process.env.MENU_IMAGE_URL = 'https://eclisse.vercel.app/assets/menu-eclisse.jpg';

    originalFetch = globalThis.fetch;
    bot.processedMessages.invalidate();
    bot.menuCache.invalidate();
    bot.configCache.invalidate();
    bot.conversationMemCache.invalidate();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects requests without WEBHOOK_SECRET with 403 Forbidden', async () => {
    const req: any = {
      method: 'POST',
      headers: {},
      query: {},
      body: { event: 'messages.upsert' },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Unauthorized webhook request' });
  });

  it('rejects requests with incorrect WEBHOOK_SECRET with 403 Forbidden', async () => {
    const req: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'wrong_secret' },
      query: {},
      body: { event: 'messages.upsert' },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Unauthorized webhook request' });
  });

  it('ignores events other than messages.upsert', async () => {
    const req: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      body: { event: 'connection.update', data: { state: 'open' } },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ignored_event' });
  });

  it('ignores group messages (@g.us) to prevent bot loops in groups', async () => {
    const req: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      body: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '12036301234567@g.us', fromMe: false, id: 'MSG_GRP_01' },
          message: { conversation: 'Hola grupo' },
        },
      },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ignored' });
  });

  it('ignores fromMe messages sent by the bot itself', async () => {
    const req: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      body: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '573001234567@s.whatsapp.net', fromMe: true, id: 'MSG_FROM_ME_01' },
          message: { conversation: 'Tu pedido va en camino' },
        },
      },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ignored' });
  });

  it('ignores duplicate messages with the same messageId', async () => {
    const payload = {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '573001234567@s.whatsapp.net', fromMe: false, id: 'MSG_DUP_01' },
        message: { conversation: 'ok' },
      },
    };

    const req1: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      body: payload,
    };
    const res1 = createMockRes();
    await bot(req1, res1);

    const req2: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      body: payload,
    };
    const res2 = createMockRes();
    await bot(req2, res2);

    expect(res2.statusCode).toBe(200);
    expect(res2.body).toEqual({ status: 'duplicate_ignored' });
  });

  it('responds with audio polite notice when audio message is received', async () => {
    const outgoingCalls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      outgoingCalls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    });

    const req: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      body: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '573001234567@s.whatsapp.net', fromMe: false, id: 'MSG_AUDIO_01' },
          messageType: 'audioMessage',
          message: { audioMessage: { url: 'https://example.com/audio.ogg' } },
        },
      },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'audio_handled' });

    // Verify WhatsApp text reply was sent
    const textMsg = outgoingCalls.find(c => c.url.includes('/message/sendText'));
    expect(textMsg).toBeDefined();
    expect(textMsg.body.text).toContain('Solo puedo leer texto');
  });

  it('serves menu image directly without calling Gemini when client asks for the menu', async () => {
    const outgoingCalls: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      outgoingCalls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    });

    // Mock open restaurant hours
    vi.spyOn(bot, 'isOpen').mockReturnValue(true);

    const req: any = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      body: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '573001234567@s.whatsapp.net', fromMe: false, id: 'MSG_MENU_01' },
          message: { conversation: 'Hola, me mandas la carta?' },
        },
      },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'menu_sent' });

    // Verify menu image was sent
    const mediaMsg = outgoingCalls.find(c => c.url.includes('/message/sendMedia'));
    expect(mediaMsg).toBeDefined();
    expect(mediaMsg.body.mediatype).toBe('image');
    expect(mediaMsg.body.media).toBe('https://eclisse.vercel.app/assets/menu-eclisse.jpg');
  });

  it('invalidates cache via GET /api?action=bust-cache with valid secret', async () => {
    bot.menuCache.set('menu', [{ id: '99', name: 'Cached Pizza', price: 10000 }]);
    expect(bot.menuCache.get('menu')).not.toBeNull();

    const req: any = {
      method: 'GET',
      headers: { 'x-webhook-secret': 'secret_webhook_12345' },
      query: { action: 'bust-cache' },
    };
    const res = createMockRes();

    await bot(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'cache_cleared' });
    expect(bot.menuCache.get('menu')).toBeNull();
  });
});
