import { Injectable, inject, signal, effect } from '@angular/core';
import { DataService, SalesOrder } from './data.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private data = inject(DataService);

  // IDs de pedidos recién llegados (menos de 2 min desde que aparecieron)
  // El componente de cocina los lee para mostrar el badge "NUEVO"
  newOrderIds = signal<Set<string>>(new Set());

  private audio: HTMLAudioElement | null = null;
  private audioReady = false;

  // Título original del tab, para restaurar después del flash
  private originalTitle = typeof document !== 'undefined' ? document.title : 'Eclisse';
  private flashInterval: ReturnType<typeof setInterval> | null = null;
  private seenOrderIds = new Set<string>();

  constructor() {
    // Inicializar audio de forma lazy para respetar la política de autoplay del browser
    if (typeof window !== 'undefined') {
      this.audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      this.audio.loop = false; // sonido una sola vez por pedido, no loop
      this.audio.preload = 'auto';
    }

    // Observar cambios en orders para detectar pedidos nuevos
    effect(() => {
      const orders = this.data.orders();
      const pendingOrders = orders.filter(o => o.status === 'PENDING');

      for (const order of pendingOrders) {
        if (!this.seenOrderIds.has(order.id)) {
          this.seenOrderIds.add(order.id);
          this.onNewOrder(order);
        }
      }

      // Limpiar seenOrderIds de pedidos que ya no existen
      const allIds = new Set(orders.map(o => o.id));
      for (const id of this.seenOrderIds) {
        if (!allIds.has(id)) this.seenOrderIds.delete(id);
      }
    });
  }

  /** Llamar en el primer click del usuario para desbloquear el audio en el browser */
  initAudio() {
    if (!this.audio || this.audioReady) return;
    this.audio.play()
      .then(() => { this.audio!.pause(); this.audio!.currentTime = 0; this.audioReady = true; })
      .catch(() => { this.audioReady = true; });
  }

  private onNewOrder(order: SalesOrder) {
    // 1. Sonido
    this.playSound();

    // 2. Flash del tab
    this.startTabFlash(order);

    // 3. Marcar como "nuevo" y auto-expirar a los 2 minutos
    this.newOrderIds.update(ids => {
      const next = new Set(ids);
      next.add(order.id);
      return next;
    });
    setTimeout(() => {
      this.newOrderIds.update(ids => {
        const next = new Set(ids);
        next.delete(order.id);
        return next;
      });
    }, 2 * 60 * 1000);
  }

  private playSound() {
    if (!this.audio) return;
    this.audio.currentTime = 0;
    this.audio.play().catch(() => {
      // Silenciar el error de autoplay; se desbloquea con initAudio()
    });
  }

  private startTabFlash(order: SalesOrder) {
    if (typeof document === 'undefined') return;
    if (this.flashInterval) return; // ya está flasheando

    const shortId = order.id.slice(-4).toUpperCase();
    let toggle = false;

    this.flashInterval = setInterval(() => {
      document.title = toggle ? `🍕 PEDIDO #${shortId} — Eclisse` : this.originalTitle;
      toggle = !toggle;
    }, 1000);

    // Detener el flash después de 30 segundos o cuando el usuario vuelve al tab
    const stop = () => {
      if (this.flashInterval) { clearInterval(this.flashInterval); this.flashInterval = null; }
      document.title = this.originalTitle;
    };

    setTimeout(stop, 30 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) stop();
    }, { once: true });
  }

  /** Remover un pedido del set de "nuevos" cuando cocina lo acepta */
  acknowledgeOrder(orderId: string) {
    this.newOrderIds.update(ids => {
      const next = new Set(ids);
      next.delete(orderId);
      return next;
    });
  }
}
