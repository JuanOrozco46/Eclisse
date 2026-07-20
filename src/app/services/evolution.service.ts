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
  
  // Configuration from User
  private readonly baseUrl = 'https://elhornobotprueba1.onrender.com';
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
      // Handle known 404 or other connection errors
      // If instance doesn't exist, we might need to create it or just show disconnected
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
    try {
      // Get QR code or connection data
      const response: any = await firstValueFrom(
        this.http.get(`${this.baseUrl}/instance/connect/${instanceName}`, { headers: this.headers })
      );
      
      if (response.code) {
        this.instanceStatus.update(s => s ? { ...s, qrcode: response.code } : { instanceName, status: 'disconnected', qrcode: response.code });
      }
    } catch (err: any) {
      this.error.set('Could not generate connection QR');
    } finally {
      this.loading.set(false);
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
