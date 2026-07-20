import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar';
import { FooterComponent } from './components/footer/footer';
import { FloatingWA } from './components/floating-wa/floating-wa';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, FloatingWA, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('Eclisse Pizza');
  private router = inject(Router);

  isSpecialRoute() {
    const url = this.router.url || '';
    return url.startsWith('/dashboard') || url === '/login';
  }

}
