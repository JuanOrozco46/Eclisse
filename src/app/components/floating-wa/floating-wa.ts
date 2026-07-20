import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-floating-wa',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-10 right-10 z-[100] flex flex-col items-end gap-4 pointer-events-none">
      <!-- Tooltip / Label -->
      <div 
        class="bg-white px-6 py-3 rounded-full shadow-brutal translate-y-2 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-auto cursor-pointer"
        [class.active-label]="showLabel"
      >
        <p class="font-anton text-xs text-black tracking-widest uppercase mb-1">¡Hola! Soy Luisa</p>
        <p class="font-hanken text-[10px] text-stark-gray opacity-60">¿En qué puedo ayudarte?</p>
      </div>

      <!-- Main Button -->
      <a 
        href="https://wa.me/573004057195" 
        target="_blank"
        (mouseenter)="showLabel = true"
        (mouseleave)="showLabel = false"
        class="w-16 h-16 bg-emerald rounded-full shadow-brutal-gold flex items-center justify-center pointer-events-auto transition-all hover:scale-110 active:scale-95 group relative no-underline"
      >
        <!-- Pulse effect -->
        <span class="absolute inset-0 bg-emerald rounded-full animate-ping opacity-20"></span>
        
        <!-- Icon -->
        <span class="text-3xl relative z-10">💬</span>
        
        <!-- Notification Dot -->
        <span class="absolute -top-1 -right-1 w-5 h-5 bg-tomato border-2 border-white rounded-full flex items-center justify-center font-anton text-[9px] text-white">1</span>
      </a>
    </div>
  `,
  styles: [`
    .shadow-brutal {
      box-shadow: 6px 6px 0px rgba(0,0,0,1);
    }
    .shadow-brutal-gold {
      box-shadow: 6px 6px 0px #C5A059;
    }
    .active-label {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `]
})
export class FloatingWA {
  showLabel = false;
}
