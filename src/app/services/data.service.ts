import { Injectable, signal, computed, effect } from '@angular/core';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image?: string;
  ingredients: string[]; // ingredient IDs linked
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
  source?: OrderSource;       // Channel: POS, WHATSAPP, RAPPI
  customerPhone?: string;     // For WhatsApp dispatch message
  deliveryStatus?: DeliveryStatus; // Delivery flow for WA orders
  rappiOrderId?: string;      // External Rappi order ID
}

export interface RappiConfig {
  connected: boolean;
  storeId: string;
  apiKey: string;
  webhookSecret: string;
  connectedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  // ─── SIGNALS ───────────────────────────────────────────────
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

  // Payment breakdown
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

  // Plate performance
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

  // Weekly performance data
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

  constructor() {
    this.loadFromStorage();
    
    // Auto-save to localStorage
    effect(() => {
      const data = {
        menuItems: this.menuItems(),
        ingredients: this.ingredients(),
        staff: this.staff(),
        transactions: this.transactions(),
        orders: this.orders(),
      };
      localStorage.setItem('eclisse_data', JSON.stringify(data));
      // Save Rappi config separately
      localStorage.setItem('eclisse_rappi', JSON.stringify(this.rappiConfig()));
    });
  }

  // ─── RAPPI CONFIG ───────────────────────────────────────────
  saveRappiConfig(config: RappiConfig) {
    this.rappiConfig.set(config);
  }

  disconnectRappi() {
    this.rappiConfig.set({ connected: false, storeId: '', apiKey: '', webhookSecret: '' });
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem('eclisse_data');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.menuItems) this.menuItems.set(data.menuItems);
        if (data.ingredients) this.ingredients.set(data.ingredients);
        if (data.staff) this.staff.set(data.staff);
        if (data.transactions) this.transactions.set(data.transactions);
        if (data.orders) this.orders.set(data.orders);
      }
      const rappiRaw = localStorage.getItem('eclisse_rappi');
      if (rappiRaw) {
        this.rappiConfig.set(JSON.parse(rappiRaw));
      }
    } catch (e) {
      // Silent in production
    }
  }

  // ─── MENU ──────────────────────────────────────────────────
  addMenuItem(item: Omit<MenuItem, 'id'>) {
    const id = 'menu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.menuItems.update(items => [...items, { ...item, id }]);
  }

  updateMenuItem(id: string, updates: Partial<MenuItem>) {
    this.menuItems.update(items => items.map(i => i.id === id ? { ...i, ...updates } : i));
  }

  deleteMenuItem(id: string) {
    this.menuItems.update(items => items.filter(i => i.id !== id));
  }

  // ─── INGREDIENTS ───────────────────────────────────────────
  addIngredient(item: Omit<Ingredient, 'id'>) {
    const id = 'ing_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.ingredients.update(items => [...items, { ...item, id }]);
  }

  updateIngredient(id: string, updates: Partial<Ingredient>) {
    this.ingredients.update(items => items.map(i => i.id === id ? { ...i, ...updates } : i));
  }

  deleteIngredient(id: string) {
    this.ingredients.update(items => items.filter(i => i.id !== id));
  }

  adjustStock(id: string, delta: number) {
    this.ingredients.update(items => items.map(i => {
      if (i.id === id) {
        return { ...i, stock: Math.max(0, i.stock + delta) };
      }
      return i;
    }));
  }

  // ─── STAFF ─────────────────────────────────────────────────
  addStaff(member: Omit<StaffMember, 'id' | 'createdAt'>) {
    const id = 'staff_' + Date.now();
    this.staff.update(items => [...items, { ...member, id, createdAt: new Date().toISOString() }]);
  }

  removeStaff(id: string) {
    this.staff.update(items => items.filter(i => i.id !== id));
  }

  toggleStaffStatus(id: string) {
    this.staff.update(items => items.map(i => {
      if (i.id === id) {
        return { ...i, status: i.status === 'ACTIVE' ? 'OFFLINE' : 'ACTIVE' };
      }
      return i;
    }));
  }

  // ─── TRANSACTIONS ──────────────────────────────────────────
  addTransaction(t: Omit<Transaction, 'id' | 'timestamp'>) {
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.transactions.update(items => [{ ...t, id, timestamp: Date.now() }, ...items]);
  }

  updateTransaction(id: string, updates: Partial<Transaction>) {
    this.transactions.update(items => items.map(t => t.id === id ? { ...t, ...updates } : t));
  }

  deleteTransaction(id: string) {
    this.transactions.update(items => items.filter(t => t.id !== id));
  }

  // ─── ORDERS ────────────────────────────────────────────────
  addOrder(order: Omit<SalesOrder, 'id' | 'timestamp'>) {
    const id = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newOrder: SalesOrder = { ...order, id, timestamp: Date.now() };
    this.orders.update(items => [...items, newOrder]);
    return newOrder;
  }

  updateOrderStatus(id: string, status: SalesOrder['status']) {
    this.orders.update(items => items.map(o => o.id === id ? { ...o, status } : o));
  }

  updateDeliveryStatus(id: string, deliveryStatus: DeliveryStatus) {
    this.orders.update(items => items.map(o => o.id === id ? { ...o, deliveryStatus } : o));
  }

  completeAndPayOrder(id: string, paymentMethod: string) {
    const order = this.orders().find(o => o.id === id);
    if (order) {
      this.orders.update(items => items.map(o => o.id === id ? { ...o, status: 'PAID' as const, paymentMethod } : o));
      // Register as sale transaction
      this.addTransaction({
        type: 'Venta',
        category: 'Pedido',
        amount: order.total,
        method: paymentMethod,
        description: `Mesa ${order.table} - Orden #${order.id.slice(-4)}`,
        date: new Date().toISOString().split('T')[0],
      });
    }
  }

  removeOrder(id: string) {
    this.orders.update(items => items.filter(o => o.id !== id));
  }

  // ─── PUBLIC CLIENT CART ─────────────────────────────────────
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

  clearAllData() {
    this.menuItems.set([]);
    this.ingredients.set([]);
    this.staff.set([]);
    this.transactions.set([]);
    this.orders.set([]);
    localStorage.removeItem('eclisse_data');
  }
}
