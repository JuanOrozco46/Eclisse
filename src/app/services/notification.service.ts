import { Injectable, inject, effect } from '@angular/core';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private data = inject(DataService);
  private audio: HTMLAudioElement;
  private isPlaying = false;

  constructor() {
    // Elegant bell sound (base64) - A short premium notification sound
    this.audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    this.audio.loop = true;

    // Effect to monitor pending orders
    effect(() => {
      const pendingCount = this.data.orders().filter(o => o.status === 'PENDING').length;
      
      if (pendingCount > 0 && !this.isPlaying) {
        this.startAlarm();
      } else if (pendingCount === 0 && this.isPlaying) {
        this.stopAlarm();
      }
    });
  }

  private startAlarm() {
    this.audio.play().then(() => {
      this.isPlaying = true;
    }).catch(err => {
      // Browser might block audio until first interaction
      console.warn('Audio play blocked. Waiting for user interaction.', err);
    });
  }

  private stopAlarm() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
  }

  // Fallback for browsers that block auto-play
  initAudio() {
    this.audio.play().then(() => {
      this.audio.pause();
      this.audio.currentTime = 0;
    });
  }
}
