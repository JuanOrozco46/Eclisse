import { Component, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, SalesOrder, DeliveryStatus } from '../services/data.service';
import { EvolutionService } from '../services/evolution.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-dashboard-kitchen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex flex-col gap-12 animate-in fade-in slide-in-from-right-8 duration-700"
         (click)="notifications.initAudio()">

      <!-- Top KDS Header -->
      <header class="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface-container-low border-b-2 border-outline-variant p-10 relative overflow-hidden gap-6">
        <div class="absolute inset-0 texture-overlay opacity-5"></div>
        <div class="flex items-center gap-10 relative z-10">
          <div class="writing-vertical font-anton text-stark-gray opacity-20 text-[10px] tracking-brutal uppercase">SYSTEM_KDS // v4.0</div>
          <div>
            <h1 class="font-anton text-6xl text-white uppercase tracking-tighter leading-none">MONITOR DE<br/>COCINA</h1>
            <p class="font-label-caps text-[10px] text-secondary mt-2 tracking-widest uppercase">ECLISSE ATELIER DE FUEGO</p>
          </div>
        </div>

        <div class="flex gap-6 flex-wrap items-center relative z-10">
          <button (click)="showDeliveryGroupModal.set(true)"
                  class="border border-emerald/40 hover:border-emerald bg-emerald/10 text-emerald font-anton px-4 py-3 text-xs tracking-widest uppercase transition-all flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">groups</span>
            {{ evolution.deliveryGroupNumber() ? 'GRUPO DOMICILIOS: OK' : 'CONFIGURAR GRUPO DOMICILIOS' }}
          </button>

          <div class="flex flex-col items-center border border-outline-variant px-6 py-3 bg-background">
            <span class="font-label-caps text-[9px] text-stark-gray opacity-40 uppercase">EN PREPARACIÓN</span>
            <span class="font-anton text-4xl text-white">{{preparingOrdersCount()}}</span>
          </div>
          <div class="flex flex-col items-center border-2 border-secondary px-6 py-3 bg-secondary/5">
            <span class="font-label-caps text-[9px] text-secondary uppercase">PENDIENTES</span>
            <span class="font-anton text-4xl text-secondary">{{pendingOrdersCount()}}</span>
          </div>
          <div class="flex flex-col items-center border border-[#FF6900]/40 px-6 py-3 bg-[#FF6900]/5">
            <span class="font-label-caps text-[9px] text-[#FF6900] uppercase">RAPPI</span>
            <span class="font-anton text-4xl text-[#FF6900]">{{rappiOrdersCount()}}</span>
          </div>
          <div class="flex flex-col items-center border border-emerald/40 px-6 py-3 bg-emerald/5">
            <span class="font-label-caps text-[9px] text-emerald uppercase">DOMICILIOS WA</span>
            <span class="font-anton text-4xl text-emerald">{{waDeliveryOrdersCount()}}</span>
          </div>
          <div *ngIf="priorityOrdersCount() > 0"
               class="flex flex-col items-center border-2 border-tomato px-6 py-3 bg-tomato/5">
            <span class="font-label-caps text-[9px] text-tomato uppercase">PRIORIDAD</span>
            <span class="font-anton text-4xl text-tomato">{{priorityOrdersCount()}}</span>
          </div>
        </div>
      </header>

      <!-- Modal configuración grupo domicilios -->
      <div *ngIf="showDeliveryGroupModal()"
           class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div class="bg-surface-container-low border-2 border-outline-variant p-8 max-w-lg w-full flex flex-col gap-6 relative max-h-[90vh] overflow-y-auto">
          <h2 class="font-anton text-3xl text-white uppercase tracking-tighter">CONFIGURAR GRUPO DE DOMICILIARIOS</h2>
          <p class="font-label-caps text-xs text-stark-gray tracking-widest uppercase">
            Ingresá el número o ID del grupo de WhatsApp al que el bot enviará la solicitud cuando hagas clic en "SOLICITAR DOMICILIO".
          </p>

          <div class="flex flex-col gap-2">
            <label class="font-label-caps text-[10px] text-secondary uppercase">ID o Número de Grupo</label>
            <input type="text" [(ngModel)]="deliveryGroupInput"
                   placeholder="Ej: 12036301234567@g.us o 573001234567"
                   class="w-full bg-background border border-outline-variant p-4 font-anton text-white focus:border-secondary outline-none text-sm">
          </div>

          <div class="border-t border-outline-variant/40 pt-4 flex flex-col gap-3">
            <div class="flex justify-between items-center">
              <span class="font-label-caps text-[10px] text-stark-gray uppercase">¿No conocés el ID del grupo?</span>
              <button (click)="loadWhatsAppGroups()" [disabled]="loadingGroups()"
                      class="px-3 py-1.5 border border-emerald/50 text-emerald font-anton text-xs uppercase hover:bg-emerald/10 transition-all">
                {{ loadingGroups() ? 'CARGANDO...' : 'CARGAR MIS GRUPOS' }}
              </button>
            </div>
            <div *ngIf="availableGroups().length > 0"
                 class="flex flex-col gap-2 max-h-48 overflow-y-auto border border-outline-variant/30 p-2 bg-background">
              <button *ngFor="let g of availableGroups()" (click)="selectGroup(g.id)"
                      class="text-left p-3 hover:bg-surface-container-low border border-outline-variant/20 flex justify-between items-center transition-all">
                <span class="font-anton text-sm text-white">{{g.subject}}</span>
                <span class="font-label-caps text-[9px] text-stark-gray opacity-60">{{g.id.slice(0,15)}}...</span>
              </button>
            </div>
          </div>

          <div class="flex justify-end gap-4 mt-2">
            <button (click)="showDeliveryGroupModal.set(false)"
                    class="px-6 py-3 border border-outline-variant text-stark-gray font-anton text-sm uppercase">CANCELAR</button>
            <button (click)="saveDeliveryGroupPhone()"
                    class="px-6 py-3 bg-emerald text-black font-anton text-sm uppercase hover:brightness-110">GUARDAR</button>
          </div>
        </div>
      </div>

      <!-- KDS Grid -->
      <main class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">

        <!-- Estado vacío -->
        <div *ngIf="kitchenOrders().length === 0"
             class="col-span-full flex flex-col items-center justify-center py-40 border border-outline-variant border-dashed">
          <span class="material-symbols-outlined text-stark-gray opacity-10 text-8xl mb-6">outdoor_grill</span>
          <h3 class="font-anton text-4xl text-stark-gray opacity-40 uppercase">COCINA DESPEJADA</h3>
        </div>

        <!-- Tarjeta por pedido -->
        <div *ngFor="let order of kitchenOrders()"
             class="border-2 bg-surface-container-lowest flex flex-col min-h-[450px] relative transition-all duration-300 group shadow-brutal"
             [ngClass]="{
               'border-outline-variant opacity-80':          order.status === 'PENDING',
               'border-secondary scale-105 z-10 -translate-y-2': order.status === 'PREPARING',
               'ring-4 ring-tomato ring-inset':              order.priority,
               'border-[#FF6900]/60':                        order.source === 'RAPPI',
               'border-emerald/60':                          order.source === 'WHATSAPP' && order.deliveryStatus === 'ON_THE_WAY'
             }">

          <!-- Badge NUEVO (aparece los primeros 2 min, pulsa) -->
          <div *ngIf="isNew(order.id)"
               class="absolute top-3 right-3 z-30 bg-secondary text-on-secondary font-anton text-[9px] px-2 py-1 tracking-widest uppercase animate-pulse">
            NUEVO
          </div>

          <!-- Badge de origen -->
          <div class="absolute top-3 left-3 z-20 flex gap-2">
            <span *ngIf="order.source === 'RAPPI'"
                  class="font-label-caps text-[8px] bg-[#FF6900] text-white px-2 py-1 tracking-widest uppercase">RAPPI</span>
            <span *ngIf="order.source === 'WHATSAPP'"
                  class="font-label-caps text-[8px] bg-emerald text-black px-2 py-1 tracking-widest uppercase">WHATSAPP</span>
            <span *ngIf="!order.source || order.source === 'POS'"
                  class="font-label-caps text-[8px] bg-outline-variant text-stark-gray px-2 py-1 tracking-widest uppercase">LOCAL</span>
          </div>

          <!-- Cabecera de la tarjeta -->
          <div class="p-6 pt-10 border-b border-outline-variant flex justify-between items-start"
               [ngClass]="{
                 'bg-tomato/20':                order.priority,
                 'bg-surface-container-low':    order.status === 'PREPARING',
                 'bg-surface-container-lowest': order.status === 'PENDING',
                 'bg-[#FF6900]/5':              order.source === 'RAPPI'
               }">
            <div class="flex flex-col">
              <span class="font-anton text-4xl text-white uppercase">
                {{ order.source === 'RAPPI' ? 'RAPPI' : 'MESA' }} {{order.table}}
              </span>
              <span class="font-label-caps text-[9px] text-stark-gray tracking-widest uppercase">ID: {{order.id.slice(-4)}}</span>

              <!-- Nombre del cliente (pushName) -->
              <span *ngIf="order.customerName && order.source === 'WHATSAPP'"
                    class="font-label-caps text-[10px] text-emerald tracking-widest mt-1 font-semibold">
                👤 {{order.customerName}}
              </span>
              <!-- Teléfono del cliente si no hay nombre -->
              <span *ngIf="!order.customerName && order.customerPhone && order.source === 'WHATSAPP'"
                    class="font-label-caps text-[9px] text-emerald tracking-widest mt-1">
                📱 {{order.customerPhone}}
              </span>

              <!-- Estado del domicilio -->
              <span *ngIf="order.source === 'WHATSAPP' && order.deliveryStatus === 'REQUESTED'"
                    class="font-label-caps text-[8px] text-secondary border border-secondary/30 px-2 py-0.5 mt-2 animate-pulse uppercase tracking-widest">
                🛵 DOMICILIARIO SOLICITADO
              </span>
              <span *ngIf="order.source === 'WHATSAPP' && order.deliveryStatus === 'ON_THE_WAY'"
                    class="font-label-caps text-[8px] text-emerald border border-emerald/30 px-2 py-0.5 mt-2 uppercase tracking-widest">
                ✅ EN CAMINO
              </span>
            </div>

            <div class="flex flex-col items-end">
              <span class="font-anton text-2xl"
                    [ngClass]="order.priority ? 'text-tomato animate-pulse' : 'text-stark-gray'">
                {{getElapsedTime(order)}}'
              </span>
              <span class="font-label-caps text-[8px] text-stark-gray uppercase tracking-widest mt-1">TRANSCURRIDOS</span>
            </div>
          </div>

          <!-- Lista de ítems -->
          <div class="flex-1 p-6 space-y-4">
            <div *ngFor="let item of order.items"
                 class="flex flex-col border-b border-outline-variant/30 pb-4 last:border-0">
              <div class="flex items-start justify-between">
                <span class="font-anton text-xl text-white uppercase group-hover:text-secondary transition-colors">
                  {{item.quantity}}x {{item.name}}
                </span>
              </div>
              <span *ngIf="item.note"
                    class="font-label-caps text-[10px] text-secondary italic tracking-widest mt-1 bg-secondary/5 px-2 py-1">
                "{{item.note}}"
              </span>
            </div>
          </div>

          <!-- Acciones -->
          <div class="w-full flex flex-col">

            <!-- RAPPI -->
            <ng-container *ngIf="order.source === 'RAPPI'">
              <button *ngIf="order.status === 'PENDING'" (click)="acceptOrder(order)"
                      class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-[#FF6900] text-white hover:brightness-110 transition-all flex items-center justify-center gap-3">
                <span class="material-symbols-outlined text-xl">check_circle</span>
                ACEPTAR PEDIDO RAPPI
              </button>
              <button *ngIf="order.status === 'PREPARING'" (click)="updateStatus(order, 'READY')"
                      class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-secondary text-on-secondary hover:bg-emerald transition-all">
                PEDIDO LISTO ✓
              </button>
            </ng-container>

            <!-- WHATSAPP -->
            <ng-container *ngIf="order.source === 'WHATSAPP'">
              <button *ngIf="order.status === 'PENDING'" (click)="acceptOrder(order)"
                      class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-white text-black hover:bg-secondary transition-all">
                EMPEZAR PREPARACIÓN
              </button>
              <ng-container *ngIf="order.status === 'PREPARING'">
                <button *ngIf="!order.deliveryStatus || order.deliveryStatus === 'NONE'"
                        (click)="requestDelivery(order)"
                        class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-emerald text-black hover:brightness-110 transition-all flex items-center justify-center gap-3">
                  <span class="material-symbols-outlined text-xl">two_wheeler</span>
                  SOLICITAR DOMICILIO
                </button>
                <button *ngIf="order.deliveryStatus === 'REQUESTED'"
                        (click)="dispatchOrder(order)"
                        class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-secondary text-on-secondary hover:bg-emerald transition-all flex items-center justify-center gap-3 animate-pulse">
                  <span class="material-symbols-outlined text-xl">local_shipping</span>
                  ORDEN LISTA / EN CAMINO
                </button>
                <div *ngIf="order.deliveryStatus === 'ON_THE_WAY'"
                     class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-emerald/20 text-emerald text-center flex items-center justify-center gap-3 border-t border-emerald/20">
                  <span class="material-symbols-outlined text-xl">check_circle</span>
                  EN CAMINO — CLIENTE NOTIFICADO ✓
                </div>
              </ng-container>
            </ng-container>

            <!-- POS / LOCAL -->
            <ng-container *ngIf="!order.source || order.source === 'POS'">
              <button *ngIf="order.status === 'PENDING'" (click)="acceptOrder(order)"
                      class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-white text-black hover:bg-secondary transition-all">
                EMPEZAR PREPARACIÓN
              </button>
              <button *ngIf="order.status === 'PREPARING'" (click)="updateStatus(order, 'READY')"
                      class="w-full py-5 font-anton text-lg tracking-brutal uppercase bg-secondary text-on-secondary hover:bg-emerald transition-all">
                PEDIDO LISTO ✓
              </button>
            </ng-container>
          </div>

          <!-- Badge URGENTE -->
          <div *ngIf="order.priority"
               class="absolute -top-3 -right-3 bg-tomato text-white px-3 py-1 font-anton text-xs z-20">
            URGENTE
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`:host { display: block; padding-bottom: 100px; }`]
})
export class DashboardKitchen {
  data          = inject(DataService);
  evolution     = inject(EvolutionService);
  notifications = inject(NotificationService);

  kitchenOrders = this.data.kitchenOrders;

  showDeliveryGroupModal = signal<boolean>(false);
  deliveryGroupInput     = this.evolution.deliveryGroupNumber();
  availableGroups        = signal<{ id: string; subject: string }[]>([]);
  loadingGroups          = signal<boolean>(false);

  preparingOrdersCount  = computed(() => this.kitchenOrders().filter((o: SalesOrder) => o.status === 'PREPARING').length);
  pendingOrdersCount    = computed(() => this.kitchenOrders().filter((o: SalesOrder) => o.status === 'PENDING').length);
  priorityOrdersCount   = computed(() => this.kitchenOrders().filter((o: SalesOrder) => o.priority).length);
  rappiOrdersCount      = computed(() => this.kitchenOrders().filter((o: SalesOrder) => o.source === 'RAPPI').length);
  waDeliveryOrdersCount = computed(() => this.kitchenOrders().filter((o: SalesOrder) => o.source === 'WHATSAPP').length);

  /** ¿Este pedido llegó hace menos de 2 minutos? */
  isNew(orderId: string): boolean {
    return this.notifications.newOrderIds().has(orderId);
  }

  /** Acepta un pedido: lo pasa a PREPARING y notifica al cliente de WhatsApp */
  async acceptOrder(order: SalesOrder) {
    this.notifications.acknowledgeOrder(order.id);
    this.data.updateOrderStatus(order.id, 'PREPARING');

    // Notificar al cliente de WhatsApp que su pedido entró a preparación
    if (order.source === 'WHATSAPP' && order.customerPhone) {
      const name = order.customerName ? ` ${order.customerName.split(' ')[0]}` : '';
      const items = order.items.map(i => `• ${i.quantity}x ${i.name}`).join('\n');
      const msg =
        `¡Hola${name}! 🔥 Tu pedido ya está en el horno:\n\n${items}\n\n` +
        `Te avisamos cuando salga para entrega. ¡Gracias por tu paciencia!`;
      await this.notifyCustomer(order.customerPhone, msg);
    }
  }

  updateStatus(order: SalesOrder, status: SalesOrder['status']) {
    this.data.updateOrderStatus(order.id, status);
  }

  async requestDelivery(order: SalesOrder) {
    this.data.updateDeliveryStatus(order.id, 'REQUESTED');

    const groupPhone = this.evolution.deliveryGroupNumber();
    if (!groupPhone) { this.showDeliveryGroupModal.set(true); return; }

    const total = order.total.toLocaleString('es-CO');
    const items = order.items.map(i => `• ${i.quantity}x ${i.name}`).join('\n');
    const clientLabel = order.customerName || order.customerPhone || 'Cliente directo';

    const groupMsg =
      `🛵 *SOLICITUD DE DOMICILIO - ECLISSE PIZZA*\n\n` +
      `*Pedido #${order.id.slice(-4)}*\n${items}\n\n` +
      `📍 *Cliente:* ${clientLabel}\n` +
      `📱 *Tel:* ${order.customerPhone || '—'}\n` +
      `💰 *Total a cobrar:* $${total} COP\n\n` +
      `Por favor confirmar en el grupo para tomar la orden.`;

    await this.evolution.sendTextMessage(groupPhone, groupMsg);
  }

  async dispatchOrder(order: SalesOrder) {
    this.data.updateDeliveryStatus(order.id, 'ON_THE_WAY');
    this.data.updateOrderStatus(order.id, 'READY');

    if (order.customerPhone) {
      const name  = order.customerName ? ` ${order.customerName.split(' ')[0]}` : '';
      const total = order.total.toLocaleString('es-CO');
      const items = order.items.map(i => `• ${i.quantity}x ${i.name}`).join('\n');

      const message =
        `¡Hola${name}! 🍕 Tu pedido de *Eclisse Pizza* ya va en camino 🛵🔥\n\n` +
        `*Pedido #${order.id.slice(-4)}*\n${items}\n\n` +
        `*Total:* $${total} COP\n\n` +
        `El domiciliario ya recogió tu orden. ¡Gracias por tu preferencia! 🙌`;

      const sent = await this.notifyCustomer(order.customerPhone, message);
      if (!sent) {
        const phone = order.customerPhone.replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
      }
    }
  }

  /**
   * Envía un mensaje al cliente pasando por /api/notify (backend seguro).
   * Evita exponer el API key de Evolution en el frontend.
   */
  private async notifyCustomer(phone: string, message: string): Promise<boolean> {
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'secreto123',
        },
        body: JSON.stringify({ phone, message }),
      });
      return res.ok;
    } catch (e) {
      console.error('notifyCustomer:', e);
      return false;
    }
  }

  async loadWhatsAppGroups() {
    this.loadingGroups.set(true);
    const groups = await this.evolution.fetchGroups();
    this.availableGroups.set(groups);
    this.loadingGroups.set(false);
  }

  selectGroup(groupId: string) { this.deliveryGroupInput = groupId; }

  saveDeliveryGroupPhone() {
    this.evolution.setDeliveryGroupNumber(this.deliveryGroupInput);
    this.showDeliveryGroupModal.set(false);
  }

  getElapsedTime(order: SalesOrder): number {
    return Math.floor((Date.now() - order.timestamp) / 60000);
  }
}
