import { Component, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hero.html',
  styles: ``,
})
export class HeroComponent {
  @Input() heroImage: string = '/assets/cocina_oculta.png';

  logoScale = 1;
  logoOpacity = 1;
  bgScale = 1.1;
  bgTranslate = 0;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollMax = 800;
    const percentage = Math.min(scrollPos / scrollMax, 1);
    const easeIn = percentage * percentage;
    this.logoScale = 1 + easeIn * 2.5;
    this.logoOpacity = 1 - Math.pow(percentage, 2);
    this.bgScale = 1.1 + percentage * 0.15;
    this.bgTranslate = percentage * 60;
  }
}
