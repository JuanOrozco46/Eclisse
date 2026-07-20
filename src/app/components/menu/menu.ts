import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService, MenuItem } from '../../services/data.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menu.html',
  styles: [`
    .cart-drawer { transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
  `],
})
export class MenuComponent {
  data = inject(DataService);
  showCart = signal(false);

  availableItems = computed(() => {
    return this.data.menuItems().filter((i: MenuItem) => i.available);
  });

  bestSeller = computed(() => {
    const items = this.availableItems();
    return items.length > 0 ? items[0] : null;
  });

  otherItems = computed(() => {
    const items = this.availableItems();
    return items.length > 1 ? items.slice(1) : [];
  });

  addToCart(item: MenuItem) {
    this.data.addToPublicCart(item);
    this.showCart.set(true);
  }

  updateQty(itemId: string, delta: number) {
    this.data.updatePublicCartQuantity(itemId, delta);
  }

  sendOrder() {
    window.open(this.data.generateWhatsAppLink(), '_blank');
  }
}
