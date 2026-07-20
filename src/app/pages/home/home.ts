import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeroComponent } from '../../components/hero/hero';
import { DataService, MenuItem } from '../../services/data.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, HeroComponent, RouterModule],
  templateUrl: './home.html',
})
export class HomeComponent {
  data = inject(DataService);

  // Show only 5 featured items on home page
  featuredItems = computed(() => {
    return this.data.menuItems()
      .filter((i: MenuItem) => i.available)
      .slice(0, 5);
  });

  addToCart(item: MenuItem) {
    this.data.addToPublicCart(item);
  }
}
