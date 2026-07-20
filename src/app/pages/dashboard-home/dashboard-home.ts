import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dashboard-home.html',
  styles: ``,
})
export class DashboardHome {
  data = inject(DataService);
  Math = Math;

  todaySalesTotal = this.data.todaySales;
  todayExpensesTotal = this.data.todayExpenses;
  ordersCount = computed(() => this.data.activeOrders().length);
  netProfit = this.data.todayProfit;
  todayOrdersCount = this.data.todayOrdersCount;
  paymentBreakdown = this.data.paymentBreakdown;
  platePerformance = this.data.platePerformance;
  lowStockItems = this.data.lowStockItems;
  staffMembers = this.data.staff;
  weeklyPerformance = this.data.weeklyPerformance;

  // Date filter
  selectedFilter = signal<'hoy' | 'ayer' | 'semana'>('hoy');
  currentDate = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Quick expense modal
  showExpenseModal = signal(false);
  newExpense = {
    amount: 0,
    description: '',
    category: 'Operativo',
  };

  get paymentData() {
    const bd = this.paymentBreakdown();
    return [
      { label: 'TRANSFERENCIA (NEQUI/DAVIPLATA)', percent: bd.transfer, color: 'secondary' },
      { label: 'EFECTIVO', percent: bd.cash, color: 'stark-gray' },
      { label: 'DATÁFONO / CARD', percent: bd.card, color: 'emerald' },
    ];
  }

  setFilter(filter: 'hoy' | 'ayer' | 'semana') {
    this.selectedFilter.set(filter);
  }

  openExpenseModal() {
    this.showExpenseModal.set(true);
  }

  closeExpenseModal() {
    this.showExpenseModal.set(false);
    this.newExpense = { amount: 0, description: '', category: 'Operativo' };
  }

  saveExpense() {
    if (this.newExpense.amount > 0 && this.newExpense.description) {
      this.data.addTransaction({
        type: 'Gasto',
        category: this.newExpense.category,
        amount: this.newExpense.amount,
        method: 'Efectivo',
        description: this.newExpense.description,
        date: new Date().toISOString().split('T')[0],
      });
      this.closeExpenseModal();
    }
  }

  viewStatDetail(stat: string) {
    // Could navigate to detail view
  }
}
