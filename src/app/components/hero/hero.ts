import { Component, HostListener } from '@angular/core';
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
  logoScale = 1;
  logoOpacity = 1;
  bgScale = 1.1;
  bgTranslate = 0;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollMax = 800; // Longer scroll for finer control
    const percentage = Math.min(scrollPos / scrollMax, 1);

    // Quadratic curve for smoother start: percentage^2
    const easeIn = percentage * percentage;
    
    // Finer scaling: starts at 1, goes to 3.5 smoothly
    this.logoScale = 1 + easeIn * 2.5; 
    
    // Opacity fades out later in the scroll
    this.logoOpacity = 1 - Math.pow(percentage, 2);
    
    // Smoother background transition
    this.bgScale = 1.1 + percentage * 0.15;
    this.bgTranslate = percentage * 60;
  }
}
