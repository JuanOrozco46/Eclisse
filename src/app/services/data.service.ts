import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Database } from '../types/database.types';

// ─── INTERFACES ───────────────────────────────────────────
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image?: string;
  ingredients: string[];
  available: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stock: number;
  min: number;
  category: string;
  costPerUnit: number;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'WAITER' | 'KITCHEN';
  status: 'ACTIVE' | 'OFFLINE';
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'Venta' | 'Gasto';
  category: string;
  amount: number;
  method: string;
  description: string;
  date: string;
  timestamp: number;
  orderId?: string;
}

export type OrderSource = 'POS' | 'WHATSAPP';
export type DeliveryStatus = 'NONE' | 'REQUESTED' | 'ON_THE_WAY';
export type PaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';

export interface SalesOrder {
  id: string;
  table: string;
  items: { menuItemId: string; name: string; quantity: number; price: number; note: string }[];
  total: number;
  deliveryFee?: number;
  orderFingerprint?: string;
  paymentStatus?: PaymentStatus;
  receiptImage?: string;
  receiptAiNotes?: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'PAID';
  priority: boolean;
  timestamp: number;
  waiter?: string;
  paymentMethod?: string;
  source?: OrderSource;
  customerPhone?: string;
  customerName?: string;   // nombre del contacto de WhatsApp (pushName)
  deliveryStatus?: DeliveryStatus;
}

export interface BotEvent {
  id: number;
  phone: string;
  messageId?: string;
  stage: string;
  orderId?: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface BusinessConfig {
  openHour: number;
  closeHour: number;
  armeniaFee: number;
  outskirtsFee: number;
  whatsappOrderPhone: string;
  nequiPhone: string;
  deliveryGroupNumber: string;
}

/**
 * Devuelve la fecha en formato YYYY-MM-DD en la zona horaria de Colombia (America/Bogota),
 * evitando que las ventas nocturnas (después de las 7:00 PM hora local / 00:00 UTC)
 * salten al día siguiente como ocurre con toISOString().
 */
export function getBogotaDateString(input: Date | number = new Date()): string {
  const date = typeof input === 'number' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ─── Helper: snake_case ↔ camelCase mappers ────────────────
export function toSnake(obj: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    costPerUnit:      'cost_per_unit',
    createdAt:        'created_at',
    orderId:          'order_id',
    menuItemId:       'menu_item_id',
    paymentMethod:    'payment_method',
    paymentStatus:    'payment_status',
    deliveryFee:      'delivery_fee',
    orderFingerprint: 'order_fingerprint',
    receiptImage:     'receipt_image',
    receiptAiNotes:   'receipt_ai_notes',
    customerPhone:    'customer_phone',
    customerName:     'customer_name',
    deliveryStatus:   'delivery_status',
    storeId:          'store_id',
    apiKey:           'api_key',
    webhookSecret:    'webhook_secret',
    connectedAt:      'connected_at',
    messageId:        'message_id',
  };
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[map[key] || key] = value;
  }
  return result;
}

export function toCamel(obj: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    cost_per_unit:     'costPerUnit',
    created_at:        'createdAt',
    order_id:          'orderId',
    menu_item_id:      'menuItemId',
    payment_method:    'paymentMethod',
    payment_status:    'paymentStatus',
    delivery_fee:      'deliveryFee',
    order_fingerprint: 'orderFingerprint',
    receipt_image:     'receiptImage',
    receipt_ai_notes:  'receiptAiNotes',
    customer_phone:    'customerPhone',
    customer_name:     'customerName',
    delivery_status:   'deliveryStatus',
    store_id:          'storeId',
    api_key:           'apiKey',
    webhook_secret:    'webhookSecret',
    connected_at:      'connectedAt',
    message_id:        'messageId',
  };
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = map[key] || key;


    // items viene de Supabase como jsonb — puede ser string si el driver no lo parsea
    if (camelKey === 'items') {
      let parsed = value;
      if (typeof value === 'string') {
        try { parsed = JSON.parse(value); }
        catch { parsed = []; }
      }
      if (Array.isArray(parsed)) {
        // Cada ítem puede tener menu_item_id → convertir a camelCase también
        result[camelKey] = parsed.map((item: any) => {
          if (item && typeof item === 'object') {
            return toCamel(item as Record<string, any>);
          }
          return item;
        });
      } else {
        result[camelKey] = [];
      }
      continue;
    }


    result[camelKey] = value;
  }
  return result;
}

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { id: '1', name: 'Bianca', price: 25000, category: 'Pizzas', description: 'Salsa blanca de la casa, queso mozzarella, tocineta ahumada, queso costeño y pimienta.', ingredients: ['Salsa blanca', 'Queso mozzarella', 'Tocineta ahumada', 'Queso costeño', 'Pimienta'], available: true },
  { id: '2', name: 'Lumina', price: 25000, category: 'Pizzas', description: 'Salsa de tomate de la casa, queso mozzarella, tomate cherry, pesto y mozzarella di bufala.', ingredients: ['Salsa de tomate', 'Queso mozzarella', 'Tomate cherry', 'Pesto', 'Mozzarella di bufala'], available: true },
  { id: '3', name: 'Hawaianna', price: 25000, category: 'Pizzas', description: 'Piña caramelizada, jamón ahumado, queso mozzarella, salsa de tomate de la casa y cilantro.', ingredients: ['Piña caramelizada', 'Jamón ahumado', 'Queso mozzarella', 'Salsa de tomate', 'Cilantro'], available: true },
  { id: '4', name: 'Dorato', price: 25000, category: 'Pizzas', description: 'Salsa de tomate de la casa, chorizo ahumado en trozos, maíz dulce y queso costeño.', ingredients: ['Salsa de tomate', 'Chorizo ahumado', 'Maíz dulce', 'Queso costeño'], available: true },
  { id: '5', name: 'Amalgama', price: 25000, category: 'Pizzas', description: 'Salsa de tomate de la casa, queso mozzarella, pollo en trozos, pimentón y cebolla morada.', ingredients: ['Salsa de tomate', 'Queso mozzarella', 'Pollo en trozos', 'Pimentón', 'Cebolla morada'], available: true },
  { id: '6', name: 'Dolce Fiamma', price: 25000, category: 'Pizzas', description: 'Salsa de tomate de la casa, queso mozzarella, pepperoni, cebolla morada y miel picante.', ingredients: ['Salsa de tomate', 'Queso mozzarella', 'Pepperoni', 'Cebolla morada', 'Miel picante'], available: true },
  { id: '7', name: 'Coca-Cola Original 250ml', price: 3000, category: 'Bebidas', description: 'Coca-Cola Original 250 ml', ingredients: [], available: true },
  { id: '8', name: 'Coca-Cola Zero 250ml', price: 3000, category: 'Bebidas', description: 'Coca-Cola Zero 250 ml', ingredients: [], available: true },
  { id: '9', name: 'Quatro 250ml', price: 3000, category: 'Bebidas', description: 'Quatro 250 ml', ingredients: [], available: true },
  { id: '10', name: 'Coca-Cola Original 1.5L', price: 8000, category: 'Bebidas', description: 'Coca-Cola Original 1.5 Litros', ingredients: [], available: true },
  { id: '11', name: 'Coca-Cola Zero 1.5L', price: 8000, category: 'Bebidas', description: 'Coca-Cola Zero 1.5 Litros', ingredients: [], available: true }
];

import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class DataService {
  private sb = inject(SupabaseService);
  private toast = inject(ToastService);

  // ─── SIGNALS (UI reactivo) ─────────────────────────────────
  menuItems = signal<MenuItem[]>(DEFAULT_MENU_ITEMS);
  ingredients = signal<Ingredient[]>([]);
  staff = signal<StaffMember[]>([]);
  transactions = signal<Transaction[]>([]);
  orders = signal<SalesOrder[]>([]);
  botEvents = signal<BotEvent[]>([]);
  businessConfig = signal<BusinessConfig>({
    openHour: 17,
    closeHour: 23,
    armeniaFee: 6000,
    outskirtsFee: 10000,
    whatsappOrderPhone: '573004057195',
    nequiPhone: '3223119008',
    deliveryGroupNumber: typeof localStorage !== 'undefined' ? (localStorage.getItem('delivery_group_number') || '') : '',
  });

  // ─── COMPUTED ──────────────────────────────────────────────
  activeOrders = computed(() => this.orders().filter(o => o.status !== 'PAID' && o.status !== 'DELIVERED'));
  kitchenOrders = computed(() => this.orders().filter(o => o.status === 'PENDING' || o.status === 'PREPARING'));
  pendingPaymentVerificationOrders = computed(() =>
    this.orders().filter(o => o.status !== 'PAID' && o.status !== 'DELIVERED' && o.paymentStatus === 'PENDING_VERIFICATION')
  );

  todaySales = computed(() => {
    const today = getBogotaDateString();
    return this.transactions()
      .filter(t => t.type === 'Venta' && t.date === today)
      .reduce((acc, t) => acc + t.amount, 0);
  });

  todayExpenses = computed(() => {
    const today = getBogotaDateString();
    return this.transactions()
      .filter(t => t.type === 'Gasto' && t.date === today)
      .reduce((acc, t) => acc + t.amount, 0);
  });

  todayProfit = computed(() => this.todaySales() - this.todayExpenses());

  todayOrdersCount = computed(() => {
    const today = getBogotaDateString();
    return this.orders().filter(o => {
      const orderDate = getBogotaDateString(o.timestamp);
      return orderDate === today;
    }).length;
  });

  lowStockItems = computed(() => this.ingredients().filter(i => i.stock <= i.min));
  availableMenuItems = computed(() => this.menuItems().filter(m => m.available));

  paymentBreakdown = computed(() => {
    const today = getBogotaDateString();
    const sales = this.transactions().filter(t => t.type === 'Venta' && t.date === today);
    const total = sales.reduce((acc, t) => acc + t.amount, 0);
    if (total === 0) return { transfer: 0, cash: 0, card: 0 };

    const transfer = sales.filter(t => t.method === 'Transferencia').reduce((a, t) => a + t.amount, 0);
    const cash = sales.filter(t => t.method === 'Efectivo').reduce((a, t) => a + t.amount, 0);
    const card = sales.filter(t => t.method === 'Datáfono').reduce((a, t) => a + t.amount, 0);

    return {
      transfer: total > 0 ? Math.round((transfer / total) * 100) : 0,
      cash: total > 0 ? Math.round((cash / total) * 100) : 0,
      card: total > 0 ? Math.round((card / total) * 100) : 0,
    };
  });

  platePerformance = computed(() => {
    const today = getBogotaDateString();
    const todayOrders = this.orders().filter(o => {
      const d = getBogotaDateString(o.timestamp);
      return d === today;
    });

    const countMap: Record<string, number> = {};
    todayOrders.forEach(o => {
      o.items.forEach(item => {
        countMap[item.name] = (countMap[item.name] || 0) + item.quantity;
      });
    });

    const entries = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = entries.length > 0 ? entries[0][1] : 1;
    return entries.map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / max) * 100)
    }));
  });

  weeklyPerformance = computed(() => {
    const days = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const now = new Date();
    const result: { day: string; value: number; date: string }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = getBogotaDateString(d);
      const dayTotal = this.transactions()
        .filter(t => t.type === 'Venta' && t.date === dateStr)
        .reduce((a, t) => a + t.amount, 0);
      result.push({ day: days[d.getDay()], value: dayTotal, date: dateStr });
    }
    return result;
  });

  // ─── CONSTRUCTOR ───────────────────────────────────────────
  constructor() {
    this.loadPublicData();
    this.subscribeToOrders();
  }

  /** Carga datos públicos (menú) — disponible para todos los visitantes */
  async loadPublicData() {
    try {
      const menuRes = await this.sb.client.from('menu_items').select('*');
      if (menuRes.data && menuRes.data.length > 0) {
        this.menuItems.set(menuRes.data.map(r => toCamel(r) as MenuItem));
      }
    } catch (e) {
      console.error('Error loading menu:', e);
    }
  }

  /** Carga datos del dashboard — solo llamar cuando el usuario está autenticado */
  async loadAdminData() {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = getBogotaDateString(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      const [ingRes, staffRes, txRes, ordRes, botCfgRes] = await Promise.all([
        this.sb.client.from('ingredients').select('*'),
        this.sb.client.from('profiles').select('id, name, email, role, status, created_at'),
        this.sb.client.from('transactions').select('*')
          .gte('date', sevenDaysAgo)
          .order('timestamp', { ascending: false })
          .limit(500),
        this.sb.client.from('orders').select('*')
          .gte('timestamp', threeDaysAgo)
          .order('timestamp', { ascending: false })
          .limit(200),
        this.sb.client.from('rappi_config').select('*').eq('id', 'bot_config').maybeSingle(),
      ]);

      if (ingRes.data)    this.ingredients.set(ingRes.data.map(r => toCamel(r) as Ingredient));
      if (staffRes.data)  this.staff.set(staffRes.data.map(r => ({
        ...toCamel(r),
        email: r.email || '',
        status: (r.status as StaffMember['status']) || 'ACTIVE',
      }) as StaffMember));
      if (txRes.data)     this.transactions.set(txRes.data.map(r => toCamel(r) as Transaction));
      if (ordRes.data)    this.orders.set(ordRes.data.map(r => toCamel(r) as SalesOrder));
      if (botCfgRes.data?.api_key) {
        try {
          const parsed = JSON.parse(botCfgRes.data.api_key);
          this.businessConfig.update(curr => ({
            openHour:            Number.isFinite(Number(parsed.openHour))     ? Number(parsed.openHour)     : curr.openHour,
            closeHour:           Number.isFinite(Number(parsed.closeHour))    ? Number(parsed.closeHour)    : curr.closeHour,
            armeniaFee:          Number.isFinite(Number(parsed.armeniaFee))   ? Number(parsed.armeniaFee)   : curr.armeniaFee,
            outskirtsFee:        Number.isFinite(Number(parsed.outskirtsFee)) ? Number(parsed.outskirtsFee) : curr.outskirtsFee,
            whatsappOrderPhone:  parsed.whatsappOrderPhone  || curr.whatsappOrderPhone,
            nequiPhone:          parsed.nequiPhone          || curr.nequiPhone,
            deliveryGroupNumber: parsed.deliveryGroupNumber || curr.deliveryGroupNumber,
          }));
          if (parsed.deliveryGroupNumber && typeof localStorage !== 'undefined') {
            localStorage.setItem('delivery_group_number', parsed.deliveryGroupNumber);
          }
        } catch {
          // ignore malformed bot_config JSON
        }
      }

      await this.refreshBotEvents();
    } catch (e) {
      console.error('Error loading admin data from Supabase:', e);
    }
  }

  /** Carga los últimos eventos de trazabilidad del bot (tabla bot_events) */
  async refreshBotEvents() {
    try {
      const { data } = await this.sb.client
        .from('bot_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) {
        this.botEvents.set(data.map(r => toCamel(r) as BotEvent));
      }
    } catch {
      // Tolerante si la migración aún no se ejecutó o el rol no es ADMIN
    }
  }

  /**
   * Suscripción Realtime a la tabla orders.
   * INSERT → agrega el pedido al signal (aparece en cocina al instante).
   * UPDATE → actualiza el pedido existente en el signal.
   * DELETE → elimina el pedido del signal.
   */
  private subscribeToOrders() {
    this.sb.client
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = toCamel(payload.new) as SalesOrder;
          // Evitar duplicados: solo agregar si el id no existe ya
          this.orders.update(current => {
            if (current.some(o => o.id === newOrder.id)) return current;
            return [...current, newOrder];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = toCamel(payload.new) as SalesOrder;
          this.orders.update(current =>
            current.map(o => o.id === updated.id ? updated : o)
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders' },
        (payload) => {
          const deletedId = payload.old?.['id'];
          if (deletedId) {
            this.orders.update(current => current.filter(o => o.id !== deletedId));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime orders: suscripción activa');
        }
      });
  }

  // ─── MENU ──────────────────────────────────────────────────
  async invalidateMenuCache(): Promise<boolean> {
    try {
      const { data: { session } } = await this.sb.client.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api?action=bust-cache', {
        method: 'GET',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async addMenuItem(item: Omit<MenuItem, 'id'>) {
    const id = 'menu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newItem = { ...item, id };
    const prev = this.menuItems();
    this.menuItems.update(items => [...items, newItem]);
    const { error } = await this.sb.client.from('menu_items').insert(toSnake(newItem));
    if (error) {
      this.menuItems.set(prev);
      this.toast.showError('Error al crear plato en el menú: ' + error.message);
      return;
    }
    this.invalidateMenuCache();
  }

  async updateMenuItem(id: string, updates: Partial<MenuItem>) {
    const prev = this.menuItems();
    this.menuItems.update(items => items.map(i => i.id === id ? { ...i, ...updates } : i));
    const { error } = await this.sb.client.from('menu_items').update(toSnake(updates) as Database['public']['Tables']['menu_items']['Update']).eq('id', id);
    if (error) {
      this.menuItems.set(prev);
      this.toast.showError('Error al actualizar plato: ' + error.message);
      return;
    }
    this.invalidateMenuCache();
  }

  async deleteMenuItem(id: string) {
    const prev = this.menuItems();
    this.menuItems.update(items => items.filter(i => i.id !== id));
    const { error } = await this.sb.client.from('menu_items').delete().eq('id', id);
    if (error) {
      this.menuItems.set(prev);
      this.toast.showError('Error al eliminar plato: ' + error.message);
      return;
    }
    this.invalidateMenuCache();
  }

  // ─── INGREDIENTS ───────────────────────────────────────────
  async addIngredient(item: Omit<Ingredient, 'id'>) {
    const id = 'ing_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newItem = { ...item, id };
    const prev = this.ingredients();
    this.ingredients.update(items => [...items, newItem]);
    const { error } = await this.sb.client.from('ingredients').insert(toSnake(newItem));
    if (error) {
      this.ingredients.set(prev);
      this.toast.showError('Error al guardar ingrediente: ' + error.message);
    }
  }

  async updateIngredient(id: string, updates: Partial<Ingredient>) {
    const prev = this.ingredients();
    this.ingredients.update(items => items.map(i => i.id === id ? { ...i, ...updates } : i));
    const { error } = await this.sb.client.from('ingredients').update(toSnake(updates) as Database['public']['Tables']['ingredients']['Update']).eq('id', id);
    if (error) {
      this.ingredients.set(prev);
      this.toast.showError('Error al actualizar ingrediente: ' + error.message);
    }
  }

  async deleteIngredient(id: string) {
    const prev = this.ingredients();
    this.ingredients.update(items => items.filter(i => i.id !== id));
    const { error } = await this.sb.client.from('ingredients').delete().eq('id', id);
    if (error) {
      this.ingredients.set(prev);
      this.toast.showError('Error al eliminar ingrediente: ' + error.message);
    }
  }

  async adjustStock(id: string, delta: number) {
    const item = this.ingredients().find(i => i.id === id);
    if (!item) return;
    const prev = this.ingredients();
    const newStock = Math.max(0, item.stock + delta);
    this.ingredients.update(items => items.map(i => i.id === id ? { ...i, stock: newStock } : i));
    const { error } = await this.sb.client.from('ingredients').update({ stock: newStock }).eq('id', id);
    if (error) {
      this.ingredients.set(prev);
      this.toast.showError('Error al ajustar inventario: ' + error.message);
    }
  }

  // ─── STAFF (Supabase Auth + public.profiles) ───────────────
  async addStaff(member: { name: string; email: string; password: string; role: StaffMember['role'] }): Promise<{ error?: string }> {
    try {
      const { data: { session } } = await this.sb.client.auth.getSession();
      const token = session?.access_token;
      if (!token) return { error: 'Sesión no válida' };

      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(member),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = payload.error || 'No se pudo registrar el usuario';
        this.toast.showError(err);
        return { error: err };
      }

      const newMember: StaffMember = {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        status: payload.status || 'ACTIVE',
        createdAt: payload.createdAt || new Date().toISOString(),
      };
      this.staff.update(items => [...items, newMember]);
      this.toast.showSuccess(`Usuario ${payload.name} creado exitosamente`);
      return {};
    } catch (e: any) {
      const err = e.message || 'Error de red al crear usuario';
      this.toast.showError(err);
      return { error: err };
    }
  }

  async removeStaff(id: string): Promise<{ error?: string }> {
    try {
      const { data: { session } } = await this.sb.client.auth.getSession();
      const token = session?.access_token;
      if (!token) return { error: 'Sesión no válida' };

      const res = await fetch(`/api/staff?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = payload.error || 'No se pudo eliminar el usuario';
        this.toast.showError(err);
        return { error: err };
      }

      this.staff.update(items => items.filter(i => i.id !== id));
      this.toast.showSuccess('Usuario eliminado');
      return {};
    } catch (e: any) {
      const err = e.message || 'Error de red al eliminar usuario';
      this.toast.showError(err);
      return { error: err };
    }
  }

  async toggleStaffStatus(id: string) {
    const member = this.staff().find(i => i.id === id);
    if (!member) return;
    const prev = this.staff();
    const newStatus = member.status === 'ACTIVE' ? 'OFFLINE' : 'ACTIVE';
    this.staff.update(items => items.map(i => i.id === id ? { ...i, status: newStatus } : i));
    const { error } = await this.sb.client.from('profiles').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      this.staff.set(prev);
      this.toast.showError('Error al actualizar estado del usuario: ' + error.message);
    }
  }

  // ─── TRANSACTIONS ──────────────────────────────────────────
  async addTransaction(t: Omit<Transaction, 'id' | 'timestamp'>) {
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newTx = { ...t, id, timestamp: Date.now() };
    const prev = this.transactions();
    this.transactions.update(items => [newTx, ...items]);
    const { error } = await this.sb.client.from('transactions').insert(toSnake(newTx));
    if (error) {
      this.transactions.set(prev);
      this.toast.showError('Error al registrar transacción: ' + error.message);
    }
  }

  async updateTransaction(id: string, updates: Partial<Transaction>) {
    const prev = this.transactions();
    this.transactions.update(items => items.map(t => t.id === id ? { ...t, ...updates } : t));
    const { error } = await this.sb.client.from('transactions').update(toSnake(updates) as Database['public']['Tables']['transactions']['Update']).eq('id', id);
    if (error) {
      this.transactions.set(prev);
      this.toast.showError('Error al actualizar transacción: ' + error.message);
    }
  }

  async deleteTransaction(id: string) {
    const prev = this.transactions();
    this.transactions.update(items => items.filter(t => t.id !== id));
    const { error } = await this.sb.client.from('transactions').delete().eq('id', id);
    if (error) {
      this.transactions.set(prev);
      this.toast.showError('Error al eliminar transacción: ' + error.message);
    }
  }

  // ─── ORDERS ────────────────────────────────────────────────
  async addOrder(order: Omit<SalesOrder, 'id' | 'timestamp'>) {
    const id = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newOrder: SalesOrder = { ...order, id, timestamp: Date.now() };
    const prev = this.orders();
    this.orders.update(items => [...items, newOrder]);
    const { error } = await this.sb.client.from('orders').insert(toSnake(newOrder));
    if (error) {
      this.orders.set(prev);
      this.toast.showError('Error al crear pedido en Supabase: ' + error.message);
    }
    return newOrder;
  }

  async updateOrderStatus(id: string, status: SalesOrder['status']) {
    const prev = this.orders();
    this.orders.update(items => items.map(o => o.id === id ? { ...o, status } : o));
    const { error } = await this.sb.client.from('orders').update({ status }).eq('id', id);
    if (error) {
      this.orders.set(prev);
      this.toast.showError('Error al actualizar estado del pedido: ' + error.message);
    }
  }

  async updateDeliveryStatus(id: string, deliveryStatus: DeliveryStatus) {
    const prev = this.orders();
    this.orders.update(items => items.map(o => o.id === id ? { ...o, deliveryStatus } : o));
    const { error } = await this.sb.client.from('orders').update({ delivery_status: deliveryStatus }).eq('id', id);
    if (error) {
      this.orders.set(prev);
      this.toast.showError('Error al actualizar estado de entrega: ' + error.message);
    }
  }

  /**
   * Confirma o rechaza manualmente un comprobante de pago Nequi en la cola de verificación.
   */
  async verifyOrderPayment(id: string, verified: boolean) {
    const paymentStatus: PaymentStatus = verified ? 'VERIFIED' : 'REJECTED';
    const prev = this.orders();
    this.orders.update(items => items.map(o => o.id === id ? { ...o, paymentStatus } : o));
    const { error } = await this.sb.client
      .from('orders')
      .update({ payment_status: paymentStatus, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      this.orders.set(prev);
      this.toast.showError('Error al registrar verificación de pago: ' + error.message);
    }
  }

  async completeAndPayOrder(id: string, paymentMethod: string) {
    const order = this.orders().find(o => o.id === id);
    if (order) {
      const prevOrders = this.orders();
      this.orders.update(items => items.map(o => o.id === id ? { ...o, status: 'PAID' as const, paymentMethod } : o));
      const { error: orderErr } = await this.sb.client.from('orders').update({ status: 'PAID', payment_method: paymentMethod }).eq('id', id);
      if (orderErr) {
        this.orders.set(prevOrders);
        this.toast.showError('Error al marcar pedido como pagado: ' + orderErr.message);
        return;
      }

      // Register as sale transaction
      await this.addTransaction({
        type: 'Venta',
        category: 'Pedido',
        amount: order.total,
        method: paymentMethod,
        description: `Mesa ${order.table} - Orden #${order.id.slice(-4)}`,
        date: getBogotaDateString(),
      });
    }
  }

  async removeOrder(id: string) {
    const prev = this.orders();
    this.orders.update(items => items.filter(o => o.id !== id));
    const { error } = await this.sb.client.from('orders').delete().eq('id', id);
    if (error) {
      this.orders.set(prev);
      this.toast.showError('Error al eliminar orden: ' + error.message);
    }
  }

  // ─── PUBLIC CLIENT CART (local only, no DB) ────────────────
  publicCart = signal<{ menuItemId: string; name: string; quantity: number; price: number }[]>([]);
  showPublicCart = signal<boolean>(false);

  cartTotal = computed(() => this.publicCart().reduce((acc, i) => acc + (i.price * i.quantity), 0));
  cartCount = computed(() => this.publicCart().reduce((acc, i) => acc + i.quantity, 0));

  getCartItemQty(itemId: string): number {
    return this.publicCart().find(i => i.menuItemId === itemId)?.quantity || 0;
  }

  addToPublicCart(item: MenuItem) {
    this.publicCart.update(cart => {
      const existing = cart.find(i => i.menuItemId === item.id);
      if (existing) {
        return cart.map(i => i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...cart, { menuItemId: item.id, name: item.name, quantity: 1, price: item.price }];
    });
  }

  removeFromPublicCart(itemId: string) {
    this.publicCart.update(cart => cart.filter(i => i.menuItemId !== itemId));
  }

  clearPublicCart() {
    this.publicCart.set([]);
  }

  updatePublicCartQuantity(itemId: string, delta: number) {
    this.publicCart.update(cart => {
      return cart.map(i => {
        if (i.menuItemId === itemId) {
          const newQty = Math.max(0, i.quantity + delta);
          return { ...i, quantity: newQty };
        }
        return i;
      }).filter(i => i.quantity > 0);
    });
  }

  generateWhatsAppLink(extra?: { address?: string; paymentMethod?: string; notes?: string }) {
    const phone = (this.businessConfig().whatsappOrderPhone || '573004057195').replace(/\D/g, '');
    let text = '¡Hola! Me gustaría hacer este pedido:\n\n';

    this.publicCart().forEach(i => {
      text += `• ${i.quantity}x ${i.name} ($${(i.price * i.quantity).toLocaleString('es-CO')})\n`;
    });

    text += `\n*SUBTOTAL PRODUCTOS: $${this.cartTotal().toLocaleString('es-CO')}*`;

    if (extra?.paymentMethod) {
      text += `\n💳 *Método de pago:* ${extra.paymentMethod}`;
    }
    if (extra?.notes?.trim()) {
      text += `\n📝 *Nota:* ${extra.notes.trim()}`;
    }
    if (extra?.address?.trim()) {
      text += `\n📍 *Dirección / Entrega:* ${extra.address.trim()}`;
    } else {
      text += '\n📍 *Mi dirección de entrega es:* ';
    }

    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
}
