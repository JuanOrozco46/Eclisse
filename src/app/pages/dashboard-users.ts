import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, StaffMember } from '../services/data.service';

@Component({
  selector: 'app-dashboard-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative flex flex-col gap-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <!-- Header -->
      <header class="flex flex-col md:flex-row justify-between items-start md:items-end border-b-2 border-outline-variant pb-12 gap-8 relative z-10">
        <div>
          <div class="flex items-center gap-4 mb-4">
            <span class="font-anton text-secondary text-2xl">008</span>
            <div class="h-px w-20 bg-outline-variant"></div>
          </div>
          <h1 class="font-anton text-7xl md:text-9xl text-white uppercase leading-none tracking-tighter">GESTIÓN DE<br/>PERSONAL</h1>
          <p class="font-label-caps text-[12px] text-secondary mt-6 tracking-brutal uppercase">CENTRO DE AUTORIZACIONES</p>
        </div>
        <div class="flex flex-col items-end gap-4">
          <div class="flex gap-8">
            <div class="flex flex-col items-center border border-outline-variant px-6 py-3">
              <span class="font-label-caps text-[9px] text-stark-gray opacity-40 uppercase">TOTAL</span>
              <span class="font-anton text-4xl text-white">{{data.staff().length}}</span>
            </div>
            <div class="flex flex-col items-center border border-emerald/30 px-6 py-3 bg-emerald/5">
              <span class="font-label-caps text-[9px] text-emerald uppercase">ACTIVOS</span>
              <span class="font-anton text-4xl text-emerald">{{activeCount()}}</span>
            </div>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-16 relative z-10">
        <!-- Add Staff Form -->
        <div class="lg:col-span-4 flex flex-col gap-10">
          <div class="border border-outline-variant bg-surface-container-low p-10 relative overflow-hidden group">
            <div class="absolute top-0 right-0 p-4 font-anton text-stark-gray opacity-5 text-4xl">NEW_ID</div>
            <h2 class="font-anton text-4xl text-white uppercase mb-10 tracking-tighter">REGISTRAR STAFF</h2>
            
            <form (ngSubmit)="addMember()" class="space-y-10">
              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Nombre Completo</label>
                <input type="text" name="name" [(ngModel)]="newMember.name" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border" placeholder="Ej: Juan Pérez">
              </div>
              
              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">User ID</label>
                <input type="text" name="username" [(ngModel)]="newMember.username" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border" placeholder="Ej: jperez">
              </div>

              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Contraseña</label>
                <div class="relative">
                  <input [type]="showPassword() ? 'text' : 'password'" name="password" [(ngModel)]="newMember.password" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary outline-none transition-colors border pr-12" placeholder="Mínimo 4 caracteres">
                  <button type="button" (click)="showPassword.set(!showPassword())" class="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-stark-gray hover:text-white transition-colors text-xl">
                    {{showPassword() ? 'visibility_off' : 'visibility'}}
                  </button>
                </div>
              </div>
              
              <div class="space-y-2">
                <label class="font-label-caps text-[10px] text-stark-gray uppercase tracking-widest">Rol Asignado</label>
                <select name="role" [(ngModel)]="newMember.role" class="w-full bg-background border-outline-variant text-white p-4 font-hanken text-sm focus:border-secondary transition-colors border appearance-none outline-none">
                  <option value="ADMIN">ADMINISTRADOR</option>
                  <option value="WAITER">MESERO / POS</option>
                  <option value="KITCHEN">COCINA / KDS</option>
                </select>
              </div>

              <div class="pt-6">
                <button type="submit" class="w-full py-6 bg-secondary text-on-secondary font-anton text-xl tracking-brutal uppercase hover:bg-white hover:text-black transition-all shadow-brutal-gold active:translate-y-1"
                        [disabled]="!newMember.name || !newMember.username || !newMember.password || newMember.password.length < 4"
                        [ngClass]="{'opacity-30 cursor-not-allowed': !newMember.name || !newMember.username || !newMember.password || newMember.password.length < 4}">
                  AUTORIZAR ACCESO
                </button>
              </div>

              <!-- Validation -->
              <div *ngIf="formError()" class="text-tomato font-label-caps text-[10px] tracking-widest uppercase bg-tomato/10 border border-tomato/20 p-4">
                {{formError()}}
              </div>
            </form>
          </div>
        </div>

        <!-- Staff List Table -->
        <div class="lg:col-span-8 flex flex-col gap-10">
           <div class="flex justify-between items-end border-b border-outline-variant pb-4">
              <h2 class="font-anton text-4xl text-white uppercase tracking-tighter">LISTADO DE PERSONAL</h2>
              <span class="font-label-caps text-[10px] text-stark-gray opacity-40 uppercase tracking-widest">SISTEMA ECLISSE v3.0</span>
           </div>

           <!-- Empty State -->
           <div *ngIf="data.staff().length === 0" class="flex flex-col items-center justify-center py-20 border border-outline-variant border-dashed">
             <span class="material-symbols-outlined text-stark-gray opacity-10 text-8xl mb-6">group</span>
             <p class="font-label-caps text-[10px] text-stark-gray opacity-40 uppercase tracking-widest">NINGÚN MIEMBRO REGISTRADO</p>
           </div>

           <div class="grid grid-cols-1 gap-4">
              <div *ngFor="let member of data.staff()" class="flex flex-col md:flex-row items-center justify-between p-8 border border-outline-variant bg-surface-container-lowest group hover:border-stark-gray transition-colors relative overflow-hidden">
                <div class="absolute left-0 top-0 h-full w-1" [ngClass]="{'bg-secondary': member.role === 'ADMIN', 'bg-emerald': member.role === 'WAITER', 'bg-tomato': member.role === 'KITCHEN'}"></div>
                
                <div class="flex items-center gap-8 w-full md:w-auto">
                   <div class="w-16 h-16 border border-outline-variant flex items-center justify-center font-anton text-xl text-stark-gray group-hover:text-white transition-colors">
                      {{member.name.substring(0,2).toUpperCase()}}
                   </div>
                   <div class="flex flex-col">
                      <span class="font-anton text-2xl text-white uppercase group-hover:text-secondary transition-all">{{member.name}}</span>
                      <span class="font-label-caps text-[10px] text-stark-gray tracking-widest uppercase">{{member.username}}</span>
                   </div>
                </div>

                <div class="flex items-center gap-8 md:gap-16 mt-8 md:mt-0 w-full md:w-auto justify-between md:justify-end">
                   <div class="flex flex-col items-end">
                      <span class="font-label-caps text-[9px] text-stark-gray opacity-40 uppercase tracking-brutal mb-1">ROL</span>
                      <span class="font-anton text-lg" [ngClass]="{'text-secondary': member.role === 'ADMIN', 'text-emerald': member.role === 'WAITER', 'text-tomato': member.role === 'KITCHEN'}">{{member.role}}</span>
                   </div>
                   
                   <div class="flex flex-col items-end">
                      <span class="font-label-caps text-[9px] text-stark-gray opacity-40 uppercase tracking-brutal mb-1">ESTADO</span>
                      <button (click)="toggleStatus(member)" class="flex items-center gap-2 font-label-caps text-[10px] text-white hover:text-secondary transition-colors cursor-pointer">
                        <span class="w-1.5 h-1.5 rounded-full" [ngClass]="member.status === 'ACTIVE' ? 'bg-emerald animate-pulse' : 'bg-stark-gray opacity-20'"></span>
                        {{member.status}}
                      </button>
                   </div>

                   <button (click)="removeMember(member)" class="material-symbols-outlined text-stark-gray hover:text-tomato transition-colors cursor-pointer">delete</button>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    select { cursor: pointer; }
    option { background: #131313; color: white; }
  `]
})
export class DashboardUsers {
  data = inject(DataService);
  showPassword = signal(false);
  formError = signal('');

  activeCount = () => this.data.staff().filter((m: StaffMember) => m.status === 'ACTIVE').length;

  newMember: any = {
    name: '',
    username: '',
    password: '',
    role: 'WAITER'
  };

  addMember() {
    this.formError.set('');
    
    if (!this.newMember.name || !this.newMember.username) {
      this.formError.set('Nombre y User ID son obligatorios.');
      return;
    }
    if (!this.newMember.password || this.newMember.password.length < 4) {
      this.formError.set('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    // Check duplicate username
    const exists = this.data.staff().find((m: StaffMember) => m.username === this.newMember.username);
    if (exists) {
      this.formError.set('Ya existe un miembro con este User ID.');
      return;
    }

    this.data.addStaff({
      name: this.newMember.name,
      username: this.newMember.username,
      password: this.newMember.password,
      role: this.newMember.role,
      status: 'ACTIVE'
    });
    this.newMember = { name: '', username: '', password: '', role: 'WAITER' };
  }

  removeMember(member: StaffMember) {
    if (confirm(`¿Deseas eliminar a ${member.name} del sistema?`)) {
      this.data.removeStaff(member.id);
    }
  }

  toggleStatus(member: StaffMember) {
    this.data.toggleStaffStatus(member.id);
  }
}
