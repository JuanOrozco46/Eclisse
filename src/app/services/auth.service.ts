import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

export type UserRole = 'ADMIN' | 'WAITER' | 'KITCHEN';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private router = inject(Router);
  
  // Signals for responsive UI
  currentUser = signal<{ name: string; role: UserRole } | null>(null);
  isAuthenticated = signal<boolean>(false);

  constructor() {
    this.loadSession();
  }

  private loadSession() {
    const role = localStorage.getItem('user_role') as UserRole;
    const name = localStorage.getItem('user_name');
    
    if (role && name) {
      this.currentUser.set({ name, role });
      this.isAuthenticated.set(true);
    }
  }

  login(name: string, role: UserRole) {
    localStorage.setItem('user_role', role);
    localStorage.setItem('user_name', name);
    this.currentUser.set({ name, role });
    this.isAuthenticated.set(true);

    let target = '/dashboard/resumen';
    if (role === 'WAITER') target = '/dashboard/pos';
    if (role === 'KITCHEN') target = '/dashboard/cocina';

    this.router.navigate([target]);
  }

  logout() {
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_name');
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.router.navigate(['/login']);
  }

  hasRole(role: UserRole): boolean {
    return this.currentUser()?.role === role;
  }
}
