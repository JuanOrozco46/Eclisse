import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, MenuItem } from '../services/data.service';
import { SiteSettingsService } from '../services/site-settings.service';
import { ToastService } from '../services/toast.service';

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
          <p class="font-label-caps text-[12px] text-secondary mt-6 tracking-brutal uppercase">ADMINISTRACIÓN DE PRODUCTOS Y FOTOS</p>
        </div>
        <div class="flex gap-4 items-center flex-wrap">
          <!-- Category Filter -->
          <select [(ngModel)]="filterCategory" class="bg-background border border-outline-variant text-white p-3 font-label-caps text-[10px] uppercase tracking-widest appearance-none outline-none focus:border-secondary transition-colors">
            <option value="">TODAS LAS CATEGORÍAS</option>
            <option *ngFor="let cat of availableCategories()" [value]="cat">{{cat}}</option>
          </select>
          <button (click)="addItem()" class="bg-secondary text-on-secondary px-10 py-6 font-anton text-2xl uppercase tracking-widest hover:bg-white hover:text-black transition-all shadow-brutal-gold active:translate-y-1 cursor-pointer">
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
          <span class="font-label-caps text-[9px] text-stark-gray opacity-40 tracking-widest uppercase block">NO DISPONIBLES</span>
          <span class="font-anton text-4xl" [ngClass]="unavailableCount() > 0 ? 'text-tomato' : 'text-white'">{{unavailableCount()}}</span>
        </div>
      </div>

      <!-- Menu Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        <div *ngFor="let item of filteredItems()"
             class="border bg-surface-container-low p-6 flex flex-col justify-between relative group transition-all"
             [ngClass]="item.available ? 'border-outline-variant hover:border-secondary' : 'border-tomato/30 opacity-60'">

          <!-- Top Actions -->
          <div>
            <div class="flex justify-between items-center mb-4">
              <button (click)="setAsBestSeller(item)"
                      type="button"
                      class="px-3 py-1 font-label-caps text-[9px] uppercase tracking-widest border transition-all flex items-center gap-1 cursor-pointer"
                      [ngClass]="siteSettings.sitePhotos().best_seller_id === item.id
                        ? 'bg-secondary text-on-secondary border-secondary font-bold'
                        : 'border-outline-variant text-stark-gray hover:border-secondary hover:text-secondary'"
                      title="Destacar como plato recomendado en la portada de la carta">
                <span class="material-symbols-outlined text-xs">star</span>
                {{ siteSettings.sitePhotos().best_seller_id === item.id ? 'RECOMENDADO 🔥' : 'DESTACAR' }}
              </button>

              <div class="flex gap-2 items-center">
                <button (click)="toggleAvailability(item)" class="material-symbols-outlined text-2xl transition-colors cursor-pointer"
                        [ngClass]="item.available ? 'text-emerald hover:text-tomato' : 'text-tomato hover:text-emerald'"
                        [title]="item.available ? 'Deshabilitar' : 'Habilitar'">
                  {{item.available ? 'toggle_on' : 'toggle_off'}}
                </button>
                <button (click)="editItem(item)" class="material-symbols-outlined text-stark-gray hover:text-secondary text-xl transition-colors cursor-pointer" title="Editar plato">edit</button>
                <button (click)="deleteItem(item)" class="material-symbols-outlined text-stark-gray hover:text-tomato text-xl transition-colors cursor-pointer" title="Eliminar plato">delete</button>
              </div>
            </div>

            <!-- Image Thumbnail + Title -->
            <div class="flex items-start gap-5 mb-5">
              <div class="w-24 h-24 shrink-0 border border-outline-variant overflow-hidden flex items-center justify-center bg-background group-hover:border-secondary transition-colors">
                <img *ngIf="item.image" [src]="item.image" [alt]="item.name" class="w-full h-full object-cover">
                <span *ngIf="!item.image" class="material-symbols-outlined text-secondary text-3xl opacity-40">local_pizza</span>
              </div>
              <div class="flex flex-col">
                <span class="font-label-caps text-[10px] text-secondary tracking-widest uppercase mb-1">{{item.category}}</span>
                <h3 class="font-anton text-3xl text-white uppercase tracking-tighter leading-none">{{item.name}}</h3>
                <p class="font-hanken text-xs text-stark-gray opacity-60 mt-2 line-clamp-3 leading-relaxed">
                  {{item.description}}
                </p>
              </div>
            </div>
          </div>

          <div class="pt-4 border-t border-outline-variant flex justify-between items-end">
            <div class="flex flex-col">
              <span class="font-label-caps text-[9px] text-stark-gray opacity-40 uppercase tracking-widest mb-1">PRECIO</span>
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

      <!-- Empty State -->
      <div *ngIf="data.menuItems().length === 0" class="flex flex-col items-center justify-center py-32 border border-outline-variant border-dashed">
        <span class="material-symbols-outlined text-stark-gray opacity-10 text-8xl mb-6">restaurant</span>
        <h3 class="font-anton text-4xl text-stark-gray opacity-40 uppercase mb-4">CARTA VACÍA</h3>
        <p class="font-label-caps text-[10px] text-stark-gray opacity-30 uppercase tracking-widest mb-8">Agrega tu primer plato para comenzar</p>
        <button (click)="addItem()" class="bg-secondary text-on-secondary px-10 py-5 font-anton text-xl uppercase tracking-widest hover:bg-white hover:text-black transition-all shadow-brutal-gold">
          + CREAR PRIMER PLATO
        </button>
      </div>

      <!-- Add / Edit Item Modal -->
      <div *ngIf="showAddModal()" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-background/90 backdrop-blur-md" (click)="closeModal()"></div>
        
        <div class="relative w-full max-w-2xl bg-surface-container-low border-2 border-outline-variant p-8 md:p-10 shadow-brutal animate-in fade-in zoom-in duration-300 max-h-[92vh] overflow-y-auto">
          <header class="flex justify-between items-center mb-8 pb-4 border-b border-outline-variant">
            <h2 class="font-anton text-4xl text-white uppercase tracking-tighter">{{isEditing ? 'EDITAR PRODUCTO' : 'NUEVO PRODUCTO'}}</h2>
            <button (click)="closeModal()" class="material-symbols-outlined text-stark-gray hover:text-white transition-colors cursor-pointer">close</button>
          </header>

          <form (ngSubmit)="saveItem()" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2 md:col-span-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Nombre del Plato / Producto</label>
                <input type="text" name="name" [(ngModel)]="newItem.name" required class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border">
              </div>

              <div class="space-y-2 md:col-span-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Descripción</label>
                <textarea name="description" [(ngModel)]="newItem.description" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border h-24"></textarea>
              </div>

              <!-- Subida de Imagen del Plato (Archivo o URL) -->
              <div class="space-y-3 md:col-span-2 border border-outline-variant bg-background p-5">
                <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest block">Foto del Producto</label>
                <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  <div class="sm:col-span-4 aspect-square border border-outline-variant bg-surface-container-low flex items-center justify-center overflow-hidden">
                    <img *ngIf="newItem.image" [src]="newItem.image" alt="Vista previa" class="w-full h-full object-cover">
                    <span *ngIf="!newItem.image" class="material-symbols-outlined text-stark-gray opacity-20 text-5xl">image</span>
                  </div>
                  <div class="sm:col-span-8 flex flex-col gap-3">
                    <label class="w-full py-3.5 px-4 border-2 border-dashed border-secondary/60 hover:border-secondary bg-secondary/5 text-secondary font-anton text-xs tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer transition-all text-center">
                      <span class="material-symbols-outlined text-base">upload_file</span>
                      <span>{{ uploadingPhoto() ? 'OPTIMIZANDO FOTO...' : 'SUBIR FOTO DESDE MI PC / CELULAR' }}</span>
                      <input type="file" accept="image/*" class="hidden" (change)="onDishPhotoSelected($event)">
                    </label>
                    <input type="text" name="image" [(ngModel)]="newItem.image"
                           class="w-full bg-surface-container-low border-outline-variant text-white p-3 font-mono text-xs focus:border-secondary transition-colors border outline-none"
                           placeholder="O pega aquí una URL de imagen (https://...)">
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Precio ($ COP)</label>
                <input type="number" name="price" [(ngModel)]="newItem.price" required class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border">
              </div>

              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Categoría</label>
                <select name="category" [(ngModel)]="newItem.category" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary transition-colors border appearance-none outline-none">
                  <option *ngFor="let cat of availableCategories()" [value]="cat">{{cat}}</option>
                </select>
              </div>
            </div>

            <!-- Ingredient Linking -->
            <div class="space-y-4 border-t border-outline-variant pt-6" *ngIf="data.ingredients().length > 0">
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

            <div class="flex items-center gap-4 border-t border-outline-variant pt-6">
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="available" [(ngModel)]="newItem.available" class="accent-[var(--secondary)]">
                <span class="font-label-caps text-[10px] text-white uppercase tracking-widest">DISPONIBLE PARA VENTA EN LA WEB Y BOT</span>
              </label>
            </div>

            <div class="pt-4 flex gap-4">
              <button type="button" (click)="closeModal()" class="flex-1 py-5 border border-outline-variant text-stark-gray font-anton text-lg tracking-widest uppercase hover:bg-white/[0.05] transition-all cursor-pointer">CANCELAR</button>
              <button type="submit" class="flex-1 py-5 bg-secondary text-on-secondary font-anton text-lg tracking-widest uppercase hover:bg-white hover:text-black transition-all shadow-brutal-gold cursor-pointer">GUARDAR EN CARTA</button>
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
  siteSettings = inject(SiteSettingsService);
  private toast = inject(ToastService);

  showAddModal = signal(false);
  uploadingPhoto = signal(false);
  isEditing = false;
  editingId: string | null = null;
  filterCategory = '';

  baseCategories = ['Pizzas', 'Bebidas', 'Entradas', 'Postres', 'Adiciones'];

  availableCategories = computed(() => {
    const set = new Set<string>(this.baseCategories);
    this.data.menuItems().forEach((i: MenuItem) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  });

  newItem = {
    name: '',
    description: '',
    price: 25000,
    category: 'Pizzas',
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
    this.newItem = { name: '', description: '', price: 25000, category: 'Pizzas', image: '', ingredients: [], available: true };
    this.showAddModal.set(true);
  }

  async onDishPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingPhoto.set(true);
    try {
      const dataUrl = await this.siteSettings.compressImageFile(file, 900, 0.82);
      this.newItem.image = dataUrl;
      this.toast.showSuccess('Foto lista. Guarda el plato para publicar.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo procesar la foto';
      this.toast.showError(msg);
    } finally {
      this.uploadingPhoto.set(false);
      input.value = '';
    }
  }

  async setAsBestSeller(item: MenuItem) {
    const current = this.siteSettings.sitePhotos();
    await this.siteSettings.savePhotos({
      ...current,
      best_seller_id: item.id,
    });
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
    this.newItem = { name: '', description: '', price: 25000, category: 'Pizzas', image: '', ingredients: [], available: true };
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
