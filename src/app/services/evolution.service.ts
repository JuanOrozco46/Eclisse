import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface EvolutionInstance {
  instanceName: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'close';
  number?: string;
  qrcode?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EvolutionService {
  private http = inject(HttpClient);
  private sb = inject(SupabaseService);

  private readonly endpoint = '/api/evolution';
  private readonly defaultInstance = 'ECLISSE_WA_01';

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const { data: { session } } = await this.sb.client.auth.getSession();
    const token = session?.access_token || '';
    return new HttpHeaders({
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    });
  }

  // Signals for state
  instanceStatus = signal<EvolutionInstance | null>(null);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  async checkStatus(instanceName: string = this.defaultInstance) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const headers = await this.getAuthHeaders();
      const response: any = await firstValueFrom(
        this.http.get(`${this.endpoint}?action=status&instance=${encodeURIComponent(instanceName)}`, { headers })
      );

      const status = response.instance?.state || 'disconnected';
      this.instanceStatus.set({
        instanceName,
        status: status === 'open' ? 'connected' : (status === 'connecting' ? 'connecting' : 'disconnected'),
        number: response.instance?.ownerJid
      });
    } catch (err: any) {
      if (err.status === 404) {
        this.instanceStatus.set({ instanceName, status: 'disconnected' });
      } else {
        this.error.set('Failed to connect to Evolution API');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async connectInstance(instanceName: string = this.defaultInstance) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const headers = await this.getAuthHeaders();
      const response: any = await firstValueFrom(
        this.http.post(this.endpoint, { action: 'connect', instanceName }, { headers })
      );

      // Extract QR base64 or code
      const rawQr = response?.base64 || response?.code || response?.qrcode?.base64 || response?.qrcode?.code;

      let qrCodeFormatted = null;
      if (rawQr) {
        if (rawQr.startsWith('data:') || rawQr.startsWith('http')) {
          qrCodeFormatted = rawQr;
        } else {
          qrCodeFormatted = `data:image/png;base64,${rawQr}`;
        }
      }

      if (qrCodeFormatted) {
        this.instanceStatus.update(s => s ? { ...s, qrcode: qrCodeFormatted } : { instanceName, status: 'disconnected', qrcode: qrCodeFormatted });
      } else {
        this.error.set('No se pudo obtener el código QR de respuesta. Intenta de nuevo.');
      }
    } catch (err: any) {
      console.error('Error connecting instance:', err);
      const msg = err.error?.error || err.error?.message || err.message || 'No se pudo generar el QR de conexión';
      this.error.set(`Error de conexión: ${msg}`);
    } finally {
      this.loading.set(false);
    }
  }

  // Delivery Group Configuration (persisted in Supabase + localStorage cache)
  deliveryGroupNumber = signal<string>(
    typeof localStorage !== 'undefined' ? (localStorage.getItem('delivery_group_number') || '') : ''
  );

  constructor() {
    this.loadDeliveryGroupFromDb();
  }

  async loadDeliveryGroupFromDb() {
    try {
      const { data } = await this.sb.client
        .from('rappi_config')
        .select('api_key')
        .eq('id', 'bot_config')
        .maybeSingle();
      if (data?.api_key) {
        const parsed = JSON.parse(data.api_key);
        if (parsed.deliveryGroupNumber) {
          this.deliveryGroupNumber.set(parsed.deliveryGroupNumber);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('delivery_group_number', parsed.deliveryGroupNumber);
          }
        }
      }
    } catch {
      // Fallback to localStorage if unauthenticated or offline
    }
  }

  async setDeliveryGroupNumber(num: string) {
    const clean = num.trim();
    this.deliveryGroupNumber.set(clean);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('delivery_group_number', clean);
    }
    try {
      const { data } = await this.sb.client
        .from('rappi_config')
        .select('api_key')
        .eq('id', 'bot_config')
        .maybeSingle();
      let existing: Record<string, any> = {};
      if (data?.api_key) {
        try { existing = JSON.parse(data.api_key); } catch { existing = {}; }
      }
      const updated = { ...existing, deliveryGroupNumber: clean };
      await this.sb.client.from('rappi_config').upsert({
        id: 'bot_config',
        connected: true,
        api_key: JSON.stringify(updated),
      });
    } catch (err) {
      console.error('Error saving deliveryGroupNumber to Supabase:', err);
    }
  }

  async sendTextMessage(number: string, text: string, instanceName: string = this.defaultInstance): Promise<boolean> {
    try {
      const headers = await this.getAuthHeaders();
      const destination = number.includes('@g.us') ? number.trim() : number.replace(/\D/g, '');
      const response: any = await firstValueFrom(
        this.http.post(this.endpoint, {
          action: 'send-message',
          instanceName,
          number: destination,
          text
        }, { headers })
      );
      return !!response;
    } catch (err: any) {
      console.error('Error sending WhatsApp message via Evolution API:', err);
      return false;
    }
  }

  async fetchGroups(instanceName: string = this.defaultInstance): Promise<{ id: string; subject: string }[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response: any = await firstValueFrom(
        this.http.get(`${this.endpoint}?action=groups&instance=${encodeURIComponent(instanceName)}`, { headers })
      );
      if (Array.isArray(response)) {
        return response.map((g: any) => ({ id: g.id, subject: g.subject || g.id }));
      }
      return [];
    } catch (err) {
      console.error('Error fetching WhatsApp groups:', err);
      return [];
    }
  }

  async logoutInstance(instanceName: string = this.defaultInstance) {
    try {
      const headers = await this.getAuthHeaders();
      await firstValueFrom(
        this.http.post(this.endpoint, { action: 'logout', instanceName }, { headers })
      );
      await this.checkStatus(instanceName);
    } catch {
      this.error.set('Failed to logout instance');
    }
  }
}
