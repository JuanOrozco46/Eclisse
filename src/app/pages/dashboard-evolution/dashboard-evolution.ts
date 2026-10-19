import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvolutionService } from '../../services/evolution.service';
import {
  AIOrchestratorService,
  AIConfig,
  AVAILABLE_GEMINI_MODELS,
  DEFAULT_BOT_RULES,
} from '../../services/ai-orchestrator.service';
import { DataService } from '../../services/data.service';
import { ToastService } from '../../services/toast.service';

interface PlaygroundMessage {
  sender: 'user' | 'bot';
  text: string;
  time: string;
  usedModel?: string;
  intent?: string;
}

@Component({
  selector: 'app-dashboard-evolution',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-evolution.html',
  styles: ``,
})
export class DashboardEvolution implements OnInit {
  private evolution = inject(EvolutionService);
  private aiOrchestrator = inject(AIOrchestratorService);
  private dataService = inject(DataService);
  private toast = inject(ToastService);

  instance = this.evolution.instanceStatus;
  loading = this.evolution.loading;
  error = this.evolution.error;
  botEvents = this.dataService.botEvents;

  // Modelos oficiales válidos de Gemini
  availableModels = AVAILABLE_GEMINI_MODELS;

  // Estado reactivo del formulario unificado (sincronizado con Supabase)
  aiConfig = this.aiOrchestrator.config;
  form: AIConfig = { ...this.aiOrchestrator.config() };

  savingConfig = signal<boolean>(false);
  showPromptPreview = false;
  showApiKey = false;

  // AI Live Playground
  testMessageText = '';
  testLoading = signal<boolean>(false);
  testMessages = signal<PlaygroundMessage[]>([
    {
      sender: 'bot',
      text: '¡Hola! Soy Luisa 🍕 Escribime aquí para probar en vivo mis reglas, horarios, precios del menú y modelos de IA.',
      time: 'Ahora',
      usedModel: this.form.primaryModel,
      intent: 'CHAT',
    },
  ]);

  async ngOnInit() {
    this.evolution.checkStatus();
    this.dataService.refreshBotEvents();
    const loaded = await this.aiOrchestrator.loadConfig();
    this.form = { ...loaded };
  }

  formatHourLabel(hour?: number): string {
    const h = Number.isFinite(Number(hour)) ? Number(hour) : 17;
    if (h === 0 || h === 24) return '12:00 AM';
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return '12:00 PM';
    return `${h - 12}:00 PM`;
  }

  get fullSystemPromptPreview(): string {
    return this.aiOrchestrator.buildFullSystemPrompt(this.form);
  }

  hasUnsavedChanges(): boolean {
    const saved = this.aiConfig();
    return (
      this.form.systemPrompt.trim() !== (saved.systemPrompt || '').trim() ||
      this.form.primaryModel !== saved.primaryModel ||
      this.form.secondaryModel !== saved.secondaryModel ||
      this.form.tertiaryModel !== saved.tertiaryModel ||
      (this.form.geminiApiKey || '') !== (saved.geminiApiKey || '') ||
      Number(this.form.openHour) !== Number(saved.openHour) ||
      Number(this.form.closeHour) !== Number(saved.closeHour) ||
      Number(this.form.armeniaFee) !== Number(saved.armeniaFee) ||
      Number(this.form.outskirtsFee) !== Number(saved.outskirtsFee) ||
      (this.form.nequiPhone || '').trim() !== (saved.nequiPhone || '').trim() ||
      (this.form.whatsappOrderPhone || '').trim() !== (saved.whatsappOrderPhone || '').trim()
    );
  }

  restoreDefaultRules() {
    this.form.systemPrompt = DEFAULT_BOT_RULES;
    this.toast.showInfo('Reglas base de Luisa cargadas en el editor. Pulsa Guardar para aplicarlas.');
  }

  async saveAllConfig() {
    if (this.savingConfig()) return;
    this.savingConfig.set(true);
    try {
      const cleanConfig: AIConfig = {
        ...this.aiConfig(),
        ...this.form,
        primaryModel: this.form.primaryModel || 'gemini-2.5-flash',
        secondaryModel: this.form.secondaryModel || 'gemini-2.5-flash-lite',
        tertiaryModel: this.form.tertiaryModel || 'gemini-2.5-pro',
        systemPrompt: this.form.systemPrompt,
        geminiApiKey: (this.form.geminiApiKey || '').trim(),
        openHour: Number.isFinite(Number(this.form.openHour)) ? Number(this.form.openHour) : 17,
        closeHour: Number.isFinite(Number(this.form.closeHour)) ? Number(this.form.closeHour) : 23,
        armeniaFee: Number.isFinite(Number(this.form.armeniaFee)) ? Number(this.form.armeniaFee) : 6000,
        outskirtsFee: Number.isFinite(Number(this.form.outskirtsFee)) ? Number(this.form.outskirtsFee) : 10000,
        nequiPhone: (this.form.nequiPhone || '3223119008').trim(),
        whatsappOrderPhone: (this.form.whatsappOrderPhone || '573004057195').trim(),
      };
      await this.aiOrchestrator.saveConfig(cleanConfig);
      this.form = { ...this.aiOrchestrator.config() };
    } finally {
      this.savingConfig.set(false);
    }
  }

  sendQuickPrompt(promptText: string) {
    this.testMessageText = promptText;
    this.sendTestMessage();
  }

  clearPlayground() {
    this.testMessages.set([
      {
        sender: 'bot',
        text: 'Conversación reiniciada 🔄 Escribime para probar las reglas e instrucciones actuales de Luisa.',
        time: 'Ahora',
        usedModel: this.form.primaryModel,
        intent: 'CHAT',
      },
    ]);
  }

  async sendTestMessage() {
    const text = this.testMessageText.trim();
    if (!text || this.testLoading()) return;

    const history = this.testMessages()
      .slice(1) // omit initial greeting placeholder
      .map(m => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.text,
      }));

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.testMessages.update(m => [...m, { sender: 'user', text, time }]);
    this.testMessageText = '';
    this.testLoading.set(true);

    try {
      const turn = await this.aiOrchestrator.generatePlaygroundTurn(text, history, this.form);
      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.testMessages.update(m => [
        ...m,
        {
          sender: 'bot',
          text: turn.reply,
          time: botTime,
          usedModel: turn.usedModel,
          intent: turn.intent,
        },
      ]);
    } catch (err: any) {
      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.testMessages.update(m => [
        ...m,
        {
          sender: 'bot',
          text: `⚠️ Error: ${err.message || 'No se pudo conectar con la API. Verifica que la API Key esté configurada en Vercel o en el panel.'}`,
          time: botTime,
          intent: 'ERROR',
        },
      ]);
    } finally {
      this.testLoading.set(false);
    }
  }

  refreshBotEvents() {
    this.dataService.refreshBotEvents();
  }

  reconnect() {
    this.evolution.connectInstance();
  }

  logout() {
    this.evolution.logoutInstance();
  }
}
