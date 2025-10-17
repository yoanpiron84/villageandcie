// app.component.ts
import {Component, SimpleChanges, ViewChild} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { VoiceComponent } from './voice-component/voice-component';
import { MapComponent } from './map/map';
import { NgClass, NgForOf, NgIf } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [VoiceComponent, MapComponent, NgIf, NgClass, NgForOf],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {

  /*********************************************************************

                    Initialisation des variables

   *********************************************************************/

  showChat = false;
  showMap = false;
  menuActive = false;

  currentLanguage: string = 'fr';
  showLanguageMenu = false;

  translations: Record<string, string> = {};

  languages = [
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
  ];

  slides = [
    {
      image: '/images/slide1.png',
      text:  'Découvrez toutes les activités possibles à faire autour de vous.'
    },
    {
      image: '/images/slide2.png',
      text: 'Obtenez toutes les informations relatives aux activités / lieux intéressants pour vous.'
    },
    {
      image: '/images/slide3.PNG',
      text: 'Une assistance vocale est disponible pour vous aider dans vos recherches.'
    }
  ];

  currentSlide = 0;
  slideInterval: any;

  @ViewChild('mapRef') mapRef!: MapComponent;

  constructor(private http: HttpClient) {}

  /*********************************************************************

                      Fonctions système (Ng)

   *********************************************************************/

  ngOnInit() {
    this.loadTranslations(this.currentLanguage);
    this.startAutoSlide();
  }

  ngOnChanges(){
  // if (changes['currentLanguage'] && !changes['currentLanguage'].firstChange) {
  //   console.log("CHANGEMENT");
  //   this.loadTranslations(this.currentLanguage);
  // }
  }


  ngOnDestroy(){
    if (this.slideInterval) clearInterval(this.slideInterval);
  }

  /*********************************************************************

                  Fonctions d'activation bouton

   *********************************************************************/

  toggleChat() {
    this.showChat = !this.showChat;
    setTimeout(() => this.updateTexts(), 0);
  }

  toggleMap() {
    this.showMap = !this.showMap;

    // Mettre à jour les textes une fois que la map est affichée
    if (this.showMap) {
      setTimeout(() => this.updateTexts(), 0);
    }
  }

  toggleHome() {
    this.showChat = false;
    this.showMap = false;
    setTimeout(() => this.updateTexts(), 0)
  }

  toggleMenu() {
    this.menuActive = !this.menuActive;
  }

  toggleLanguageMenu() {
    this.showLanguageMenu = !this.showLanguageMenu;
  }

  /*********************************************************************

                        Fonctions traduction

   *********************************************************************/

  changeLanguage(lang: string) {
    this.currentLanguage = lang;
    this.showLanguageMenu = false;
    this.loadTranslations(lang);
  }

  private loadTranslations(lang: string) {
    this.http.get<Record<string, string>>(`/lang/${lang}.json`)
      .subscribe(data => {
        this.translations = data;
        this.updateTexts();
        this.updateSlides();
      });
  }

  private updateTexts() {
    setTimeout(() => {
      // Menu
      const homeText = document.querySelector('.home-text');
      const mapText = document.querySelector('.map-text');
      const chatText = document.querySelector('.chat-text');

      if (homeText) homeText.textContent = this.translations['home'];
      if (mapText) mapText.textContent = this.translations['map'];
      if (chatText) chatText.textContent = this.translations['chat'];

      // Header
      const title = document.querySelector('.title .hide-small');
      const subtitle = document.querySelector('.subtitle');

      if (title) title.textContent = this.translations['welcome'];
      if (subtitle) subtitle.textContent = this.translations['subtitle'];

      // Boutons carte (seulement si la map est affichée)
      const waterBtn = document.querySelector('.map-buttons button:nth-child(1)');
      const greenBtn = document.querySelector('.map-buttons button:nth-child(2)');

      if (waterBtn) waterBtn.textContent = this.translations['water_points'];
      if (greenBtn) greenBtn.textContent = this.translations['green_spaces'];
    });
  }

  /*********************************************************************

                          Fonctions slides

   *********************************************************************/

  startAutoSlide() {
    this.slideInterval = setInterval(() => {
      this.nextSlide();
    }, 10000); // 10 secondes
  }

  nextSlide(manual: boolean = false) {
    this.currentSlide = (this.currentSlide + 1) % this.slides.length;
    if (manual) this.restartAutoSlide();
  }

  prevSlide(manual: boolean = false) {
    this.currentSlide = (this.currentSlide - 1 + this.slides.length) % this.slides.length;
    if (manual) this.restartAutoSlide();
  }

  restartAutoSlide() {
    if (this.slideInterval) clearInterval(this.slideInterval);
    this.startAutoSlide();
  }

  updateSlides(){
    this.slides[0].text = this.translations['text_slide_1'];
    this.slides[1].text = this.translations['text_slide_2'];
    this.slides[2].text = this.translations['text_slide_3'];
  }

}
