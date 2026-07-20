import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, SalesOrder } from '../../services/data.service';

@Component({
  selector: 'app-dashboard-pos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-pos.html',
  styles: `
    select { cursor: pointer; }
    option { background: #131313; color: white; }
    .table-card { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
    .table-card:hover { transform: translateY(-5px); }
  `,
})
export class DashboardPos {
  data = inject(DataService);
  Math = Math;
  
  viewState = signal<'MAP' | 'ORDER'>('MAP');
  selectedTable: any = null;
  notification = signal<{ table: string; msg: string } | null>(null);

  tables = [
    { id: 'MESA 01', paxs: '4 PAX', status: 'Libre', type: 'RECT' },
    { id: 'MESA 02', paxs: '2 PAX', status: 'Libre', type: 'CIRC' },
    { id: 'MESA 03', paxs: '2 PAX', status: 'Libre', type: 'CIRC' },
    { id: 'MESA 04', paxs: '4 PAX', status: 'Libre', type: 'RECT' },
    { id: 'MESA 05', paxs: '6 PAX', status: 'Libre', type: 'RECT' },
    { id: 'MESA 06', paxs: '4 PAX', status: 'Libre', type: 'RECT' },
    { id: 'MESA 07', paxs: '2 PAX', status: 'Libre', type: 'CIRC' },
    { id: 'MESA 08', paxs: '4 PAX', status: 'Libre', type: 'RECT' },
  ];

  currentOrder: { menuItemId: string; name: string; quantity: number; price: number; note: string }[] = [];

  // Data from service
  availableItems = this.data.availableMenuItems;

  menuCategories = computed(() => {
    const cats = new Set(this.availableItems().map(i => i.category));
    return Array.from(cats);
  });

  selectedCategory = signal('');

  filteredMenuItems = computed(() => {
    const items = this.availableItems();
    const cat = this.selectedCategory();
    if (!cat) return items;
    return items.filter(i => i.category === cat);
  });

  // Active orders for selected table
  tableOrders = computed(() => {
    if (!this.selectedTable) return [];
    const tableNum = this.selectedTable.id.replace('MESA ', '');
    return this.data.orders().filter(o => o.table === tableNum && o.status !== 'PAID');
  });

  tableTotal = computed(() => {
    return this.tableOrders().reduce((acc, o) => acc + o.total, 0);
  });

  // Notification logic
  readyOrders = computed(() => {
    const ready = this.data.orders().filter(o => o.status === 'READY');
    if (ready.length > 0) {
      const latest = ready[ready.length - 1];
      return { table: `MESA ${latest.table}`, msg: 'LISTO' };
    }
    return null;
  });

  // Payment modal
  showPaymentModal = signal(false);
  paymentMethod = 'Efectivo';

  selectTable(table: any) {
    this.selectedTable = table;
    this.viewState.set('ORDER');
    this.currentOrder = [];
  }

  backToMap() {
    this.viewState.set('MAP');
    this.selectedTable = null;
  }

  addToOrder(menuItem: any) {
    const existing = this.currentOrder.find(item => item.menuItemId === menuItem.id);
    if (existing) {
      existing.quantity++;
    } else {
      this.currentOrder.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: 1,
        price: menuItem.price,
        note: ''
      });
    }
  }

  decrementItem(index: number) {
    if (this.currentOrder[index].quantity > 1) {
      this.currentOrder[index].quantity--;
    } else {
      this.currentOrder.splice(index, 1);
    }
  }

  incrementItem(index: number) {
    this.currentOrder[index].quantity++;
  }

  getCurrentTotal() {
    return this.currentOrder.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }

  submitOrder() {
    if (!this.selectedTable || this.currentOrder.length === 0) return;

    this.data.addOrder({
      table: this.selectedTable.id.replace('MESA ', ''),
      items: this.currentOrder.map(i => ({ ...i })),
      total: this.getCurrentTotal(),
      status: 'PENDING',
      priority: false,
    });

    this.currentOrder = [];
    // Keep in ORDER view to see the consolidated table account or add more
  }

  processPayment() {
    if (!this.selectedTable) return;
    
    this.tableOrders().forEach(order => {
      this.data.completeAndPayOrder(order.id, this.paymentMethod);
    });

    this.showPaymentModal.set(false);
    this.backToMap();
  }

  markDelivered(order: SalesOrder) {
    this.data.updateOrderStatus(order.id, 'DELIVERED');
  }

  getTableStatus(table: any) {
    const tableNum = table.id.replace('MESA ', '');
    const active = this.data.orders().some(o => o.table === tableNum && o.status !== 'PAID');
    return active ? 'Ocupada' : 'Libre';
  }
}
