import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, MenuItem } from '../services/data.service';

@Component({
  selector: 'app-dashboard-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex flex-col gap-12 animate-in fade-in slide-in-from-right-8 duration-700">
      <!-- Header -->
      <header class="flex flex-col md:flex-row justify-between items-start md:items-end border-b-2 border-outline-variant pb-12 gap-6">
        <div>
          <div class="flex items-center gap-4 mb-4">
            <span class="font-anton text-secondary text-2xl">009</span>
            <div class="h-px w-20 bg-outline-variant"></div>
          </div>
          <h1 class="font-anton text-7xl md:text-9xl text-white uppercase leading-none tracking-tighter">GESTIÓN DE<br/>CARTA</h1>
          <p class="font-label-caps text-[12px] text-secondary mt-6 tracking-brutal uppercase">ADMINISTRACIÓN DE PRODUCTOS</p>
        </div>
        <div class="flex gap-4 items-center">
          <!-- Category Filter -->
          <select [(ngModel)]="filterCategory" class="bg-background border border-outline-variant text-white p-3 font-label-caps text-[10px] uppercase tracking-widest appearance-none outline-none focus:border-secondary transition-colors">
            <option value="">TODAS</option>
            <option *ngFor="let cat of categories" [value]="cat">{{cat}}</option>
          </select>
          <button (click)="addItem()" class="bg-secondary text-on-secondary px-10 py-6 font-anton text-2xl uppercase tracking-widest hover:bg-white hover:text-black transition-all shadow-brutal-gold active:translate-y-1">
            + NUEVO PLATO
          </button>
        </div>
      </header>

      <!-- KPI Row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="border border-outline-variant bg-surface-container-low p-6">
          <span class="font-label-caps text-[9px] text-stark-gray opacity-40 tracking-widest uppercase block">TOTAL PLATOS</span>
          <span class="font-anton text-4xl text-white">{{data.menuItems().length}}</span>
        </div>
        <div class="border border-outline-variant bg-surface-container-low p-6">
          <span class="font-label-caps text-[9px] text-stark-gray opacity-40 tracking-widest uppercase block">DISPONIBLES</span>
          <span class="font-anton text-4xl text-emerald">{{data.availableMenuItems().length}}</span>
        </div>
        <div class="border border-outline-variant bg-surface-container-low p-6">
          <span class="font-label-caps text-[9px] text-stark-gray opacity-40 tracking-widest uppercase block">CATEGORÍAS</span>
          <span class="font-anton text-4xl text-white">{{uniqueCategories().length}}</span>
        </div>
        <div class="border border-outline-variant bg-surface-container-low p-6">
          <span class="font-label-caps text-[9px] text-stark-gray opacity-40 tracking-widest uppercase block">SIN STOCK</span>
          <span class="font-anton text-4xl" [ngClass]="unavailableCount() > 0 ? 'text-tomato' : 'text-white'">{{unavailableCount()}}</span>
        </div>
      </div>

      <!-- Menu Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
        <div *ngFor="let item of filteredItems()" class="border bg-surface-container-low p-8 flex flex-col relative group transition-all"
             [ngClass]="item.available ? 'border-outline-variant hover:border-stark-gray' : 'border-tomato/30 opacity-60'">
          <div class="absolute top-8 right-8 flex gap-2">
            <button (click)="toggleAvailability(item)" class="material-symbols-outlined text-xl transition-colors"
                    [ngClass]="item.available ? 'text-emerald hover:text-tomato' : 'text-tomato hover:text-emerald'"
                    [title]="item.available ? 'Deshabilitar' : 'Habilitar'">
              {{item.available ? 'toggle_on' : 'toggle_off'}}
            </button>
            <button (click)="editItem(item)" class="material-symbols-outlined text-stark-gray hover:text-secondary text-xl transition-colors">edit</button>
            <button (click)="deleteItem(item)" class="material-symbols-outlined text-stark-gray hover:text-tomato text-xl transition-colors">delete</button>
          </div>

          <div class="flex items-start gap-6 mb-8">
            <div class="w-16 h-16 border border-outline-variant flex items-center justify-center bg-background group-hover:border-secondary transition-colors">
               <span class="material-symbols-outlined text-secondary text-3xl">restaurant</span>
            </div>
            <div class="flex flex-col">
               <span class="font-label-caps text-[10px] text-secondary tracking-widest uppercase mb-1">{{item.category}}</span>
               <h3 class="font-anton text-4xl text-white uppercase tracking-tighter leading-none">{{item.name}}</h3>
            </div>
          </div>

          <p class="font-hanken text-sm text-stark-gray opacity-60 mb-10 leading-relaxed min-h-[40px]">
            {{item.description}}
          </p>

          <div class="grid grid-cols-1 gap-6 pt-6 border-t border-outline-variant">
             <div class="flex justify-between items-end">
                <div class="flex flex-col">
                   <span class="font-label-caps text-[9px] text-stark-gray opacity-40 uppercase tracking-widest mb-1">PRECIO ÚNICO</span>
                   <span class="font-anton text-3xl text-white">\${{item.price.toLocaleString('es-CO')}}</span>
                </div>
                <div class="flex flex-col items-end">
                   <span class="font-label-caps text-[9px] tracking-widest uppercase"
                         [ngClass]="item.ingredients.length > 0 ? 'text-emerald' : 'text-stark-gray opacity-40'">
                     {{item.ingredients.length}} INGREDIENTES
                   </span>
                   <span *ngIf="!item.available" class="font-label-caps text-[9px] text-tomato tracking-widest uppercase mt-1">NO DISPONIBLE</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div *ngIf="data.menuItems().length === 0" class="flex flex-col items-center justify-center py-32 border border-outline-variant border-dashed">
        <span class="material-symbols-outlined text-stark-gray opacity-10 text-8xl mb-6">restaurant</span>
        <h3 class="font-anton text-4xl text-stark-gray opacity-40 uppercase mb-4">CARTA VACÍA</h3>
        <p class="font-label-caps text-[10px] text-stark-gray opacity-30 uppercase tracking-widest mb-8">Agrega tu primer plato para comenzar</p>
        <button (click)="addItem()" class="bg-secondary text-on-secondary px-10 py-5 font-anton text-xl uppercase tracking-widest hover:bg-white hover:text-black transition-all shadow-brutal-gold">
          + CREAR PRIMER PLATO
        </button>
      </div>

      <!-- Add Item Modal -->
      <div *ngIf="showAddModal()" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-background/90 backdrop-blur-md" (click)="closeModal()"></div>
        
        <div class="relative w-full max-w-2xl bg-surface-container-low border-2 border-outline-variant p-12 shadow-brutal animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
          <header class="flex justify-between items-center mb-10 pb-6 border-b border-outline-variant">
            <h2 class="font-anton text-4xl text-white uppercase tracking-tighter">{{isEditing ? 'EDITAR PRODUCTO' : 'NUEVO PRODUCTO'}}</h2>
            <button (click)="closeModal()" class="material-symbols-outlined text-stark-gray hover:text-white transition-colors">close</button>
          </header>

          <form (ngSubmit)="saveItem()" class="space-y-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="space-y-2 md:col-span-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Nombre del Plato / Producto</label>
                <input type="text" name="name" [(ngModel)]="newItem.name" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border">
              </div>

              <div class="space-y-2 md:col-span-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Descripción</label>
                <textarea name="description" [(ngModel)]="newItem.description" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border h-24"></textarea>
              </div>
              <div class="space-y-2 md:col-span-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">URL de Imagen</label>
                <input type="text" name="image" [(ngModel)]="newItem.image" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary transition-colors border" placeholder="https://ejemplo.com/foto.jpg">
              </div>

              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Precio ($)</label>
                <input type="number" name="price" [(ngModel)]="newItem.price" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border">
              </div>

              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Categoría</label>
                <select name="category" [(ngModel)]="newItem.category" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary transition-colors border appearance-none outline-none">
                  <option *ngFor="let cat of categories" [value]="cat">{{cat}}</option>
                </select>
              </div>
            </div>

            <!-- Ingredient Linking -->
            <div class="space-y-4 border-t border-outline-variant pt-8" *ngIf="data.ingredients().length > 0">
              <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Vincular Ingredientes</label>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                <label *ngFor="let ing of data.ingredients()" class="flex items-center gap-3 p-3 border border-outline-variant hover:border-secondary cursor-pointer transition-colors">
                  <input type="checkbox" [checked]="newItem.ingredients.includes(ing.id)" (change)="toggleIngredient(ing.id)" class="accent-[var(--secondary)]">
                  <div class="flex flex-col">
                    <span class="font-label-caps text-[10px] text-white uppercase tracking-widest">{{ing.name}}</span>
                    <span class="font-label-caps text-[8px] text-stark-gray opacity-40 tracking-widest">{{ing.stock}} {{ing.unit}}</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="flex items-center gap-4 border-t border-outline-variant pt-8">
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="available" [(ngModel)]="newItem.available" class="accent-[var(--secondary)]">
                <span class="font-label-caps text-[10px] text-white uppercase tracking-widest">DISPONIBLE PARA VENTA</span>
              </label>
            </div>

            <div class="pt-4 flex gap-4">
              <button type="button" (click)="closeModal()" class="flex-1 py-5 border border-outline-variant text-stark-gray font-anton text-lg tracking-widest uppercase hover:bg-white/[0.05] transition-all">CANCELAR</button>
              <button type="submit" class="flex-1 py-5 bg-secondary text-on-secondary font-anton text-lg tracking-widest uppercase hover:bg-white hover:text-black transition-all shadow-brutal-gold">GUARDAR EN CARTA</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,

  styles: [`
    :host { display: block; padding-bottom: 100px; }
    select { cursor: pointer; }
    option { background: #131313; color: white; }
  `]
})
export class DashboardMenu {
  data = inject(DataService);

  showAddModal = signal(false);
  isEditing = false;
  editingId: string | null = null;
  filterCategory = '';

  categories = ['PIZZERÍA', 'ENTRADAS', 'BEBIDAS', 'POSTRES', 'PLATOS FUERTES', 'ENSALADAS'];

  newItem = {
    name: '',
    description: '',
    price: 0,
    category: 'PIZZERÍA',
    image: '',
    ingredients: [] as string[],
    available: true,
  };

  uniqueCategories = computed(() => {
    const cats = new Set(this.data.menuItems().map((i: MenuItem) => i.category));
    return Array.from(cats);
  });

  unavailableCount = computed(() => this.data.menuItems().filter((i: MenuItem) => !i.available).length);

  filteredItems = computed(() => {
    const items = this.data.menuItems();
    if (!this.filterCategory) return items;
    return items.filter((i: MenuItem) => i.category === this.filterCategory);
  });

  addItem() {
    this.isEditing = false;
    this.editingId = null;
    this.newItem = { name: '', description: '', price: 0, category: 'PIZZERÍA', image: '', ingredients: [], available: true };
    this.showAddModal.set(true);
  }

  saveItem() {
    if (this.newItem.name && this.newItem.price > 0) {
      if (this.isEditing && this.editingId) {
        this.data.updateMenuItem(this.editingId, { ...this.newItem });
      } else {
        this.data.addMenuItem({ ...this.newItem });
      }
      this.closeModal();
    }
  }

  closeModal() {
    this.showAddModal.set(false);
    this.isEditing = false;
    this.editingId = null;
    this.newItem = { name: '', description: '', price: 0, category: 'PIZZERÍA', image: '', ingredients: [], available: true };
  }

  editItem(item: MenuItem) {
    this.isEditing = true;
    this.editingId = item.id;
    this.newItem = { 
      name: item.name, 
      description: item.description, 
      price: item.price, 
      category: item.category, 
      image: item.image || '',
      ingredients: [...item.ingredients],
      available: item.available,
    };
    this.showAddModal.set(true);
  }

  deleteItem(item: MenuItem) {
    if (confirm(`¿Deseas retirar ${item.name} de la carta?`)) {
      this.data.deleteMenuItem(item.id);
    }
  }

  toggleAvailability(item: MenuItem) {
    this.data.updateMenuItem(item.id, { available: !item.available });
  }

  toggleIngredient(ingredientId: string) {
    const idx = this.newItem.ingredients.indexOf(ingredientId);
    if (idx === -1) {
      this.newItem.ingredients.push(ingredientId);
    } else {
      this.newItem.ingredients.splice(idx, 1);
    }
  }
}
