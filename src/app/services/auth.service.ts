import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { User, Session } from '@supabase/supabase-js';

export type UserRole = 'ADMIN' | 'WAITER' | 'KITCHEN';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private router = inject(Router);
  private supabase = inject(SupabaseService).client;
  
  // Signals para UI reactiva
  currentUser = signal<UserProfile | null>(null);
  isAuthenticated = signal<boolean>(false);
  session = signal<Session | null>(null);

  constructor() {
    this.initAuth();
  }

  private async initAuth() {
    // Escuchar cambios de estado de autenticación en Supabase Auth
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      this.session.set(session);
      if (session?.user) {
        await this.loadUserProfile(session.user);
      } else {
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
      }
    });

    // Obtener sesión inicial
    const { data: { session } } = await this.supabase.auth.getSession();
    this.session.set(session);
    if (session?.user) {
      await this.loadUserProfile(session.user);
    }
  }

  private async loadUserProfile(user: User): Promise<{ blocked?: boolean }> {
    try {
      const { data } = await this.supabase
        .from('profiles')
        .select('id, name, role, status')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        if (data.status === 'OFFLINE') {
          await this.supabase.auth.signOut();
          this.currentUser.set(null);
          this.isAuthenticated.set(false);
          this.session.set(null);
          return { blocked: true };
        }
        const profile: UserProfile = {
          id: data.id,
          name: data.name || user.email?.split('@')[0] || 'Usuario',
          role: (data.role as UserRole) || 'WAITER'
        };
        this.currentUser.set(profile);
        this.isAuthenticated.set(true);
      } else {
        // Si aún no se creó el perfil, usar fallback temporal no administrativo
        this.currentUser.set({
          id: user.id,
          name: user.email?.split('@')[0] || 'Usuario',
          role: 'WAITER'
        });
        this.isAuthenticated.set(true);
      }
      return {};
    } catch (err) {
      console.error('Error al cargar perfil de usuario:', err);
      return {};
    }
  }

  async login(email: string, pass: string): Promise<{ error?: string }> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password: pass
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        const profileCheck = await this.loadUserProfile(data.user);
        if (profileCheck.blocked) {
          return { error: 'Cuenta desactivada (OFFLINE). Contacta al administrador.' };
        }
        const role = this.currentUser()?.role || 'WAITER';

        let target = '/dashboard/resumen';
        if (role === 'WAITER') target = '/dashboard/pos';
        if (role === 'KITCHEN') target = '/dashboard/cocina';

        this.router.navigate([target]);
      }
      return {};
    } catch (err: any) {
      return { error: err.message || 'Error en autenticación' };
    }
  }

  async logout() {
    await this.supabase.auth.signOut();
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.session.set(null);
    this.router.navigate(['/login']);
  }

  hasRole(role: UserRole): boolean {
    return this.currentUser()?.role === role;
  }
}

