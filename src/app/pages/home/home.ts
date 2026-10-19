import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeroComponent } from '../../components/hero/hero';
import { DataService, MenuItem } from '../../services/data.service';
import { SiteSettingsService } from '../../services/site-settings.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, HeroComponent, RouterModule],
  templateUrl: './home.html',
})
export class HomeComponent implements OnInit {
  data = inject(DataService);
  siteSettings = inject(SiteSettingsService);

  photos = this.siteSettings.sitePhotos;
  selectedCategory = signal<string>('TODAS');

  // Datos opcionales para agilizar el envío del pedido a WhatsApp
  customerAddress = '';
  customerPayment: 'Efectivo' | 'Nequi' = 'Efectivo';
  customerNotes = '';

  waLink = computed(() => {
    const phone = (this.data.businessConfig().whatsappOrderPhone || '573004057195').replace(/\D/g, '');
    return `https://wa.me/${phone}`;
  });

  availableItems = computed(() => {
    return this.data.menuItems().filter((i: MenuItem) => i.available);
  });

  categories = computed(() => {
    const cats = new Set<string>();
    this.availableItems().forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return ['TODAS', ...Array.from(cats)];
  });

  bestSeller = computed(() => {
    const items = this.availableItems();
    if (items.length === 0) return null;
    const preferredId = this.photos().best_seller_id;
    if (preferredId) {
      const found = items.find(i => i.id === preferredId);
      if (found) return found;
    }
    return items[0];
  });

  filteredMenuItems = computed(() => {
    const cat = this.selectedCategory();
    const items = this.availableItems();
    if (cat === 'TODAS') return items;
    return items.filter(i => i.category === cat);
  });

  ngOnInit() {
    this.siteSettings.loadPhotos();
  }

  addToCart(item: MenuItem) {
    this.data.addToPublicCart(item);
  }

  updateQty(itemId: string, delta: number) {
    this.data.updatePublicCartQuantity(itemId, delta);
  }

  getItemQty(itemId: string): number {
    return this.data.getCartItemQty(itemId);
  }

  openCart() {
    this.data.showPublicCart.set(true);
  }

  closeCart() {
    this.data.showPublicCart.set(false);
  }

  scrollToCarta() {
    const el = document.getElementById('carta');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  sendOrderToWhatsApp() {
    if (this.data.cartCount() === 0) return;
    const url = this.data.generateWhatsAppLink({
      address: this.customerAddress,
      paymentMethod: this.customerPayment,
      notes: this.customerNotes,
    });
    window.open(url, '_blank');
  }
}
