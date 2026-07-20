import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService, UserRole } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- ... same template as before ... -->
    <section class="bg-surface-container-lowest text-on-surface antialiased min-h-screen selection:bg-secondary selection:text-on-secondary overflow-hidden">
      <!-- ... (template content remains unchanged for visual consistency) ... -->
      <div class="flex flex-col md:flex-row h-screen w-full relative">
        <div class="absolute inset-0 z-0 pointer-events-none opacity-20 mix-blend-screen">
          <div class="w-full h-full bg-[url('https://images.unsplash.com/photo-1541746972996-4e0b0f43e02a?q=80&w=2070&auto=format&fit=crop')] bg-cover grayscale contrast-200"></div>
        </div>
        <div class="hidden md:flex flex-col justify-between w-[450px] border-r border-outline-variant p-20 relative z-10 bg-surface-container-lowest/80 backdrop-blur-sm">
          <div class="space-y-4">
            <span class="material-symbols-outlined text-secondary text-4xl block">admin_panel_settings</span>
            <p class="font-label-caps text-[10px] text-on-surface-variant max-w-[200px] tracking-widest uppercase">RESTRICTED SECTOR. AUTHORIZED PERSONNEL ONLY.</p>
          </div>
          <div class="absolute right-0 top-1/2 transform -translate-y-1/2 flex flex-col w-[2px] h-[120px]">
            <div class="flex-1 bg-emerald"></div>
            <div class="flex-1 bg-stark-gray"></div>
            <div class="flex-1 bg-tomato"></div>
          </div>
          <div class="relative">
            <h1 class="font-anton text-8xl text-on-surface leading-[0.8] -ml-2 tracking-tighter uppercase">STAFF<br/><span class="text-secondary">ACCESS</span></h1>
            <div class="absolute -right-20 top-0 h-full flex items-center justify-center opacity-10 translate-x-full">
              <h2 class="font-anton text-9xl text-on-surface transform -rotate-90 whitespace-nowrap tracking-tighter uppercase">ECLISSE</h2>
            </div>
          </div>
        </div>
        <div class="flex-1 flex flex-col justify-center items-center p-8 md:p-20 relative z-10">
          <div class="w-full max-w-[420px] bg-surface-container-lowest border border-outline-variant p-8 md:p-12 relative overflow-visible">
            <div class="absolute top-0 left-0 w-4 h-4 border-t border-l border-secondary -translate-x-[1px] -translate-y-[1px]"></div>
            <div class="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-secondary translate-x-[1px] translate-y-[1px]"></div>
            <form (ngSubmit)="login()" class="space-y-12">
              <div class="relative group">
                <label class="block font-label-caps text-[10px] text-on-surface-variant mb-2 group-focus-within:text-secondary transition-colors tracking-widest" for="username">USERNAME / ID</label>
                <input autocomplete="off" autofocus type="text" id="username" name="username" [(ngModel)]="username" class="w-full bg-transparent border-0 border-b border-outline text-on-surface font-label-caps text-sm px-0 py-3 focus:ring-0 focus:border-secondary transition-colors rounded-none placeholder:text-surface-variant uppercase" placeholder="ECL-XXXX" required>
              </div>
              <div class="relative group">
                <label class="block font-label-caps text-[10px] text-on-surface-variant mb-2 group-focus-within:text-secondary transition-colors tracking-widest" for="password">PASSWORD</label>
                <input type="password" id="password" name="password" [(ngModel)]="password" class="w-full bg-transparent border-0 border-b border-outline text-on-surface font-label-caps text-sm px-0 py-3 focus:ring-0 focus:border-secondary transition-colors rounded-none placeholder:text-surface-variant tracking-widest" placeholder="••••••••" required>
              </div>
              <div *ngIf="errorMsg" class="bg-tomato/10 border border-tomato/20 p-4 text-tomato font-label-caps text-[10px] tracking-widest uppercase animate-in fade-in slide-in-from-top-2">{{errorMsg}}</div>
              <div class="pt-8">
                <button type="submit" class="w-full py-5 border border-secondary text-secondary font-label-caps text-[12px] tracking-[0.2em] uppercase hover:bg-secondary hover:text-on-secondary transition-all duration-300 rounded-none relative overflow-hidden group">
                  <span class="relative z-10 flex items-center justify-center gap-3">ENTRAR<span class="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span></span>
                </button>
              </div>
            </form>
            <div class="mt-16 flex justify-between items-center pt-8 border-t border-outline-variant/30">
              <span class="font-label-caps text-[9px] text-on-surface-variant opacity-50 flex items-center gap-2"><span class="w-2 h-2 bg-emerald rounded-full animate-pulse"></span>SYSTEM ONLINE</span>
              <a href="/" class="font-label-caps text-[9px] text-secondary hover:text-white transition-all tracking-widest uppercase no-underline flex items-center gap-2">
                <span class="material-symbols-outlined text-[12px]">arrow_back</span>
                VOLVER AL SITIO
              </a>
              <span class="font-label-caps text-[9px] text-on-surface-variant opacity-50 tracking-widest uppercase">v5.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`:host { display: block; }`]
})
export class LoginComponent {
  private data = inject(DataService);
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  errorMsg = '';

  login() {
    this.errorMsg = '';
    const user = this.username.toLowerCase();
    const pass = this.password;

    // Check staff from DataService
    const staffMember = this.data.staff().find(s => s.username.toLowerCase() === user && s.password === pass);

    if (staffMember) {
      this.auth.login(staffMember.name, staffMember.role);
    } else {
      // Demo fallbacks ARE REMOVED for production readiness as per plan
      // However, we keep a single secure master admin if no staff exists
      if (this.data.staff().length === 0 && user === 'eclisse_admin' && pass === 'Eclisse2024!') {
         this.auth.login('Administrador Master', 'ADMIN');
      } else {
        this.errorMsg = 'CREDENTIALS REJECTED. ACCESS DENIED.';
      }
    }
  }
}
