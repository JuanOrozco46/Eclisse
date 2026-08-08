import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
  
  private get baseUrl() {
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      return '/api/evolution';
    }
    return 'https://elhornobotprueba1.onrender.com';
  }
  private readonly apiKey = 'secreto123';
  private readonly defaultInstance = 'ECLISSE_WA_01';

  private get headers() {
    return new HttpHeaders({
      'apikey': this.apiKey,
      'Content-Type': 'application/json'
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
      // Connect to Evolution API - Fetch instance state
      const response: any = await firstValueFrom(
        this.http.get(`${this.baseUrl}/instance/connectionState/${instanceName}`, { headers: this.headers })
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
      let response: any;
      try {
        response = await firstValueFrom(
          this.http.get(`${this.baseUrl}/instance/connect/${instanceName}`, { headers: this.headers })
        );
      } catch (err: any) {
        // If 404, the instance hasn't been created in Evolution API yet. Create it!
        if (err.status === 404) {
          response = await firstValueFrom(
            this.http.post(`${this.baseUrl}/instance/create`, {
              instanceName,
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS'
            }, { headers: this.headers })
          );
        } else {
          throw err;
        }
      }

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
      const msg = err.error?.message || err.message || 'No se pudo generar el QR de conexión';
      this.error.set(`Error de conexión: ${msg}`);
    } finally {
      this.loading.set(false);
    }
  }

  // Delivery Group Configuration
  deliveryGroupNumber = signal<string>(localStorage.getItem('delivery_group_number') || '');

  setDeliveryGroupNumber(num: string) {
    this.deliveryGroupNumber.set(num);
    localStorage.setItem('delivery_group_number', num);
  }

  async sendTextMessage(number: string, text: string, instanceName: string = this.defaultInstance): Promise<boolean> {
    try {
      // If destination is a Group JID (contains @g.us), keep it as is, otherwise clean digits for phone numbers
      const destination = number.includes('@g.us') ? number.trim() : number.replace(/\D/g, '');
      const response: any = await firstValueFrom(
        this.http.post(`${this.baseUrl}/message/sendText/${instanceName}`, {
          number: destination,
          text: text
        }, { headers: this.headers })
      );
      return !!response;
    } catch (err: any) {
      console.error('Error sending WhatsApp message via Evolution API:', err);
      return false;
    }
  }

  async fetchGroups(instanceName: string = this.defaultInstance): Promise<{ id: string; subject: string }[]> {
    try {
      const response: any = await firstValueFrom(
        this.http.get(`${this.baseUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, { headers: this.headers })
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
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/instance/logout/${instanceName}`, { headers: this.headers })
      );
      await this.checkStatus(instanceName);
    } catch (err) {
      this.error.set('Failed to logout instance');
    }
  }
}
