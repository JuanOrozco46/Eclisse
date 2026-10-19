import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, UserRole } from '../services/auth.service';

export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    const currentRole = authService.currentUser()?.role;

    // ADMIN siempre tiene acceso a todas las rutas del dashboard
    if (currentRole === 'ADMIN' || (currentRole && allowedRoles.includes(currentRole))) {
      return true;
    }

    // Redirigir a su vista predeterminada según su rol si no tiene permiso para la ruta solicitada
    if (currentRole === 'WAITER') {
      return router.createUrlTree(['/dashboard/pos']);
    }
    if (currentRole === 'KITCHEN') {
      return router.createUrlTree(['/dashboard/cocina']);
    }

    return router.createUrlTree(['/login']);
  };
};
