import { Component, inject, computed, HostListener, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styles: ``,
})
export class AdminLayout implements OnInit {
  private auth = inject(AuthService);
  private notify = inject(NotificationService);
  private data = inject(DataService);
  
  userRole = computed(() => this.auth.currentUser()?.role || 'ADMIN');
  userName = computed(() => this.auth.currentUser()?.name || 'Admin User');
  pendingCount = computed(() => this.data.orders().filter(o => o.status === 'PENDING').length);

  ngOnInit() {
    // Carga datos admin solo cuando el usuario autenticado entra al dashboard
    this.data.loadAdminData();
  }

  hasRole(role: string): boolean {
    if (this.userRole() === 'ADMIN') return true; 
    return this.userRole() === role;
  }

  @HostListener('document:click', ['$event'])
  unlockAudio(_event: Event) {
    this.notify.initAudio();
  }

  logout() {
    this.auth.logout();
  }
}
