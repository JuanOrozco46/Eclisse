import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SiteSettingsService, SitePhotos, DEFAULT_SITE_SETTINGS } from '../services/site-settings.service';
import { DataService } from '../services/data.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-dashboard-appearance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="relative flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-24">
  <!-- Header -->
  <header class="flex flex-col md:flex-row justify-between items-start md:items-end border-b-2 border-outline-variant pb-10 gap-8">
    <div>
      <div class="flex items-center gap-4 mb-4">
        <span class="font-anton text-secondary text-2xl">008</span>
        <div class="h-px w-20 bg-outline-variant"></div>
      </div>
      <h1 class="font-anton text-6xl md:text-8xl text-white uppercase leading-none tracking-tighter">GESTOR DE<br/>CONTENIDO WEB</h1>
      <p class="font-label-caps text-[11px] text-secondary mt-4 tracking-brutal uppercase">
        PERSONALIZACIÓN EN VIVO · FOTOS DESDE TU EQUIPO O URL · TEXTOS Y CONVERSIÓN
      </p>
    </div>

    <div class="flex flex-wrap gap-4 items-center">
      <a routerLink="/" target="_blank"
         class="px-6 py-4 border border-outline-variant text-stark-gray hover:text-white hover:border-secondary font-anton text-sm tracking-widest uppercase transition-all no-underline flex items-center gap-2">
        <span class="material-symbols-outlined text-base">open_in_new</span>
        VER WEB PÚBLICA
      </a>
      <button (click)="resetDefaults()"
              type="button"
              class="px-6 py-4 border border-outline-variant text-stark-gray hover:text-tomato hover:border-tomato font-anton text-sm tracking-widest uppercase transition-all cursor-pointer">
        RESTAURAR BASE
      </button>
      <button (click)="saveAll()"
              [disabled]="settings.saving()"
              class="px-10 py-5 bg-secondary text-on-secondary border-2 border-secondary font-anton text-lg tracking-widest uppercase hover:bg-white hover:text-black transition-all shadow-brutal-gold disabled:opacity-40 flex items-center gap-3 cursor-pointer">
        <span *ngIf="!settings.saving() && !settings.saved()">GUARDAR CAMBIOS</span>
        <span *ngIf="settings.saving()" class="flex items-center gap-2">
          <span class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
          GUARDANDO...
        </span>
        <span *ngIf="settings.saved()" class="flex items-center gap-2">
          <span class="material-symbols-outlined text-lg">check_circle</span>
          ¡GUARDADO!
        </span>
      </button>
    </div>
  </header>

  <!-- Tabs Navigation -->
  <div class="flex flex-wrap gap-3 border-b border-outline-variant pb-4">
    <button (click)="activeTab.set('HERO')"
            class="px-6 py-3 font-anton text-base uppercase tracking-widest border transition-all flex items-center gap-2 cursor-pointer"
            [ngClass]="activeTab() === 'HERO' ? 'bg-secondary text-on-secondary border-secondary shadow-brutal-gold' : 'bg-surface-container-low text-stark-gray border-outline-variant hover:text-white'">
      <span class="material-symbols-outlined text-lg">wallpaper</span>
      1. PORTADA (HERO) & PROMO
    </button>
    <button (click)="activeTab.set('CARTA')"
            class="px-6 py-3 font-anton text-base uppercase tracking-widest border transition-all flex items-center gap-2 cursor-pointer"
            [ngClass]="activeTab() === 'CARTA' ? 'bg-secondary text-on-secondary border-secondary shadow-brutal-gold' : 'bg-surface-container-low text-stark-gray border-outline-variant hover:text-white'">
      <span class="material-symbols-outlined text-lg">local_pizza</span>
      2. DESTACADO & CARTA
    </button>
    <button (click)="activeTab.set('GALERIA')"
            class="px-6 py-3 font-anton text-base uppercase tracking-widest border transition-all flex items-center gap-2 cursor-pointer"
            [ngClass]="activeTab() === 'GALERIA' ? 'bg-secondary text-on-secondary border-secondary shadow-brutal-gold' : 'bg-surface-container-low text-stark-gray border-outline-variant hover:text-white'">
      <span class="material-symbols-outlined text-lg">photo_library</span>
      3. GALERÍA & CONTACTO
    </button>
  </div>

  <!-- ═══════════════════════════════════════════ -->
  <!-- TAB 1: PORTADA (HERO) & CINTILLO PROMO      -->
  <!-- ═══════════════════════════════════════════ -->
  <div *ngIf="activeTab() === 'HERO'" class="grid grid-cols-1 lg:grid-cols-12 gap-8">

    <!-- Cintillo Promocional Superior -->
    <div class="lg:col-span-12 border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant pb-4">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-secondary text-2xl">campaign</span>
          <div>
            <h2 class="font-anton text-2xl text-white uppercase tracking-tighter">CINTILLO DE AVISO / PROMOCIÓN SUPERIOR</h2>
            <p class="font-label-caps text-[9px] text-stark-gray opacity-50 uppercase tracking-widest">
              APARECE ARRIBA DE LA PORTADA PARA LLAMAR LA ATENCIÓN DE INMEDIATO
            </p>
          </div>
        </div>
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" [(ngModel)]="form.promo_enabled" class="w-5 h-5 accent-[var(--secondary)]">
          <span class="font-anton text-sm uppercase tracking-widest"
                [ngClass]="form.promo_enabled ? 'text-emerald' : 'text-stark-gray'">
            {{ form.promo_enabled ? 'ACTIVO EN LA WEB' : 'OCULTO' }}
          </span>
        </label>
      </div>

      <div class="flex flex-col gap-2">
        <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">TEXTO DEL CINTILLO</label>
        <input type="text" [(ngModel)]="form.promo_text"
               placeholder="Ej: 🔥 DOMICILIOS EN ARMENIA · HORARIO 5:00 PM A 11:00 PM · PIDE DIRECTO AQUÍ"
               class="w-full bg-background border border-outline-variant focus:border-secondary p-4 font-hanken text-sm text-white outline-none">
      </div>
    </div>

    <!-- Foto Principal del Hero -->
    <div class="lg:col-span-5 border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <h3 class="font-anton text-2xl text-white uppercase tracking-tighter">FOTO DE PORTADA (HERO)</h3>
        <span class="font-label-caps text-[9px] text-secondary border border-secondary/30 px-2.5 py-1">IMAGEN PRINCIPAL</span>
      </div>

      <div class="border border-outline-variant overflow-hidden aspect-[4/3] bg-surface-container-lowest flex items-center justify-center relative">
        <img *ngIf="form.hero_main" [src]="form.hero_main"
             [class.rotate-90]="form.hero_main === '/assets/cocina_oculta.png'"
             class="w-full h-full object-cover" alt="Hero preview"
             (error)="onImageError($event)">
        <span *ngIf="!form.hero_main" class="material-symbols-outlined text-stark-gray opacity-20 text-6xl">image</span>
      </div>

      <!-- Botón subir desde dispositivo -->
      <div class="flex flex-col gap-3">
        <label class="w-full py-4 px-5 border-2 border-dashed border-secondary/60 hover:border-secondary bg-secondary/5 hover:bg-secondary/10 text-secondary font-anton text-sm tracking-widest uppercase flex items-center justify-center gap-3 cursor-pointer transition-all text-center">
          <span class="material-symbols-outlined">upload_file</span>
          <span>{{ uploadingKey() === 'hero_main' ? 'PROCESANDO IMAGEN...' : 'SUBIR FOTO DESDE MI PC / CELULAR' }}</span>
          <input type="file" accept="image/*" class="hidden" (change)="onFileSelected($event, 'hero_main')">
        </label>

        <div class="flex flex-col gap-1.5 mt-1">
          <label class="font-label-caps text-[9px] text-stark-gray opacity-60 uppercase tracking-widest">O PEGAR URL DE IMAGEN:</label>
          <input type="url" [(ngModel)]="form.hero_main"
                 placeholder="https://ejemplo.com/foto.jpg"
                 class="w-full bg-background border border-outline-variant focus:border-secondary p-3 font-mono text-xs text-white outline-none">
        </div>
      </div>
    </div>

    <!-- Textos del Hero -->
    <div class="lg:col-span-7 border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-6">
      <h3 class="font-anton text-2xl text-white uppercase tracking-tighter border-b border-outline-variant pb-4">
        TEXTOS DE LA PORTADA
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="md:col-span-2 flex flex-col gap-1.5">
          <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">ETIQUETA ROJA SUPERIOR</label>
          <input type="text" [(ngModel)]="form.hero_tag"
                 class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-hanken text-sm text-white outline-none">
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">TÍTULO LÍNEA 1 (BLANCO)</label>
          <input type="text" [(ngModel)]="form.hero_title_1"
                 class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-anton text-xl text-white outline-none uppercase">
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">TÍTULO LÍNEA 2 (BLANCO)</label>
          <input type="text" [(ngModel)]="form.hero_title_2"
                 class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-anton text-xl text-white outline-none uppercase">
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">TÍTULO LÍNEA 3 (DORADO DESTACADO)</label>
          <input type="text" [(ngModel)]="form.hero_title_accent"
                 class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-anton text-xl text-secondary outline-none uppercase">
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">SELLO FLOTANTE EN FOTO</label>
          <input type="text" [(ngModel)]="form.hero_badge"
                 placeholder="EST. 2024"
                 class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-anton text-lg text-white outline-none uppercase">
        </div>

        <div class="md:col-span-2 flex flex-col gap-1.5">
          <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">DESCRIPCIÓN DE PORTADA</label>
          <textarea [(ngModel)]="form.hero_subtitle" rows="3"
                    class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-hanken text-sm text-white outline-none"></textarea>
        </div>
      </div>

      <!-- 3 Indicadores rápidos -->
      <div class="border-t border-outline-variant pt-5">
        <span class="font-label-caps text-[10px] text-stark-gray opacity-60 uppercase tracking-widest block mb-4">
          INDICADORES RÁPIDOS DE PORTADA (3 CIFRAS CLAVE)
        </span>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-background border border-outline-variant p-4 space-y-2">
            <input type="text" [(ngModel)]="form.stat_1_val" placeholder="12&quot;"
                   class="w-full bg-surface-container-low border border-outline-variant p-2 font-anton text-xl text-white outline-none">
            <input type="text" [(ngModel)]="form.stat_1_label" placeholder="HORNO OONI"
                   class="w-full bg-surface-container-low border border-outline-variant p-2 font-label-caps text-[9px] text-stark-gray outline-none uppercase">
          </div>
          <div class="bg-background border border-outline-variant p-4 space-y-2">
            <input type="text" [(ngModel)]="form.stat_2_val" placeholder="48H"
                   class="w-full bg-surface-container-low border border-outline-variant p-2 font-anton text-xl text-white outline-none">
            <input type="text" [(ngModel)]="form.stat_2_label" placeholder="FERMENTACIÓN"
                   class="w-full bg-surface-container-low border border-outline-variant p-2 font-label-caps text-[9px] text-stark-gray outline-none uppercase">
          </div>
          <div class="bg-background border border-outline-variant p-4 space-y-2">
            <input type="text" [(ngModel)]="form.stat_3_val" placeholder="$25K"
                   class="w-full bg-surface-container-low border border-outline-variant p-2 font-anton text-xl text-secondary outline-none">
            <input type="text" [(ngModel)]="form.stat_3_label" placeholder="PRECIO ÚNICO"
                   class="w-full bg-surface-container-low border border-outline-variant p-2 font-label-caps text-[9px] text-stark-gray outline-none uppercase">
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════ -->
  <!-- TAB 2: PLATO ESTRELLA & CARTA PÚBLICA       -->
  <!-- ═══════════════════════════════════════════ -->
  <div *ngIf="activeTab() === 'CARTA'" class="grid grid-cols-1 lg:grid-cols-12 gap-8">
    <div class="lg:col-span-7 border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-6">
      <div class="flex items-center gap-3 border-b border-outline-variant pb-4">
        <span class="material-symbols-outlined text-secondary text-2xl">star</span>
        <div>
          <h2 class="font-anton text-2xl text-white uppercase tracking-tighter">PLATO RECOMENDADO (BEST SELLER 🔥)</h2>
          <p class="font-label-caps text-[9px] text-stark-gray opacity-50 uppercase tracking-widest">
            SE DESTACA EN GRANDE AL PRINCIPIO DE LA CARTA PARA IMPULSAR LA VENTA
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">SELECCIONA EL PLATO ESTRELLA</label>
        <select [(ngModel)]="form.best_seller_id"
                class="w-full bg-background border border-outline-variant focus:border-secondary p-4 font-anton text-lg text-white outline-none uppercase">
          <option *ngFor="let item of data.menuItems()" [value]="item.id">
            {{ item.name }} — \${{ item.price.toLocaleString('es-CO') }} ({{ item.category }})
          </option>
        </select>
      </div>

      <div class="flex flex-col gap-2">
        <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">SUBTÍTULO DE LA SECCIÓN "LA CARTA"</label>
        <input type="text" [(ngModel)]="form.carta_subtitle"
               placeholder="TAMAÑO MEDIANO (6 PORCIONES) · MASA MADURADA 48H · AGREGA A TU PEDIDO"
               class="w-full bg-background border border-outline-variant focus:border-secondary p-4 font-hanken text-sm text-white outline-none">
      </div>
    </div>

    <div class="lg:col-span-5 border border-secondary/40 bg-secondary/5 p-8 flex flex-col justify-between gap-6">
      <div class="flex flex-col gap-4">
        <span class="material-symbols-outlined text-secondary text-5xl">restaurant_menu</span>
        <h3 class="font-anton text-3xl text-white uppercase tracking-tighter">¿QUIERES EDITAR PIZZAS, PRECIOS O SUBIR FOTOS DE PLATOS?</h3>
        <p class="font-hanken text-sm text-stark-gray opacity-80 leading-relaxed">
          En el módulo de <strong>Gestión de Carta</strong> puedes crear nuevos platos, cambiar precios, activar/desactivar disponibilidad y subir la foto de cada pizza desde tu celular o PC.
        </p>
      </div>
      <a routerLink="/dashboard/carta"
         class="w-full py-4 bg-secondary text-on-secondary font-anton text-center text-lg uppercase tracking-widest hover:bg-white hover:text-black transition-all no-underline shadow-brutal-gold">
        IR A GESTIÓN DE CARTA →
      </a>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════ -->
  <!-- TAB 3: GALERÍA (EL RITUAL) & CONTACTO       -->
  <!-- ═══════════════════════════════════════════ -->
  <div *ngIf="activeTab() === 'GALERIA'" class="flex flex-col gap-8">

    <!-- Toggle Mostrar/Ocultar Galería -->
    <div class="border border-outline-variant bg-surface-container-low p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="font-anton text-2xl text-white uppercase tracking-tighter">SECCIÓN "EL RITUAL" (GALERÍA DE 3 FOTOS)</h2>
        <p class="font-label-caps text-[9px] text-stark-gray opacity-50 uppercase tracking-widest">
          PUEDES MOSTRARLA DEBAJO DE LA CARTA O DESACTIVARLA SI PREFIERES UNA WEB ULTRA-CORTA
        </p>
      </div>
      <label class="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" [(ngModel)]="form.show_gallery" class="w-5 h-5 accent-[var(--secondary)]">
        <span class="font-anton text-sm uppercase tracking-widest"
              [ngClass]="form.show_gallery ? 'text-emerald' : 'text-stark-gray'">
          {{ form.show_gallery ? 'VISIBLE EN LA WEB' : 'OCULTA' }}
        </span>
      </label>
    </div>

    <!-- 3 Tarjetas de Galería -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div *ngFor="let slot of gallerySlots; let i = index"
           class="border border-outline-variant bg-surface-container-low p-6 flex flex-col gap-5 relative overflow-hidden">
        <div class="flex items-center justify-between">
          <h3 class="font-anton text-2xl text-white uppercase tracking-tighter">FOTO GALERÍA 0{{ i + 1 }}</h3>
          <span class="font-anton text-secondary text-lg">0{{ i + 1 }}</span>
        </div>

        <div class="border border-outline-variant overflow-hidden aspect-square bg-surface-container-lowest flex items-center justify-center">
          <img *ngIf="getPhotoValue(slot.photoKey)" [src]="getPhotoValue(slot.photoKey)"
               class="w-full h-full object-cover" [alt]="'Galería ' + (i+1)"
               (error)="onImageError($event)">
          <span *ngIf="!getPhotoValue(slot.photoKey)" class="material-symbols-outlined text-stark-gray opacity-20 text-5xl">image</span>
        </div>

        <label class="w-full py-3 px-4 border border-dashed border-secondary/60 hover:border-secondary bg-secondary/5 text-secondary font-anton text-xs tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer transition-all text-center">
          <span class="material-symbols-outlined text-base">upload_file</span>
          <span>{{ uploadingKey() === slot.photoKey ? 'PROCESANDO...' : 'SUBIR DESDE PC / CELULAR' }}</span>
          <input type="file" accept="image/*" class="hidden" (change)="onFileSelected($event, slot.photoKey)">
        </label>

        <div class="flex flex-col gap-1">
          <label class="font-label-caps text-[9px] text-stark-gray opacity-60 uppercase tracking-widest">O URL DE IMAGEN:</label>
          <input type="url" [ngModel]="getPhotoValue(slot.photoKey)" (ngModelChange)="setPhotoValue(slot.photoKey, $event)"
                 placeholder="https://..."
                 class="w-full bg-background border border-outline-variant focus:border-secondary p-2.5 font-mono text-xs text-white outline-none">
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-label-caps text-[9px] text-secondary uppercase tracking-widest">FRASE SOBRE LA FOTO:</label>
          <textarea [ngModel]="getPhotoValue(slot.quoteKey)" (ngModelChange)="setPhotoValue(slot.quoteKey, $event)"
                    rows="2"
                    class="w-full bg-background border border-outline-variant focus:border-secondary p-2.5 font-hanken text-xs text-white outline-none"></textarea>
        </div>
      </div>
    </div>

    <!-- Instagram & Ubicación -->
    <div class="border border-outline-variant bg-surface-container-low p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="flex flex-col gap-2">
        <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">USUARIO DE INSTAGRAM</label>
        <input type="text" [(ngModel)]="form.instagram_handle"
               placeholder="@ECLISSE.PIZZA"
               class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-anton text-base text-white outline-none">
      </div>
      <div class="flex flex-col gap-2">
        <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">ENLACE DE INSTAGRAM</label>
        <input type="url" [(ngModel)]="form.instagram_url"
               placeholder="https://instagram.com/eclisse.pizza"
               class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-mono text-xs text-white outline-none">
      </div>
      <div class="flex flex-col gap-2">
        <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">CIUDAD / TÍTULO DE UBICACIÓN</label>
        <input type="text" [(ngModel)]="form.location_city"
               placeholder="ARMENIA, QUINDÍO"
               class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-anton text-base text-white outline-none uppercase">
      </div>
      <div class="flex flex-col gap-2">
        <label class="font-label-caps text-[10px] text-secondary uppercase tracking-widest">DIRECCIÓN Y TEXTO DE COBERTURA</label>
        <input type="text" [(ngModel)]="form.location_address"
               placeholder="Calle 2N 18-144 · Domicilios rápidos..."
               class="w-full bg-background border border-outline-variant focus:border-secondary p-3.5 font-hanken text-sm text-white outline-none">
      </div>
    </div>
  </div>
</div>
  `
})
export class DashboardAppearance implements OnInit {
  settings = inject(SiteSettingsService);
  data = inject(DataService);
  private toast = inject(ToastService);

  activeTab = signal<'HERO' | 'CARTA' | 'GALERIA'>('HERO');
  uploadingKey = signal<string | null>(null);

  form: SitePhotos = { ...DEFAULT_SITE_SETTINGS };

  gallerySlots: {
    photoKey: 'gallery_1' | 'gallery_2' | 'gallery_3';
    quoteKey: 'gallery_quote_1' | 'gallery_quote_2' | 'gallery_quote_3';
  }[] = [
    { photoKey: 'gallery_1', quoteKey: 'gallery_quote_1' },
    { photoKey: 'gallery_2', quoteKey: 'gallery_quote_2' },
    { photoKey: 'gallery_3', quoteKey: 'gallery_quote_3' },
  ];

  ngOnInit() {
    this.settings.loadPhotos().then(() => {
      this.form = { ...this.settings.sitePhotos() };
    });
  }

  getPhotoValue(key: 'gallery_1' | 'gallery_2' | 'gallery_3' | 'gallery_quote_1' | 'gallery_quote_2' | 'gallery_quote_3'): string {
    return this.form[key];
  }

  setPhotoValue(key: 'gallery_1' | 'gallery_2' | 'gallery_3' | 'gallery_quote_1' | 'gallery_quote_2' | 'gallery_quote_3', value: string) {
    this.form[key] = value;
  }

  async onFileSelected(event: Event, key: 'hero_main' | 'gallery_1' | 'gallery_2' | 'gallery_3') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingKey.set(key);
    try {
      const compressedDataUrl = await this.settings.compressImageFile(file, 1200, 0.82);
      this.form[key] = compressedDataUrl;
      this.toast.showSuccess('Imagen procesada. Haz clic en GUARDAR CAMBIOS para publicar.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar imagen';
      this.toast.showError(msg);
    } finally {
      this.uploadingKey.set(null);
      input.value = '';
    }
  }

  onImageError(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  resetDefaults() {
    if (confirm('¿Restaurar todos los textos y fotos de la web a los valores originales?')) {
      this.form = { ...DEFAULT_SITE_SETTINGS };
    }
  }

  async saveAll() {
    await this.settings.savePhotos(this.form);
  }
}
