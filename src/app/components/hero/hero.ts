import { Component, HostListener, Input, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SiteSettingsService } from '../../services/site-settings.service';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hero.html',
  styles: ``,
})
export class HeroComponent {
  @Input() heroImage: string = '/assets/cocina_oculta.png';

  siteSettings = inject(SiteSettingsService);
  data = inject(DataService);

  settings = this.siteSettings.sitePhotos;
  waLink = computed(() => {
    const phone = (this.data.businessConfig().whatsappOrderPhone || '573004057195').replace(/\D/g, '');
    return `https://wa.me/${phone}`;
  });

  logoScale = 1;
  logoOpacity = 1;
  bgScale = 1.1;
  bgTranslate = 0;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollMax = 800;
    const percentage = Math.min(scrollPos / scrollMax, 1);
    const easeIn = percentage * percentage;
    this.logoScale = 1 + easeIn * 2.5;
    this.logoOpacity = 1 - Math.pow(percentage, 2);
    this.bgScale = 1.1 + percentage * 0.15;
    this.bgTranslate = percentage * 60;
  }

  scrollToCarta(event: Event) {
    event.preventDefault();
    const el = document.getElementById('carta');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
