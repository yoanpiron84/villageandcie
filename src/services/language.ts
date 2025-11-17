import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private langSubject = new BehaviorSubject<'fr' | 'en' | 'es'>('fr');
  lang$ = this.langSubject.asObservable();

  setLanguage(lang: 'fr' | 'en' | 'es') {
    this.langSubject.next(lang);
  }

  get currentLanguage() {
    return this.langSubject.value;
  }
}
