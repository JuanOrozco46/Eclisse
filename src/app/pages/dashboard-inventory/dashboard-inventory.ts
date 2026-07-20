import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, Ingredient } from '../../services/data.service';

@Component({
  selector: 'app-dashboard-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-inventory.html',
  styles: `
    select { cursor: pointer; }
    option { background: #131313; color: white; }
  `,
})
export class DashboardInventory {
  data = inject(DataService);
  Math = Math;

  showAddModal = signal(false);
  isEditing = false;
  editingId: string | null = null;
  searchTerm = '';

  newIngredient = {
    name: '',
    unit: 'kg',
    stock: 0,
    min: 0,
    category: 'Masas',
    costPerUnit: 0,
  };

  categories = ['Masas', 'Salsas', 'Quesos', 'Vegetales', 'Proteinas', 'Empaques', 'Bebidas', 'Condimentos', 'Lácteos', 'Otro'];

  get filteredIngredients() {
    const items = this.data.ingredients();
    if (!this.searchTerm) return items;
    const term = this.searchTerm.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term));
  }

  get lowStockCount() {
    return this.data.lowStockItems().length;
  }

  get totalValue() {
    return this.data.ingredients().reduce((acc, i) => acc + (i.stock * i.costPerUnit), 0);
  }

  saveIngredient() {
    if (this.newIngredient.name) {
      if (this.isEditing && this.editingId) {
        this.data.updateIngredient(this.editingId, { ...this.newIngredient });
      } else {
        this.data.addIngredient({ ...this.newIngredient });
      }
      this.closeModal();
    }
  }

  closeModal() {
    this.showAddModal.set(false);
    this.isEditing = false;
    this.editingId = null;
    this.newIngredient = { name: '', unit: 'kg', stock: 0, min: 0, category: 'Masas', costPerUnit: 0 };
  }

  addIngredient() {
    this.isEditing = false;
    this.editingId = null;
    this.newIngredient = { name: '', unit: 'kg', stock: 0, min: 0, category: 'Masas', costPerUnit: 0 };
    this.showAddModal.set(true);
  }

  editIngredient(item: Ingredient) {
    this.isEditing = true;
    this.editingId = item.id;
    this.newIngredient = {
      name: item.name,
      unit: item.unit,
      stock: item.stock,
      min: item.min,
      category: item.category,
      costPerUnit: item.costPerUnit,
    };
    this.showAddModal.set(true);
  }

  deleteIngredient(item: Ingredient) {
    if (confirm(`¿Seguro que deseas eliminar ${item.name}?`)) {
      this.data.deleteIngredient(item.id);
    }
  }

  adjustStock(item: Ingredient, delta: number) {
    this.data.adjustStock(item.id, delta);
  }
}
