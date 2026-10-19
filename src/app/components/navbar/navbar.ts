import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';
import { SiteSettingsService } from '../../services/site-settings.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './navbar.html',
  styles: ``,
})
export class NavbarComponent {
  data = inject(DataService);
  siteSettings = inject(SiteSettingsService);
  photos = this.siteSettings.sitePhotos;

  isMenuOpen = false;
  showLogo = false;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    this.showLogo = scrollPos > 200;
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  scrollToSection(sectionId: string, event?: Event) {
    if (event) event.preventDefault();
    this.isMenuOpen = false;
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  handleCartOrOrderClick() {
    this.isMenuOpen = false;
    if (this.data.cartCount() > 0) {
      this.data.showPublicCart.set(true);
    } else {
      this.scrollToSection('carta');
    }
  }
}
