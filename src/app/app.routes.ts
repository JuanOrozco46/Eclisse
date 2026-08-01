import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { MenuComponent } from './components/menu/menu';
import { SecretComponent } from './components/secret/secret';
import { EventsComponent } from './pages/events/events';
import { LoginComponent } from './pages/login/login';
import { AdminLayout } from './components/admin-layout/admin-layout';
import { DashboardHome } from './pages/dashboard-home/dashboard-home';
import { DashboardSales } from './pages/dashboard-sales/dashboard-sales';
import { DashboardInventory } from './pages/dashboard-inventory/dashboard-inventory';
import { DashboardEvolution } from './pages/dashboard-evolution/dashboard-evolution';
import { DashboardPos } from './pages/dashboard-pos/dashboard-pos';

import { DashboardUsers } from './pages/dashboard-users';
import { DashboardKitchen } from './pages/dashboard-kitchen';
import { DashboardMenu } from './pages/dashboard-menu';
import { DashboardAppearance } from './pages/dashboard-appearance';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [

  { path: '', component: HomeComponent },
  { path: 'menu', component: MenuComponent },
  { path: 'el-secreto', component: SecretComponent },
  { path: 'eventos', component: EventsComponent },
  { path: 'login', component: LoginComponent },
  { 
    path: 'dashboard', 
    component: AdminLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'resumen', pathMatch: 'full' },
      { path: 'resumen', component: DashboardHome },
      { path: 'ventas', component: DashboardSales },
      { path: 'inventario', component: DashboardInventory },
      { path: 'evolution', component: DashboardEvolution },
      { path: 'pos', component: DashboardPos },
      { path: 'personal', component: DashboardUsers },
      { path: 'cocina', component: DashboardKitchen },
      { path: 'carta', component: DashboardMenu },
      { path: 'apariencia', component: DashboardAppearance },
    ]

  },
  { path: '**', redirectTo: '' }
];

