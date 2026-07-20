import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EvolutionService } from '../../services/evolution.service';
import { AIOrchestratorService } from '../../services/ai-orchestrator.service';
import { DataService, RappiConfig } from '../../services/data.service';

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
  
  instance = this.evolution.instanceStatus;
  loading = this.evolution.loading;
  error = this.evolution.error;

  // AI Configuration
  aiConfig = this.aiOrchestrator.config;
  showAiSettings = false;

  // Rappi integration
  rappiConfig = this.dataService.rappiConfig;
  showRappiWizard = false;
  rappiWizardStep = signal(1); // 1=credentials, 2=webhook, 3=done
  rappiForm = { storeId: '', apiKey: '', webhookSecret: '' };
  rappiSaving = signal(false);

  recentLogs = [
    { time: '19:42:01', event: 'Gemini 1.5 Flash', details: 'Respuesta generada exitosamente', status: 'Success' },
    { time: '19:40:15', event: 'Gemini 2.0 Flash', details: 'Fallback activado por saturación', status: 'Warning' },
    { time: '19:35:50', event: 'Ritual Bot', details: 'Prompt actualizado desde dashboard', status: 'Success' },
    { time: '19:30:12', event: 'WhatsApp', details: 'Delay humano activado (2s)', status: 'Success' },
  ];

  ngOnInit() {
    this.evolution.checkStatus();
    this.aiOrchestrator.loadConfig();
    // Pre-fill form if already configured
    const existing = this.rappiConfig();
    if (existing.storeId) {
      this.rappiForm = { storeId: existing.storeId, apiKey: existing.apiKey, webhookSecret: existing.webhookSecret };
    }
  }

  saveAiPrompt(prompt: string) {
    this.aiOrchestrator.saveConfig({
      ...this.aiConfig(),
      systemPrompt: prompt
    });
  }

  updateFallbackWithKey(p: string, s: string, t: string, key: string) {
    this.aiOrchestrator.saveConfig({
      ...this.aiConfig(),
      primaryModel: p,
      secondaryModel: s,
      tertiaryModel: t,
      geminiApiKey: key
    });
    this.showAiSettings = false;
  }

  // ── Rappi Wizard ──
  openRappiWizard() {
    this.rappiWizardStep.set(1);
    this.showRappiWizard = true;
  }

  rappiNextStep() {
    if (this.rappiWizardStep() < 3) {
      this.rappiWizardStep.update(s => s + 1);
    }
  }

  rappiPrevStep() {
    if (this.rappiWizardStep() > 1) {
      this.rappiWizardStep.update(s => s - 1);
    }
  }

  connectRappi() {
    if (!this.rappiForm.storeId || !this.rappiForm.apiKey) return;
    this.rappiSaving.set(true);
    // Simulate API validation delay
    setTimeout(() => {
      const config: RappiConfig = {
        connected: true,
        storeId: this.rappiForm.storeId,
        apiKey: this.rappiForm.apiKey,
        webhookSecret: this.rappiForm.webhookSecret,
        connectedAt: new Date().toISOString()
      };
      this.dataService.saveRappiConfig(config);
      this.rappiSaving.set(false);
      this.rappiWizardStep.set(3);
    }, 1500);
  }

  disconnectRappi() {
    this.dataService.disconnectRappi();
    this.rappiForm = { storeId: '', apiKey: '', webhookSecret: '' };
    this.showRappiWizard = false;
  }

  reconnect() {
    this.evolution.connectInstance();
  }

  logout() {
    this.evolution.logoutInstance();
  }
}
