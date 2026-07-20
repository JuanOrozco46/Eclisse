import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
    
    const body = {
      contents: [{
        parts: [{ text: `${this.config().systemPrompt}\n\nCliente: ${prompt}` }]
      }]
    };

    const res: any = await firstValueFrom(this.http.post(url, body));
    
    if (res.candidates && res.candidates[0].content.parts[0].text) {
      return res.candidates[0].content.parts[0].text;
    }
    
    throw new Error('Invalid response from Gemini');
  }

  saveConfig(newConfig: AIConfig) {
    this.config.set(newConfig);
    localStorage.setItem('bot_ai_config', JSON.stringify(newConfig));
  }

  loadConfig() {
    const saved = localStorage.getItem('bot_ai_config');
    if (saved) {
      this.config.set(JSON.parse(saved));
    }
  }
}
