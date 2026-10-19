import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'menu', redirectTo: '', pathMatch: 'full' },
  { path: 'el-secreto', redirectTo: '', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./components/admin-layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'resumen', pathMatch: 'full' },
      {
        path: 'resumen',
        loadComponent: () => import('./pages/dashboard-home/dashboard-home').then(m => m.DashboardHome),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'ventas',
        loadComponent: () => import('./pages/dashboard-sales/dashboard-sales').then(m => m.DashboardSales),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'inventario',
        loadComponent: () => import('./pages/dashboard-inventory/dashboard-inventory').then(m => m.DashboardInventory),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'evolution',
        loadComponent: () => import('./pages/dashboard-evolution/dashboard-evolution').then(m => m.DashboardEvolution),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'pos',
        loadComponent: () => import('./pages/dashboard-pos/dashboard-pos').then(m => m.DashboardPos),
        canActivate: [roleGuard(['ADMIN', 'WAITER'])],
      },
      {
        path: 'personal',
        loadComponent: () => import('./pages/dashboard-users').then(m => m.DashboardUsers),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'cocina',
        loadComponent: () => import('./pages/dashboard-kitchen').then(m => m.DashboardKitchen),
        canActivate: [roleGuard(['ADMIN', 'KITCHEN'])],
      },
      {
        path: 'carta',
        loadComponent: () => import('./pages/dashboard-menu').then(m => m.DashboardMenu),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'apariencia',
        loadComponent: () => import('./pages/dashboard-appearance').then(m => m.DashboardAppearance),
        canActivate: [roleGuard(['ADMIN'])],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];


