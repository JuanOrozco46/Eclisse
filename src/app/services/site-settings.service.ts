import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

export interface SitePhotos {
  hero_main: string;
  gallery_1: string;
  gallery_2: string;
  gallery_3: string;
  // Cintillo promocional
  promo_enabled: boolean;
  promo_text: string;
  // Textos Hero
  hero_tag: string;
  hero_title_1: string;
  hero_title_2: string;
  hero_title_accent: string;
  hero_subtitle: string;
  hero_badge: string;
  stat_1_val: string;
  stat_1_label: string;
  stat_2_val: string;
  stat_2_label: string;
  stat_3_val: string;
  stat_3_label: string;
  // Carta & Conversión
  best_seller_id: string;
  carta_subtitle: string;
  // Galería / Ritual & Contacto
  show_gallery: boolean;
  gallery_quote_1: string;
  gallery_quote_2: string;
  gallery_quote_3: string;
  instagram_handle: string;
  instagram_url: string;
  location_city: string;
  location_address: string;
}

export const DEFAULT_SITE_SETTINGS: SitePhotos = {
  hero_main: '/assets/cocina_oculta.png',
  gallery_1: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=2070&auto=format&fit=crop',
  gallery_2: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?q=80&w=2050&auto=format&fit=crop',
  gallery_3: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=2070&auto=format&fit=crop',
  promo_enabled: true,
  promo_text: '🔥 DOMICILIOS EN ARMENIA · HORARIO 5:00 PM A 11:00 PM · PIDE DIRECTO AQUÍ SIN INTERMEDIARIOS',
  hero_tag: 'COCINA OCULTA · ARMENIA, QUINDÍO',
  hero_title_1: 'PIZZA',
  hero_title_2: 'ARTESANAL',
  hero_title_accent: 'A FUEGO',
  hero_subtitle: 'Horno portátil de 12". Masa fermentada 48h. Elige tus pizzas en la carta de abajo y haz tu pedido directo en segundos.',
  hero_badge: 'EST. 2024',
  stat_1_val: '12"',
  stat_1_label: 'HORNO OONI',
  stat_2_val: '48H',
  stat_2_label: 'FERMENTACIÓN',
  stat_3_val: '$25K',
  stat_3_label: 'PRECIO ÚNICO',
  best_seller_id: '6',
  carta_subtitle: 'TAMAÑO MEDIANO (6 PORCIONES) · MASA MADURADA 48H · AGREGA A TU PEDIDO',
  show_gallery: true,
  gallery_quote_1: 'La paciencia es el ingrediente principal. 48 horas de espera para 90 segundos de fuego.',
  gallery_quote_2: 'Obsesión por el detalle. Solo ingredientes que nos emocionen.',
  gallery_quote_3: 'Miel picante artesanal. El equilibrio perfecto entre el dulce y la llama.',
  instagram_handle: '@ECLISSE.PIZZA',
  instagram_url: 'https://instagram.com/eclisse.pizza',
  location_city: 'ARMENIA, QUINDÍO',
  location_address: 'Calle 2N 18-144 · Domicilios rápidos en toda la ciudad y recogida en base.',
};

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private sb = inject(SupabaseService);
  private toast = inject(ToastService);

  sitePhotos = signal<SitePhotos>({ ...DEFAULT_SITE_SETTINGS });
  saving = signal<boolean>(false);
  saved = signal<boolean>(false);

  async loadPhotos() {
    try {
      const { data } = await this.sb.client
        .from('rappi_config')
        .select('*')
        .eq('id', 'site_photos')
        .maybeSingle();

      if (data && data.api_key) {
        const parsed = JSON.parse(data.api_key) as Partial<SitePhotos>;
        this.sitePhotos.set({ ...DEFAULT_SITE_SETTINGS, ...parsed });
      }
    } catch (e) {
      console.warn('Could not load site settings from Supabase, using defaults.', e);
    }
  }

  async savePhotos(photos: SitePhotos) {
    this.saving.set(true);
    this.saved.set(false);
    const merged: SitePhotos = { ...DEFAULT_SITE_SETTINGS, ...photos };
    this.sitePhotos.set(merged);
    try {
      const { error } = await this.sb.client.from('rappi_config').upsert({
        id: 'site_photos',
        connected: true,
        api_key: JSON.stringify(merged),
      });
      if (error) {
        this.toast.showError('Error al guardar contenido del sitio: ' + error.message);
        return;
      }
      this.saved.set(true);
      this.toast.showSuccess('Contenido del sitio actualizado correctamente');
      setTimeout(() => this.saved.set(false), 3000);
    } catch (e) {
      console.error('Error saving site photos:', e);
      this.toast.showError('No se pudo guardar la configuración del sitio');
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Lee un archivo de imagen local (PC o celular), lo redimensiona y comprime en WebP/JPEG
   * para que cargue rápido en la web pública y se guarde sin fricción en Supabase.
   */
  compressImageFile(file: File, maxWidth = 1100, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('El archivo seleccionado no es una imagen válida.'));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          let dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }
}
