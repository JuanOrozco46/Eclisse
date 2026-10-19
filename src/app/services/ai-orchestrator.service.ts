import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';
import { environment } from '../../environments/environment';

export interface AIConfig {
  primaryModel: string;
  secondaryModel: string;
  tertiaryModel: string;
  systemPrompt: string;
  antiBlockDelay: number; // in ms
  geminiApiKey: string;
  menuImageUrl?: string;
  openHour?: number;
  closeHour?: number;
  armeniaFee?: number;
  outskirtsFee?: number;
  nequiPhone?: string;
  whatsappOrderPhone?: string;
  deliveryGroupNumber?: string;
}

export interface PlaygroundTurnResponse {
  reply: string;
  usedModel: string;
  intent: string;
}

export interface GeminiModelOption {
  id: string;
  label: string;
  badge: string;
}

export const AVAILABLE_GEMINI_MODELS: GeminiModelOption[] = [
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash (Recomendado — Rápido y Preciso)', badge: 'Recomendado' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Ultra rápido / Alto volumen)', badge: 'Ultra Rápido' },
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro (Máximo razonamiento)',              badge: 'Alta Capacidad' },
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash (Estable generación previa)',      badge: 'Estable' },
  { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash (Respaldo de emergencia)',         badge: 'Legacy' },
];

export const DEFAULT_BOT_RULES = `Sos Luisa, la anfitriona virtual de Eclisse Pizza Napoletana en Armenia, Quindío (Calle 2 norte #18-144). Solo atendemos domicilios y recogida en el local (no tenemos mesas en salón).

ESTILO Y PERSONALIDAD:
- Hablá con calidez, naturalidad colombiana/quindiana y agilidad de WhatsApp.
- Mensajes cortos y directos (máximo 1 a 2 líneas por turno).
- Usá emojis con moderación solo cuando aporten calidez (🍕, 😊, 📸).
- No repitas información que ya diste en la conversación.
- Si el cliente pide ver la carta, el menú o fotos, usá intent = "SEND_MENU" y respondé "Aquí está nuestra carta 🍕" (nunca envíes el menú completo en texto).

FLUJO PARA TOMAR PEDIDOS (hacé UNA pregunta a la vez):
1. Confirmá qué pizzas y bebidas desea pedir (cantidades y nombres del menú).
2. Preguntá la dirección exacta de entrega en Armenia/alrededores, o si pasa a recoger al local.
3. Preguntá el medio de pago: Efectivo o Nequi.
   - Si elige Nequi, indicale el número Nequi oficial y pedile foto del comprobante 📸.
4. Cuando tengas los 3 datos completos (productos, dirección/recogida y método de pago), emití intent = "CONFIRM_ORDER" (o "UPDATE_ORDER" si modifica un pedido activo) y confirmale el tiempo estimado (35-40 min domicilio, 20-25 min recogida).`;

const LEGACY_PLACEHOLDER_PREFIX = 'Tu nombre es Luisa y eres la anfitriona virtual de Eclisse Pizza Napoletana. Tu tono es profesional pero muy acogedor';

export function normalizeBotRules(rawPrompt?: string): string {
  const clean = String(rawPrompt || '').trim();
  if (!clean || clean.startsWith(LEGACY_PLACEHOLDER_PREFIX)) {
    return DEFAULT_BOT_RULES;
  }
  return clean;
}

@Injectable({
  providedIn: 'root'
})
export class AIOrchestratorService {
  private http = inject(HttpClient);
  private sb = inject(SupabaseService);
  private dataService = inject(DataService);
  private toast = inject(ToastService);

  // Configuración sincronizada con api/_lib/gemini.js y api/_lib/menu.js
  config = signal<AIConfig>({
    primaryModel: 'gemini-2.5-flash',
    secondaryModel: 'gemini-2.5-flash-lite',
    tertiaryModel: 'gemini-2.5-pro',
    systemPrompt: DEFAULT_BOT_RULES,
    antiBlockDelay: 2000,
    geminiApiKey: '',
    menuImageUrl: environment.menuImageUrl,
    openHour: 17,
    closeHour: 23,
    armeniaFee: 6000,
    outskirtsFee: 10000,
    nequiPhone: '3223119008',
    whatsappOrderPhone: '573004057195',
  });

  /**
   * Construye exactamente el mismo System Prompt autoritativo que usa el backend (api/_lib/gemini.js)
   * colocando las reglas editadas por el administrador como directriz principal.
   */
  buildFullSystemPrompt(overrideConfig?: Partial<AIConfig>): string {
    const cfg = { ...this.config(), ...(overrideConfig || {}) };
    const openH = Number.isFinite(Number(cfg.openHour)) ? Number(cfg.openHour) : 17;
    const closeH = Number.isFinite(Number(cfg.closeHour)) ? Number(cfg.closeHour) : 23;
    const armeniaFee = Number.isFinite(Number(cfg.armeniaFee)) ? Number(cfg.armeniaFee) : 6000;
    const outskirtsFee = Number.isFinite(Number(cfg.outskirtsFee)) ? Number(cfg.outskirtsFee) : 10000;
    const nequiPhone = cfg.nequiPhone || '3223119008';

    const formatHour12 = (h: number) => {
      if (h === 0) return '12 AM';
      if (h < 12) return `${h} AM`;
      if (h === 12) return '12 PM';
      return `${h - 12} PM`;
    };
    const openLabel = formatHour12(openH);
    const closeLabel = formatHour12(closeH);

    const bogotaHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).getHours();
    let timeNote = '';
    if (bogotaHour < openH) {
      timeNote = `\nNOTA HORARIA ACTUAL: Aún no abrimos (abrimos a las ${openLabel}). Podés tomar el pedido anticipado desde ya.`;
    }

    const menuItems = this.dataService.menuItems().filter(i => i.available);
    const catalog = menuItems
      .map(i => {
        const desc = i.description ? ` (${i.description})` : '';
        return `• [id: "${i.id}"] ${i.name} — $${Number(i.price || 0).toLocaleString('es-CO')}${desc}`;
      })
      .join('\n');

    const activeRules = normalizeBotRules(cfg.systemPrompt);

    return `=== REGLAS PRINCIPALES Y PERSONALIDAD DE LUISA (CONFIGURADAS EN EL ADMIN) ===
${activeRules}
${timeNote}

=== PARÁMETROS OPERATIVOS DEL NEGOCIO (AUTORITATIVOS) ===
- Ubicación: Armenia, Quindío — Calle 2 norte #18-144 (solo domicilios y recogida en local).
- Horario de atención: ${openLabel} a ${closeLabel} todos los días.
- Tarifas de domicilio:
  * "ARMENIA" (barrios dentro de Armenia): $${armeniaFee.toLocaleString('es-CO')}
  * "OUTSKIRTS" (afueras/alrededores como Circasia, Calarcá, El Caimo, Club Campestre): $${outskirtsFee.toLocaleString('es-CO')}
  * "PICKUP" (recoge en el local Calle 2 norte #18-144): $0 (gratis)
- Medios de pago: Efectivo o transferencia Nequi al número ${nequiPhone}.

=== MENÚ OFICIAL DISPONIBLE HOY (USA ESTOS menuItemId Y NOMBRES EXACTOS) ===
${catalog}

=== CONTRATO TÉCNICO DE RESPUESTA (OBLIGATORIO PARA EL SERVIDOR) ===
- Respondé siempre con el JSON estructurado requerido por el esquema (intent, reply, order).
- En "reply" escribí únicamente el mensaje para el cliente en WhatsApp (NUNCA incluyas bloques técnicos como PEDIDO_CONFIRMADO ni JSON crudo dentro de "reply").
- Si el cliente pide ver la carta o el menú, usá intent = "SEND_MENU".
- Mientras estés conversando o faltan datos del pedido, usá intent = "CHAT" y order = null.
- Cuando el cliente confirme productos, dirección/recogida y método de pago, usá intent = "CONFIRM_ORDER" (o "UPDATE_ORDER" si modifica un pedido activo) y completá el objeto "order" con los menuItemId de la carta. El servidor calculará y adjuntará el recibo con el total exacto automáticamente.`.trim();
  }

  async generatePlaygroundTurn(
    userMessage: string,
    history: { role: 'user' | 'model'; text: string }[] = [],
    overrideConfig?: Partial<AIConfig>
  ): Promise<PlaygroundTurnResponse> {
    const activeCfg: AIConfig = {
      ...this.config(),
      ...(overrideConfig || {}),
      systemPrompt: normalizeBotRules(overrideConfig?.systemPrompt ?? this.config().systemPrompt),
    };

    // 1. Intentar primero el endpoint backend (/api?action=playground) que ejecuta
    // exactamente el mismo contrato Zod + cálculo de pedido del servidor
    try {
      const { data: { session } } = await this.sb.client.auth.getSession();
      const token = session?.access_token;
      if (token) {
        const headers = new HttpHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        });
        const res: any = await firstValueFrom(
          this.http.post('/api?action=playground', {
            action: 'playground',
            message: userMessage,
            history,
            config: activeCfg,
          }, { headers })
        );
        if (res?.reply) {
          return {
            reply: res.reply,
            usedModel: res.usedModel || activeCfg.primaryModel,
            intent: res.intent || 'CHAT',
          };
        }
      }
    } catch {
      // Si se está ejecutando ng serve local sin funciones serverless, usar fallback directo si hay key
    }

    // 2. Fallback directo (desarrollo local con API key configurada en el panel)
    if (!activeCfg.geminiApiKey) {
      throw new Error('No se pudo conectar con /api?action=playground y no hay Gemini API Key local configurada en el panel.');
    }

    const models = [
      activeCfg.primaryModel,
      activeCfg.secondaryModel,
      activeCfg.tertiaryModel,
    ].filter(Boolean);

    const errors: string[] = [];
    for (const model of models) {
      try {
        const localResult = await this.callGeminiLocalFallback(model, userMessage, history, activeCfg);
        return {
          reply: localResult.reply,
          usedModel: model,
          intent: localResult.intent,
        };
      } catch (err: any) {
        errors.push(`${model}: ${err?.message || 'Error'}`);
        continue;
      }
    }

    throw new Error(`Todos los modelos fallaron (${errors.join(' | ')}). Verificá tu API Key o los modelos seleccionados.`);
  }

  async generateResponse(
    userMessage: string,
    history: { role: 'user' | 'model'; text: string }[] = []
  ): Promise<string> {
    const turn = await this.generatePlaygroundTurn(userMessage, history);
    return turn.reply;
  }

  private async callGeminiLocalFallback(
    model: string,
    prompt: string,
    history: { role: 'user' | 'model'; text: string }[],
    activeCfg: AIConfig
  ): Promise<{ reply: string; intent: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeCfg.geminiApiKey}`;
    const fullSystemPrompt = this.buildFullSystemPrompt(activeCfg);

    const contents = [
      ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: prompt }] },
    ];

    const body = {
      system_instruction: { parts: [{ text: fullSystemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
      },
    };

    const res: any = await firstValueFrom(this.http.post(url, body));
    const rawText = res?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Respuesta vacía de Gemini');
    }

    try {
      const parsed = JSON.parse(rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
      return {
        reply: parsed.reply || parsed.replyText || rawText,
        intent: parsed.intent || 'CHAT',
      };
    } catch {
      return { reply: rawText, intent: 'CHAT' };
    }
  }

  async saveConfig(newConfig: AIConfig): Promise<boolean> {
    const normalizedPrompt = normalizeBotRules(newConfig.systemPrompt);
    const merged: AIConfig = {
      ...this.config(),
      ...newConfig,
      systemPrompt: normalizedPrompt,
      deliveryGroupNumber: newConfig.deliveryGroupNumber ?? this.dataService.businessConfig().deliveryGroupNumber,
    };
    this.config.set(merged);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bot_ai_config', JSON.stringify(merged));
    }

    this.dataService.businessConfig.update(curr => ({
      openHour:            Number.isFinite(Number(merged.openHour))     ? Number(merged.openHour)     : curr.openHour,
      closeHour:           Number.isFinite(Number(merged.closeHour))    ? Number(merged.closeHour)    : curr.closeHour,
      armeniaFee:          Number.isFinite(Number(merged.armeniaFee))   ? Number(merged.armeniaFee)   : curr.armeniaFee,
      outskirtsFee:        Number.isFinite(Number(merged.outskirtsFee)) ? Number(merged.outskirtsFee) : curr.outskirtsFee,
      whatsappOrderPhone:  merged.whatsappOrderPhone  || curr.whatsappOrderPhone,
      nequiPhone:          merged.nequiPhone          || curr.nequiPhone,
      deliveryGroupNumber: merged.deliveryGroupNumber ?? curr.deliveryGroupNumber,
    }));

    try {
      const { error } = await this.sb.client.from('rappi_config').upsert({
        id: 'bot_config',
        connected: true,
        api_key: JSON.stringify(merged),
      });
      if (error) {
        this.toast.showError('Error al guardar configuración en Supabase: ' + error.message);
        return false;
      }
      await this.dataService.invalidateMenuCache();
      this.toast.showSuccess('Reglas de Luisa, horarios y modelos guardados y activos en WhatsApp');
      return true;
    } catch (e) {
      console.error('Error saving bot config to Supabase:', e);
      this.toast.showError('No se pudo guardar la configuración en la base de datos.');
      return false;
    }
  }

  async loadConfig(): Promise<AIConfig> {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('bot_ai_config');
      if (saved) {
        try {
          const parsedLocal = JSON.parse(saved) as AIConfig;
          this.config.set({
            ...this.config(),
            ...parsedLocal,
            systemPrompt: normalizeBotRules(parsedLocal.systemPrompt),
          });
        } catch {}
      }
    }
    try {
      const { data } = await this.sb.client
        .from('rappi_config')
        .select('*')
        .eq('id', 'bot_config')
        .maybeSingle();

      if (data && data.api_key) {
        const parsed = JSON.parse(data.api_key) as AIConfig;
        const validIds = AVAILABLE_GEMINI_MODELS.map(m => m.id);
        const next: AIConfig = {
          ...this.config(),
          ...parsed,
          primaryModel:   validIds.includes(parsed.primaryModel)   ? parsed.primaryModel   : 'gemini-2.5-flash',
          secondaryModel: validIds.includes(parsed.secondaryModel) ? parsed.secondaryModel : 'gemini-2.5-flash-lite',
          tertiaryModel:  validIds.includes(parsed.tertiaryModel)  ? parsed.tertiaryModel  : 'gemini-2.5-pro',
          systemPrompt:   normalizeBotRules(parsed.systemPrompt),
        };
        this.config.set(next);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('bot_ai_config', JSON.stringify(next));
        }
      }
    } catch (e) {
      console.warn('Could not load bot config from Supabase, using local instead:', e);
    }
    return this.config();
  }
}
