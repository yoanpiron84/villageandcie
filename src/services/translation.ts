import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {

  constructor(private http: HttpClient) {}

  translate(text: string, targetLang: string = 'fr') {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        // La traduction se trouve dans response[0][0][0]
        if (response && response[0] && response[0][0] && response[0][0][0]) {
          return response[0][0][0];
        }
        return `[Erreur de traduction] ${text}`;
      }),
      catchError(err => {
        console.error('Erreur de traduction Google:', err);
        return of(`[Erreur de traduction] ${text}`);
      })
    );
  }
}
