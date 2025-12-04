import {Component, effect, Input, OnInit} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, UserProfile } from '../../services/user';
import { AuthService } from '@auth0/auth0-angular';
import { filter, take } from 'rxjs/operators';
import {TranslationEntry} from '../app';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class ProfileComponent {
  editedName = '';
  tempPhoto = '';
  editingName = false;
  @Input() translations!: Record<string, TranslationEntry>;

  constructor(public auth: AuthService, public userService: UserService) {
    effect(() => {
      const user = this.userService.userSignal();
      if (!this.editingName) this.editedName = user.name ?? '';
    });
  }

  toggleEditName() {
    this.editingName = true;
    if (!this.tempPhoto) {
      this.tempPhoto = this.userService.userSignal().picture ?? '';
    }
  }
  cancelEdit() {
    this.editingName = false;
    const current = this.userService.userSignal();
    this.editedName = current.name || '';
    this.tempPhoto = current.picture ?? '';
  }

  saveChanges() {
    const currentUser = this.userService.userSignal();
    const sub = currentUser.sub as string | undefined;
    if (!sub) return;

    // mettre à jour le profil sur le backend
    this.userService.updateProfile(sub, {
      name: this.editedName,
      picture: this.tempPhoto
    });

    // mettre à jour le signal local uniquement après save
    this.userService.userSignal.set({
      ...currentUser,
      name: this.editedName,
      picture: this.tempPhoto
    });

    this.editingName = false;
  }

  onPhotoChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      console.error('Image trop lourde (max 2 Mo)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // ⚡ stocker la photo uploadée dans tempPhoto pour l’aperçu immédiat
        this.tempPhoto = reader.result;
      }
    };
    reader.readAsDataURL(file);
  }

  normalizeDate(date: string | string[] | undefined): string {
    if (!date) return '';
    return Array.isArray(date) ? date[0] : date;
  }
}
