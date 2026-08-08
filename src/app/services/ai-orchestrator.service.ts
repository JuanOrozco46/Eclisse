import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';

export interface AIConfig {
  primaryModel: string;
  secondaryModel: string;
  tertiaryModel: string;
  systemPrompt: string;
  antiBlockDelay: number; // in ms
  geminiApiKey: string;
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
    geminiApiKey: ''
  });

  private get geminiApiKey() { return this.config().geminiApiKey; }

  private buildFullSystemPrompt(): string {
    const base = this.config().systemPrompt;
    const menuItems = this.dataService.menuItems().filter(i => i.available);
    
    if (menuItems.length === 0) return base;

    const catalogText = menuItems.map(item => {
      const priceFormatted = item.price.toLocaleString('es-CO');
      const ingr = item.ingredients && item.ingredients.length > 0 ? ` (Ingredientes: ${item.ingredients.join(', ')})` : '';
      return `• ${item.name} - $${priceFormatted} COP [Categoría: ${item.category}]: ${item.description}${ingr}`;
    }).join('\n');

    return `${base}\n\n--- CARTA ACTUALIZADA EN TIEMPO REAL (Usa estos nombres y precios exactos) ---\n${catalogText}`;
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
