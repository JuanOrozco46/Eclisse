import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-dashboard-sales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-sales.html',
  styles: `
    select { cursor: pointer; }
    option { background: #131313; color: white; }
  `,
})
export class DashboardSales {
  data = inject(DataService);
  Math = Math;

  searchTerm = '';
  filterType = '';

  newTransaction = {
    type: 'Venta' as 'Venta' | 'Gasto',
    category: 'Pizza',
    amount: 0,
    method: 'Efectivo',
    description: ''
  };

  categories = ['Pizza', 'Bebidas', 'Postres', 'Ingredientes', 'Servicios', 'Personal', 'Mantenimiento', 'Otro'];

  todayIncome = this.data.todaySales;
  todayExpenses = this.data.todayExpenses;
  todayNet = this.data.todayProfit;
  transactionCount = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.data.transactions().filter(t => t.date === today).length;
  });

  get filteredTransactions() {
    let items = this.data.transactions();
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      items = items.filter(t =>
        t.description.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term)
      );
    }
    if (this.filterType) {
      items = items.filter(t => t.type === this.filterType);
    }
    return items;
  }

  addTransaction() {
    if (this.newTransaction.amount > 0 && this.newTransaction.description) {
      this.data.addTransaction({
        ...this.newTransaction,
        date: new Date().toISOString().split('T')[0],
      });
      this.newTransaction = { type: 'Venta', category: 'Pizza', amount: 0, method: 'Efectivo', description: '' };
    }
  }

  editingId: string | null = null;
  editData: any = null;

  startEdit(t: any) {
    this.editingId = t.id;
    this.editData = { ...t };
  }

  cancelEdit() {
    this.editingId = null;
    this.editData = null;
  }

  saveEdit() {
    if (this.editingId && this.editData) {
      this.data.updateTransaction(this.editingId, this.editData);
      this.cancelEdit();
    }
  }

  deleteTransaction(id: string) {
    if (confirm('¿Estás seguro de eliminar este registro?')) {
      this.data.deleteTransaction(id);
    }
  }

  exportPDF() {
    // Simple CSV export
    const header = 'Fecha,Tipo,Categoría,Descripción,Método,Valor\n';
    const rows = this.data.transactions().map(t =>
      `${t.date},${t.type},${t.category},"${t.description}",${t.method},${t.type === 'Gasto' ? '-' : ''}${t.amount}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eclisse_caja_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
