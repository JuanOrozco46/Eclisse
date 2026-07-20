import { Injectable, signal, computed } from '@angular/core';

export interface Order {
  id: string;
  table: string;
  items: string[];
  total: number;
  time: string;
  status: 'PENDING' | 'PREPARING' | 'READY';
  priority: boolean;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private orders = signal<Order[]>([]);
  
  activeOrders = computed(() => this.orders().filter(o => o.status !== 'READY' || (new Date().getTime() - o.timestamp.getTime() < 300000))); // Show ready for 5 mins
  
  kitchenOrders = computed(() => this.orders().filter(o => o.status !== 'READY'));

  addOrder(order: Partial<Order>) {
    const newOrder: Order = {
      id: Math.floor(Math.random() * 9000 + 1000).toString(),
      table: order.table || '00',
      items: order.items || [],
      total: order.total || 0,
      time: '01',
      status: 'PENDING',
      priority: order.priority || false,
      timestamp: new Date(),
      ...order
    };
    this.orders.update(prev => [...prev, newOrder]);
  }

  updateStatus(orderId: string, status: 'PENDING' | 'PREPARING' | 'READY') {
    this.orders.update(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  }

  completeOrder(orderId: string) {
    this.orders.update(prev => prev.filter(o => o.id !== orderId));
  }

  getTodaySales() {
    return this.orders().reduce((acc, o) => acc + o.total, 0);
  }
}
