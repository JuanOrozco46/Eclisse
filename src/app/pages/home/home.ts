import { Component, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeroComponent } from '../../components/hero/hero';
import { DataService, MenuItem } from '../../services/data.service';
import { SiteSettingsService } from '../../services/site-settings.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, HeroComponent, RouterModule],
  templateUrl: './home.html',
})
export class HomeComponent implements OnInit {
  data = inject(DataService);
  siteSettings = inject(SiteSettingsService);

  photos = this.siteSettings.sitePhotos;

  // Show only 5 featured items on home page
  featuredItems = computed(() => {
    return this.data.menuItems()
      .filter((i: MenuItem) => i.available)
      .slice(0, 5);
  });

  ngOnInit() {
    this.siteSettings.loadPhotos();
  }

  addToCart(item: MenuItem) {
    this.data.addToPublicCart(item);
  }
}
