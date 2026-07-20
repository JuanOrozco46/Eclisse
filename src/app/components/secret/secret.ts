import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-secret',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './secret.html',
  styles: ``,
})
export class SecretComponent {
    constructor() {
        console.log('SecretComponent instantiated');
    }
}
