import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

export interface AIConfig {
  primaryModel: string;
  secondaryModel: string;
  tertiaryModel: string;
  systemPrompt: string;
  antiBlockDelay: number; // in ms
  geminiApiKey: string;
  menuImageUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AIOrchestratorService {
  private http = inject(HttpClient);
  private sb = inject(SupabaseService);
  private dataService = inject(DataService);

  // Default configuration (using the order you suggested)
  config = signal<AIConfig>({
    primaryModel: 'gemini-1.5-flash',
    secondaryModel: 'gemini-2.0-flash-exp', // Using experimental/latest for your "3.0" reference
    tertiaryModel: 'gemini-1.5-pro',
    systemPrompt: 'Tu nombre es Luisa y eres la anfitriona virtual de Eclisse Pizza Napoletana. Tu tono es profesional pero muy acogedor y sofisticado. Tu objetivo es guiar a los clientes a través de nuestra carta artesanal, ayudarles con sus pedidos y transmitir la pasión por la pizza auténtica. Siempre respondes con cortesía y usas un lenguaje que refleja la calidad premium de Eclisse.',
    antiBlockDelay: 2000,
    geminiApiKey: '',
    menuImageUrl: environment.menuImageUrl
  });

  private get geminiApiKey() { return this.config().geminiApiKey; }

  private buildFullSystemPrompt(): string {
    const basePrompt = this.config().systemPrompt;
    const menuImage = this.config().menuImageUrl || environment.menuImageUrl;
    const now = new Date();
    const currentDate = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    let timeStatus = '';
    if (currentHour < 12) {
      timeStatus = `\n⚠️ ESTADO ACTUAL: PRE-APERTURA (Son las ${currentHour}:${currentMinutes < 10 ? '0' : ''}${currentMinutes} AM). Atiende amablemente y aclara que nuestro horno abre a las 12:00 PM, pero puedes tomar el pedido de forma anticipada.`;
    } else if (currentHour >= 22) {
      timeStatus = `\n⚠️ ESTADO ACTUAL: CERRADO (Son las ${currentHour}:${currentMinutes < 10 ? '0' : ''}${currentMinutes}). Ya cerramos por hoy. Dile amablemente al cliente que abrimos de nuevo mañana a las 12:00 PM.`;
    } else if (currentHour >= 21.5) {
      timeStatus = `\n⚠️ ESTADO ACTUAL: ÚLTIMAS ÓRDENES / SOLO RECOGER. No hay domicilios disponibles a esta hora, solo para recoger en el local.`;
    }

    const menuItems = this.dataService.menuItems().filter(i => i.available);
    let catalogText = 'Actualmente no hay productos registrados.';
    if (menuItems.length > 0) {
      catalogText = menuItems.map(item => {
        const priceFormatted = item.price.toLocaleString('es-CO');
        const ingr = item.ingredients && item.ingredients.length > 0 ? ` (Ingredientes: ${item.ingredients.join(', ')})` : '';
        return `• ${item.name} - $${priceFormatted} COP [Categoría: ${item.category}]: ${item.description}${ingr}`;
      }).join('\n');
    }

    return `
REGLA DE ORO ANTI-SPAM DE WHATSAPP:
- NUNCA RESPONDAS EXACTAMENTE IGUAL A DOS CLIENTES SEGUIDOS.
- VARÍA SIEMPRE LA ESTRUCTURA, EL TONO, LAS PALABRAS Y EL USO DE EMOJIS.
- Ejemplos de variaciones (Inspírate en ellos, NO los copies al pie de la letra):
  * Estilo directo: "¡Hola! Con gusto te tomo el pedido. ¿A qué dirección lo enviamos?"
  * Estilo acogedor: "¡Buenas tardes! 🍕 Qué gusto saludarte. ¿Qué pizza se te antoja hoy?"
  * Estilo breve: "Dale, perfecto. ¿Me confirmas tu nombre y barrio en Armenia?"
  * Estilo explicativo: "Con todo gusto. Te confirmo que el domicilio dentro de Armenia es de $6.000 COP."

INFORMACIÓN DEL RESTAURANTE Y CONCEPTO:
- Nombre: Eclisse Pizza Napoletana (Artesanal y de Fuego)
- Modelo de Negocio: COCINA OCULTA (Dark Kitchen). No atendemos mesas en el sitio ni contamos con salón comedor.
- Dirección Única de Recogida: Calle 2 norte #18-144, Armenia, Quindío.
- Si el cliente pregunta dónde están ubicados o desea RECOGER su pedido en persona, aclárale amablemente que somos una cocina oculta y dale la dirección exacta: Calle 2 norte #18-144, Armenia.
- Ubicación General: Armenia, Quindío
- Fecha y Hora Actual: ${currentDate} (${currentHour}:${currentMinutes < 10 ? '0' : ''}${currentMinutes}) ${timeStatus}

IMAGEN DE LA CARTA / MENÚ DIGITAL:
- Enlace de la Carta/Menú: ${menuImage}
- Si el cliente solicita el menú, la carta o fotos de las pizzas (intent "send_menu" o texto pidiendo el menú), incluye o comparte el enlace de la carta (${menuImage}) con una frase acogedora.

TARIFAS DE DOMICILIO (ARMENIA, QUINDÍO):
- Domicilio estándar a cualquier barrio dentro de Armenia: $6.000 COP.
- Afueras o Alrededores de Armenia (ej. Circasia, Calarcá, Tébaras, El Caimo, Club Campestre): $8.000 - $12.000 COP.
- Recoger en el local (Calle 2 norte #18-144): $0 (Gratis).

MÉTODOS DE PAGO Y TRANSFERENCIA:
- Aceptamos Efectivo (Contraentrega) y Nequi / Bancolombia / Transferencia.
- Datos de Nequi: Nequi al 3223119008 o Llave Nequi @3223119008.
- Para pagos por Transferencia/Nequi: Solicita siempre la foto del comprobante de pago ANTES de confirmar la orden.
- Revisa en el comprobante que la fecha sea de hoy y el valor coincida con el total.

NOTAS Y OBSERVACIONES DE CLIENTES PARA COCINA:
- Si el cliente solicita cualquier cambio o especificación (ej: "Sin cebolla", "Masa bien tostada", "Salsa aparte", "Pide cubiertos o vasos"), DEBES registrarlo en el campo 'notes' de la orden o de los ítems. Este dato irá directo al Monitor de Cocina.

INVENTARIO Y CARTA VIGENTE EN TIEMPO REAL:
${catalogText}

${basePrompt}

FORMATO DE SALIDA (ESTRICTO JSON):
Si el cliente solo está saludando o preguntando, puedes responder con JSON simple:
{
  "intent": "chat" | "order" | "send_menu",
  "replyText": "Tu respuesta amable y única aquí."
}

Si el cliente está realizando o confirmando un pedido, incluye el objeto 'orderData':
{
  "intent": "chat" | "order",
  "replyText": "Respuesta al cliente confirmando o solicitando datos.",
  "orderData": {
    "customerName": "Nombre del cliente",
    "customerAddress": "Dirección completa y barrio en Armenia",
    "customerPhone": "Teléfono",
    "paymentMethod": "CASH" | "TRANSFER",
    "deliveryFee": 6000,
    "notes": "Notas generales para cocina (ej: Sin cebolla, extra servilletas)",
    "items": [
      { "productName": "Nombre exacto de la pizza o producto", "quantity": 1, "notes": "Notas del producto" }
    ]
  }
}
`;
  }

  async generateResponse(userMessage: string): Promise<string> {
    const models = [
      this.config().primaryModel,
      this.config().secondaryModel,
      this.config().tertiaryModel
    ];

    for (const model of models) {
      try {
        const response = await this.callGemini(model, userMessage);
        return response;
      } catch (error) {
        // Fallback to next model if current one fails
        continue; 
      }
    }

    throw new Error('Todos los modelos de IA están saturados en este momento.');
  }

  private async callGemini(model: string, prompt: string): Promise<string> {
    // Implementación real de la llamada a Gemini API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;
    
    const fullSystemPrompt = this.buildFullSystemPrompt();

    const body = {
      contents: [{
        parts: [{ text: `${fullSystemPrompt}\n\nCliente: ${prompt}` }]
      }]
    };

    const res: any = await firstValueFrom(this.http.post(url, body));
    
    if (res.candidates && res.candidates[0].content.parts[0].text) {
      return res.candidates[0].content.parts[0].text;
    }
    
    throw new Error('Invalid response from Gemini');
  }

  async saveConfig(newConfig: AIConfig) {
    this.config.set(newConfig);
    localStorage.setItem('bot_ai_config', JSON.stringify(newConfig));
    try {
      await this.sb.client.from('rappi_config').upsert({
        id: 'bot_config',
        connected: true,
        api_key: JSON.stringify(newConfig)
      });
    } catch (e) {
      console.error('Error saving bot config to Supabase:', e);
    }
  }

  async loadConfig() {
    const saved = localStorage.getItem('bot_ai_config');
    if (saved) {
      this.config.set(JSON.parse(saved));
    }
    try {
      const { data } = await this.sb.client
        .from('rappi_config')
        .select('*')
        .eq('id', 'bot_config')
        .maybeSingle();
      
      if (data && data.api_key) {
        const parsed = JSON.parse(data.api_key) as AIConfig;
        this.config.set(parsed);
        localStorage.setItem('bot_ai_config', JSON.stringify(parsed));
      }
    } catch (e) {
      console.warn('Could not load bot config from Supabase, using local instead:', e);
    }
  }
}
