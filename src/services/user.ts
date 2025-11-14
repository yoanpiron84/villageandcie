import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface UserProfile {
  sub?: string;
  name?: string;
  picture?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  email_verified?: boolean;
  logins_count?: number;
  locale?: string;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  // signal qui contiendra au minimum { sub?: string }
  userSignal = signal<Partial<UserProfile>>({ sub: undefined });

  constructor(private http: HttpClient) {}

  // assure que le signal contient le sub (sans écraser le reste)
  setSub(sub: string) {
    const current = this.userSignal();
    if (current.sub !== sub) {
      this.userSignal.set({ ...current, sub });
    }
  }

  // Récupère le profil depuis le backend et merge dans le signal
  fetchUser(userId: string) {
    if (!userId) return;
    this.http.get<UserProfile>(`http://localhost:3000/api/me/${encodeURIComponent(userId)}`)
      .subscribe({
        next: user => {
          const current = this.userSignal();
          // merge : on garde sub existant (ou celui du serveur si présent)
          this.userSignal.set({ ...current, ...user, sub: current.sub ?? user.sub });
        },
        error: err => console.error('Erreur récupération user', err)
      });
  }

  updateLocale(userId: string, locale: string) {
    if (!userId) return;
    this.http.patch<{ locale: string }>(`http://localhost:3000/api/me/${userId}/locale`, { locale })
      .subscribe({
        next: res => {
          const current = this.userSignal();
          this.userSignal.set({ ...current, locale: res.locale });
        },
        error: err => console.error('Erreur mise à jour locale', err)
      });
  }

  updateProfile(userId: string, payload: Partial<UserProfile>) {
    if (!userId) return;
    this.http.patch<Partial<UserProfile>>(
      `http://localhost:3000/api/auth/update-user/${encodeURIComponent(userId)}`,
      payload
    ).subscribe({
      next: updated => {
        const current = this.userSignal();
        this.userSignal.set({ ...current, ...updated });
      },
      error: err => console.error('Erreur mise à jour profile', err)
    });
  }
}
