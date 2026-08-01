import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteSettingsService, SitePhotos } from '../services/site-settings.service';

@Component({
  selector: 'app-dashboard-appearance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="relative flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
  <!-- Header -->
  <header class="flex flex-col md:flex-row justify-between items-start md:items-end border-b-2 border-outline-variant pb-12 gap-8">
    <div>
      <div class="flex items-center gap-4 mb-4">
        <span class="font-anton text-secondary text-2xl">008</span>
        <div class="h-px w-20 bg-outline-variant"></div>
      </div>
      <h1 class="font-anton text-7xl md:text-9xl text-white uppercase leading-none tracking-tighter">APARIENCIA<br/>DEL SITIO</h1>
      <p class="font-label-caps text-[12px] text-secondary mt-6 tracking-brutal uppercase">GESTOR DE FOTOS DEL INDEX PÚBLICO</p>
    </div>
    <button (click)="saveAll()"
            [disabled]="settings.saving()"
            class="px-12 py-6 border-2 border-secondary text-secondary font-anton text-xl tracking-widest uppercase hover:bg-secondary hover:text-black transition-all shadow-brutal-gold disabled:opacity-40 flex items-center gap-3">
      <span *ngIf="!settings.saving() && !settings.saved()">GUARDAR CAMBIOS</span>
      <span *ngIf="settings.saving()" class="flex items-center gap-2">
        <span class="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
        GUARDANDO...
      </span>
      <span *ngIf="settings.saved()" class="flex items-center gap-2 text-emerald">
        <span class="material-symbols-outlined text-lg">check_circle</span>
        ¡GUARDADO!
      </span>
    </button>
  </header>

  <!-- Info Banner -->
  <div class="border border-secondary/30 bg-secondary/[0.03] p-6 flex items-start gap-4">
    <span class="material-symbols-outlined text-secondary text-2xl shrink-0 mt-0.5">info</span>
    <div class="flex flex-col gap-1">
      <p class="font-anton text-white text-lg uppercase tracking-tight">¿Cómo agregar una foto?</p>
      <p class="font-hanken text-stark-gray opacity-60 text-sm leading-relaxed">
        Pega la URL de cualquier imagen pública. Puedes usar fotos de <strong class="text-white">Instagram</strong>, 
        <strong class="text-white">Google Drive</strong> (con "Cualquiera con el enlace"), 
        <strong class="text-white">Cloudinary</strong> (gratis), <strong class="text-white">ImgBB</strong> (gratis) o cualquier enlace directo que termine en .jpg, .png o .webp.
      </p>
    </div>
  </div>

  <!-- Photo Cards Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">

    <!-- Hero Main Photo -->
    <div class="border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-6 relative overflow-hidden lg:col-span-2">
      <div class="absolute -right-6 -bottom-6 font-anton text-secondary opacity-5 text-[8rem] select-none">HERO</div>
      <div class="relative z-10 flex flex-col gap-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="h-px w-10 bg-secondary"></div>
            <h2 class="font-anton text-3xl text-white uppercase tracking-tighter">FOTO PRINCIPAL — HERO</h2>
          </div>
          <span class="font-label-caps text-[9px] text-secondary border border-secondary/30 px-3 py-1">PORTADA DEL SITIO</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div class="border border-outline-variant overflow-hidden aspect-video bg-surface-container-lowest flex items-center justify-center">
            <img *ngIf="form.hero_main" [src]="form.hero_main" class="w-full h-full object-cover" alt="Hero preview"
                 (error)="onImageError($event)">
            <span *ngIf="!form.hero_main" class="material-symbols-outlined text-stark-gray opacity-20 text-6xl">image</span>
          </div>
          <div class="flex flex-col gap-4">
            <label class="font-label-caps text-[10px] text-secondary tracking-widest uppercase">URL DE LA IMAGEN</label>
            <input type="url" [(ngModel)]="form.hero_main"
                   placeholder="https://ejemplo.com/foto.jpg"
                   class="w-full bg-background border border-outline-variant focus:border-secondary p-4 font-mono text-sm text-white outline-none transition-colors">
            <p class="font-label-caps text-[8px] text-stark-gray opacity-30 tracking-widest">RECOMENDADO: MÍNIMO 800x600px · FORMATO VERTICAL U HORIZONTAL</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Gallery Photos -->
    <ng-container *ngFor="let key of galleryKeys; let i = index">
      <div class="border border-outline-variant bg-surface-container-low p-8 flex flex-col gap-6 relative overflow-hidden">
        <div class="absolute -right-6 -bottom-6 font-anton text-stark-gray opacity-5 text-[8rem] select-none">0{{i+1}}</div>
        <div class="relative z-10 flex flex-col gap-6">
          <div class="flex items-center gap-4">
            <div class="h-px w-10 bg-secondary"></div>
            <h3 class="font-anton text-2xl text-white uppercase tracking-tighter">GALERÍA — FOTO {{i+1}}</h3>
          </div>
          <div class="border border-outline-variant overflow-hidden aspect-square bg-surface-container-lowest flex items-center justify-center">
            <img *ngIf="getPhotoValue(key)" [src]="getPhotoValue(key)" class="w-full h-full object-cover" [alt]="'Galería ' + (i+1)"
                 (error)="onImageError($event)">
            <span *ngIf="!getPhotoValue(key)" class="material-symbols-outlined text-stark-gray opacity-20 text-6xl">image</span>
          </div>
          <div class="flex flex-col gap-3">
            <label class="font-label-caps text-[10px] text-secondary tracking-widest uppercase">URL DE LA IMAGEN</label>
            <input type="url" [ngModel]="getPhotoValue(key)" (ngModelChange)="setPhotoValue(key, $event)"
                   placeholder="https://ejemplo.com/foto.jpg"
                   class="w-full bg-background border border-outline-variant focus:border-secondary p-4 font-mono text-sm text-white outline-none transition-colors">
          </div>
        </div>
      </div>
    </ng-container>

  </div>

  <!-- Bottom Save -->
  <div class="flex justify-end pt-4 border-t border-outline-variant">
    <button (click)="saveAll()" [disabled]="settings.saving()"
            class="px-12 py-5 border-2 border-secondary text-secondary font-anton text-lg tracking-widest uppercase hover:bg-secondary hover:text-black transition-all disabled:opacity-40">
      {{ settings.saving() ? 'GUARDANDO...' : 'GUARDAR TODOS LOS CAMBIOS' }}
    </button>
  </div>
</div>
  `
})
export class DashboardAppearance implements OnInit {
  settings = inject(SiteSettingsService);

  form: { hero_main: string; gallery_1: string; gallery_2: string; gallery_3: string } = {
    hero_main: '',
    gallery_1: '',
    gallery_2: '',
    gallery_3: '',
  };

  galleryKeys: ('gallery_1' | 'gallery_2' | 'gallery_3')[] = ['gallery_1', 'gallery_2', 'gallery_3'];

  ngOnInit() {
    this.settings.loadPhotos().then(() => {
      const p = this.settings.sitePhotos();
      this.form = { ...p };
    });
  }

  getPhotoValue(key: 'gallery_1' | 'gallery_2' | 'gallery_3'): string {
    return this.form[key];
  }

  setPhotoValue(key: 'gallery_1' | 'gallery_2' | 'gallery_3', value: string) {
    this.form[key] = value;
  }

  onImageError(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  async saveAll() {
    await this.settings.savePhotos(this.form as SitePhotos);
  }
}
