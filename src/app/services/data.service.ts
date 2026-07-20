import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

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
  username: string;
  password: string;
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

export type OrderSource = 'POS' | 'WHATSAPP' | 'RAPPI';
export type DeliveryStatus = 'NONE' | 'REQUESTED' | 'ON_THE_WAY';

export interface SalesOrder {
  id: string;
  table: string;
  items: { menuItemId: string; name: string; quantity: number; price: number; note: string }[];
  total: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'PAID';
  priority: boolean;
  timestamp: number;
  waiter?: string;
  paymentMethod?: string;
  source?: OrderSource;
  customerPhone?: string;
  deliveryStatus?: DeliveryStatus;
  rappiOrderId?: string;
}

export interface RappiConfig {
  connected: boolean;
  storeId: string;
  apiKey: string;
  webhookSecret: string;
  connectedAt?: string;
}

// ─── Helper: snake_case ↔ camelCase mappers ────────────────
function toSnake(obj: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    costPerUnit: 'cost_per_unit',
    createdAt: 'created_at',
    orderId: 'order_id',
    menuItemId: 'menu_item_id',
    paymentMethod: 'payment_method',
    customerPhone: 'customer_phone',
    deliveryStatus: 'delivery_status',
    rappiOrderId: 'rappi_order_id',
    storeId: 'store_id',
    apiKey: 'api_key',
    webhookSecret: 'webhook_secret',
    connectedAt: 'connected_at',
  };
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[map[key] || key] = value;
  }
  return result;
}

function toCamel(obj: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    cost_per_unit: 'costPerUnit',
    created_at: 'createdAt',
    order_id: 'orderId',
    menu_item_id: 'menuItemId',
    payment_method: 'paymentMethod',
    customer_phone: 'customerPhone',
    delivery_status: 'deliveryStatus',
    rappi_order_id: 'rappiOrderId',
    store_id: 'storeId',
    api_key: 'apiKey',
    webhook_secret: 'webhookSecret',
    connected_at: 'connectedAt',
  };
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[map[key] || key] = value;
  }
  return result;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private sb = inject(SupabaseService);

  // ─── SIGNALS (UI reactivo) ─────────────────────────────────
  menuItems = signal<MenuItem[]>([]);
  ingredients = signal<Ingredient[]>([]);
  staff = signal<StaffMember[]>([]);
  transactions = signal<Transaction[]>([]);
  orders = signal<SalesOrder[]>([]);
  rappiConfig = signal<RappiConfig>({ connected: false, storeId: '', apiKey: '', webhookSecret: '' });

  // ─── COMPUTED ──────────────────────────────────────────────
  activeOrders = computed(() => this.orders().filter(o => o.status !== 'PAID' && o.status !== 'DELIVERED'));
  kitchenOrders = computed(() => this.orders().filter(o => o.status === 'PENDING' || o.status === 'PREPARING'));

  todaySales = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.transactions()
      .filter(t => t.type === 'Venta' && t.date === today)
      .reduce((acc, t) => acc + t.amount, 0);
  });

  todayExpenses = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.transactions()
      .filter(t => t.type === 'Gasto' && t.date === today)
      .reduce((acc, t) => acc + t.amount, 0);
  });

  todayProfit = computed(() => this.todaySales() - this.todayExpenses());

  todayOrdersCount = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.orders().filter(o => {
      const orderDate = new Date(o.timestamp).toISOString().split('T')[0];
      return orderDate === today;
    }).length;
  });

  lowStockItems = computed(() => this.ingredients().filter(i => i.stock <= i.min));
  availableMenuItems = computed(() => this.menuItems().filter(m => m.available));

  paymentBreakdown = computed(() => {
    const today = new Date().toISOString().split('T')[0];
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
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = this.orders().filter(o => {
      const d = new Date(o.timestamp).toISOString().split('T')[0];
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
      const dateStr = d.toISOString().split('T')[0];
      const dayTotal = this.transactions()
        .filter(t => t.type === 'Venta' && t.date === dateStr)
        .reduce((a, t) => a + t.amount, 0);
      result.push({ day: days[d.getDay()], value: dayTotal, date: dateStr });
    }
    return result;
  });

  // ─── CONSTRUCTOR ───────────────────────────────────────────
  constructor() {
    this.loadAll();
  }

  /** Carga inicial de todos los datos desde Supabase */
  private async loadAll() {
    try {
      const [menuRes, ingRes, staffRes, txRes, ordRes, rappiRes] = await Promise.all([
        this.sb.client.from('menu_items').select('*'),
        this.sb.client.from('ingredients').select('*'),
        this.sb.client.from('staff').select('*'),
        this.sb.client.from('transactions').select('*').order('timestamp', { ascending: false }),
        this.sb.client.from('orders').select('*'),
        this.sb.client.from('rappi_config').select('*').limit(1).single(),
      ]);

      if (menuRes.data) this.menuItems.set(menuRes.data.map(r => toCamel(r) as MenuItem));
      if (ingRes.data) this.ingredients.set(ingRes.data.map(r => toCamel(r) as Ingredient));
      if (staffRes.data) this.staff.set(staffRes.data.map(r => toCamel(r) as StaffMember));
      if (txRes.data) this.transactions.set(txRes.data.map(r => toCamel(r) as Transaction));
      if (ordRes.data) this.orders.set(ordRes.data.map(r => toCamel(r) as SalesOrder));
      if (rappiRes.data) this.rappiConfig.set(toCamel(rappiRes.data) as RappiConfig);
    } catch (e) {
      console.error('Error loading from Supabase:', e);
    }
  }

  // ─── RAPPI CONFIG ──────────────────────────────────────────
  async saveRappiConfig(config: RappiConfig) {
    this.rappiConfig.set(config);
    await this.sb.client.from('rappi_config').upsert(toSnake({ ...config, id: 'main' }));
  }

  async disconnectRappi() {
    const empty: RappiConfig = { connected: false, storeId: '', apiKey: '', webhookSecret: '' };
    this.rappiConfig.set(empty);
    await this.sb.client.from('rappi_config').upsert(toSnake({ ...empty, id: 'main' }));
  }

  // ─── MENU ──────────────────────────────────────────────────
  async addMenuItem(item: Omit<MenuItem, 'id'>) {
    const id = 'menu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newItem = { ...item, id };
    this.menuItems.update(items => [...items, newItem]);
    await this.sb.client.from('menu_items').insert(toSnake(newItem));
  }

  async updateMenuItem(id: string, updates: Partial<MenuItem>) {
    this.menuItems.update(items => items.map(i => i.id === id ? { ...i, ...updates } : i));
    await this.sb.client.from('menu_items').update(toSnake(updates)).eq('id', id);
  }

  async deleteMenuItem(id: string) {
    this.menuItems.update(items => items.filter(i => i.id !== id));
    await this.sb.client.from('menu_items').delete().eq('id', id);
  }

  // ─── INGREDIENTS ───────────────────────────────────────────
  async addIngredient(item: Omit<Ingredient, 'id'>) {
    const id = 'ing_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newItem = { ...item, id };
    this.ingredients.update(items => [...items, newItem]);
    await this.sb.client.from('ingredients').insert(toSnake(newItem));
  }

  async updateIngredient(id: string, updates: Partial<Ingredient>) {
    this.ingredients.update(items => items.map(i => i.id === id ? { ...i, ...updates } : i));
    await this.sb.client.from('ingredients').update(toSnake(updates)).eq('id', id);
  }

  async deleteIngredient(id: string) {
    this.ingredients.update(items => items.filter(i => i.id !== id));
    await this.sb.client.from('ingredients').delete().eq('id', id);
  }

  async adjustStock(id: string, delta: number) {
    const item = this.ingredients().find(i => i.id === id);
    if (!item) return;
    const newStock = Math.max(0, item.stock + delta);
    this.ingredients.update(items => items.map(i => i.id === id ? { ...i, stock: newStock } : i));
    await this.sb.client.from('ingredients').update({ stock: newStock }).eq('id', id);
  }

  // ─── STAFF ─────────────────────────────────────────────────
  async addStaff(member: Omit<StaffMember, 'id' | 'createdAt'>) {
    const id = 'staff_' + Date.now();
    const newMember = { ...member, id, createdAt: new Date().toISOString() };
    this.staff.update(items => [...items, newMember]);
    await this.sb.client.from('staff').insert(toSnake(newMember));
  }

  async removeStaff(id: string) {
    this.staff.update(items => items.filter(i => i.id !== id));
    await this.sb.client.from('staff').delete().eq('id', id);
  }

  async toggleStaffStatus(id: string) {
    const member = this.staff().find(i => i.id === id);
    if (!member) return;
    const newStatus = member.status === 'ACTIVE' ? 'OFFLINE' : 'ACTIVE';
    this.staff.update(items => items.map(i => i.id === id ? { ...i, status: newStatus } : i));
    await this.sb.client.from('staff').update({ status: newStatus }).eq('id', id);
  }

  // ─── TRANSACTIONS ──────────────────────────────────────────
  async addTransaction(t: Omit<Transaction, 'id' | 'timestamp'>) {
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newTx = { ...t, id, timestamp: Date.now() };
    this.transactions.update(items => [newTx, ...items]);
    await this.sb.client.from('transactions').insert(toSnake(newTx));
  }

  async updateTransaction(id: string, updates: Partial<Transaction>) {
    this.transactions.update(items => items.map(t => t.id === id ? { ...t, ...updates } : t));
    await this.sb.client.from('transactions').update(toSnake(updates)).eq('id', id);
  }

  async deleteTransaction(id: string) {
    this.transactions.update(items => items.filter(t => t.id !== id));
    await this.sb.client.from('transactions').delete().eq('id', id);
  }

  // ─── ORDERS ────────────────────────────────────────────────
  async addOrder(order: Omit<SalesOrder, 'id' | 'timestamp'>) {
    const id = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newOrder: SalesOrder = { ...order, id, timestamp: Date.now() };
    this.orders.update(items => [...items, newOrder]);
    await this.sb.client.from('orders').insert(toSnake(newOrder));
    return newOrder;
  }

  async updateOrderStatus(id: string, status: SalesOrder['status']) {
    this.orders.update(items => items.map(o => o.id === id ? { ...o, status } : o));
    await this.sb.client.from('orders').update({ status }).eq('id', id);
  }

  async updateDeliveryStatus(id: string, deliveryStatus: DeliveryStatus) {
    this.orders.update(items => items.map(o => o.id === id ? { ...o, deliveryStatus } : o));
    await this.sb.client.from('orders').update({ delivery_status: deliveryStatus }).eq('id', id);
  }

  async completeAndPayOrder(id: string, paymentMethod: string) {
    const order = this.orders().find(o => o.id === id);
    if (order) {
      this.orders.update(items => items.map(o => o.id === id ? { ...o, status: 'PAID' as const, paymentMethod } : o));
      await this.sb.client.from('orders').update({ status: 'PAID', payment_method: paymentMethod }).eq('id', id);

      // Register as sale transaction
      await this.addTransaction({
        type: 'Venta',
        category: 'Pedido',
        amount: order.total,
        method: paymentMethod,
        description: `Mesa ${order.table} - Orden #${order.id.slice(-4)}`,
        date: new Date().toISOString().split('T')[0],
      });
    }
  }

  async removeOrder(id: string) {
    this.orders.update(items => items.filter(o => o.id !== id));
    await this.sb.client.from('orders').delete().eq('id', id);
  }

  // ─── PUBLIC CLIENT CART (local only, no DB) ────────────────
  publicCart = signal<{ menuItemId: string; name: string; quantity: number; price: number }[]>([]);

  cartTotal = computed(() => this.publicCart().reduce((acc, i) => acc + (i.price * i.quantity), 0));
  cartCount = computed(() => this.publicCart().reduce((acc, i) => acc + i.quantity, 0));

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

  generateWhatsAppLink() {
    const phone = '573004057195';
    let text = '¡Hola! Me gustaría hacer un pedido:\n\n';

    this.publicCart().forEach(i => {
      text += `• ${i.quantity}x ${i.name} ($${(i.price * i.quantity).toLocaleString('es-CO')})\n`;
    });

    text += `\n*TOTAL: $${this.cartTotal().toLocaleString('es-CO')}*`;
    text += '\n\nMi dirección es: ';

    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  async clearAllData() {
    this.menuItems.set([]);
    this.ingredients.set([]);
    this.staff.set([]);
    this.transactions.set([]);
    this.orders.set([]);
    // Limpia todas las tablas en Supabase
    await Promise.all([
      this.sb.client.from('menu_items').delete().neq('id', ''),
      this.sb.client.from('ingredients').delete().neq('id', ''),
      this.sb.client.from('staff').delete().neq('id', ''),
      this.sb.client.from('transactions').delete().neq('id', ''),
      this.sb.client.from('orders').delete().neq('id', ''),
    ]);
  }
}
