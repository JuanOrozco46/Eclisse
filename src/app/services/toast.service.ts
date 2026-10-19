import { Injectable, signal } from '@angular/core';

export interface ToastNotification {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<ToastNotification[]>([]);

  show(message: string, type: 'error' | 'success' | 'info' = 'error', durationMs = 5000) {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.toasts.update(current => [...current, { id, type, message }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  showError(message: string) {
    this.show(message, 'error', 6000);
  }

  showSuccess(message: string) {
    this.show(message, 'success', 4000);
  }

  showInfo(message: string) {
    this.show(message, 'info', 4000);
  }

  dismiss(id: string) {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }
}
