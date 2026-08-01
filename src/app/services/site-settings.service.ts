import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface SitePhotos {
  hero_main: string;
  gallery_1: string;
  gallery_2: string;
  gallery_3: string;
}

const DEFAULTS: SitePhotos = {
  hero_main: '/assets/cocina_oculta.png',
  gallery_1: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=2070&auto=format&fit=crop',
  gallery_2: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?q=80&w=2050&auto=format&fit=crop',
  gallery_3: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=2070&auto=format&fit=crop',
};

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private sb = inject(SupabaseService);

  sitePhotos = signal<SitePhotos>({ ...DEFAULTS });
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
        const parsed = JSON.parse(data.api_key) as SitePhotos;
        this.sitePhotos.set({ ...DEFAULTS, ...parsed });
      }
    } catch (e) {
      console.warn('Could not load site photos from Supabase, using defaults.', e);
    }
  }

  async savePhotos(photos: SitePhotos) {
    this.saving.set(true);
    this.saved.set(false);
    this.sitePhotos.set(photos);
    try {
      await this.sb.client.from('rappi_config').upsert({
        id: 'site_photos',
        connected: true,
        api_key: JSON.stringify(photos),
      });
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } catch (e) {
      console.error('Error saving site photos:', e);
    } finally {
      this.saving.set(false);
    }
  }
}
