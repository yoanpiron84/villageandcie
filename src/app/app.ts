// app.component.ts
import {AfterViewInit, Component, effect, Input, Output, SimpleChanges, ViewChild} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { VoiceComponent } from './voice-component/voice-component';
import { MapComponent } from './map/map';
import {AsyncPipe, NgClass, NgForOf, NgIf} from '@angular/common';
import {AuthService, User} from '@auth0/auth0-angular';
import {BehaviorSubject, window} from 'rxjs';
import {getWindow} from '../utils/getWindow';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {ProfileComponent} from './profile/profile';
import {UserService} from '../services/user';
import {filter, take} from 'rxjs/operators';
import {LanguageService} from '../services/language';
import {AdminValidation} from './admin-validation/admin-validation';

export interface TranslationEntry {
  message: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [VoiceComponent, AdminValidation, MapComponent, NgIf, NgClass, NgForOf, AsyncPipe, ReactiveFormsModule, ProfileComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {

  loginForm: FormGroup;
  resetForm: FormGroup;
  showResetForm = false;
  resetSent = false;

  /*********************************************************************

                    Initialisation des variables

   *********************************************************************/

  showHome = true;
  showChat = false;
  showMap = false;
  showProfile = false;
  showAdminValidation = false;
  menuActive = false;

  showLanguageMenu = false;

  translations: Record<string, TranslationEntry> = {};

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

  @ViewChild('profile') profilComponent!: ProfileComponent;


  // Auth0
  user: any = null;

  constructor(private http: HttpClient, public auth: AuthService, public userService: UserService, private fb: FormBuilder, protected languageService: LanguageService) {
    this.loginForm = this.fb.group({
      // email: ['', [Validators.required, Validators.email]],
      // password: ['', Validators.required],
    });

    this.resetForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    effect(() => {
      const locale = this.userService.userSignal()?.locale;
      if (locale) {
        this.languageService.setLanguage(locale as 'fr' | 'en' | 'es');
        this.loadTranslations(locale);
      }
    });

    this.auth.user$.subscribe(user => {
      if (user?.sub) this.userService.fetchUser(user.sub);
    });

  }

  login() {
    const { email } = this.loginForm.value;
    const { password } = this.loginForm.value;
    this.auth.loginWithRedirect({
      // authorizationParams: {
      //   login_hint: email,
      // },
    })

  }

  loginWithGoogle() {
    this.auth.loginWithRedirect({
      authorizationParams: {
        connection: 'google-oauth2',
      },
    });
  }

  resetPasswordSubmit() {
    const { email } = this.resetForm.value;

    // Ici tu appelles ton endpoint backend pour trigger Auth0 reset password email
    this.http.post('http://localhost:3000/api/auth/reset-password', { email }).subscribe(() => {
      this.resetSent = true;
    }, err => {
      console.error(err);
    });
  }

  logout() {
    this.auth.logout({ logoutParams: { returnTo: getWindow().location.origin } });
  }

  /*********************************************************************

                      Fonctions système (Ng)

   *********************************************************************/


  ngOnInit() {
    this.startAutoSlide();

    this.auth.isAuthenticated$
      .pipe(take(1))
      .subscribe(isAuth => {
        if (isAuth) {
          console.log('✅ Session active restaurée');
        } else {
          console.log('🚫 Pas de session active');
        }
      });

    this.auth.user$.subscribe(user => {
      this.user = user;
    });

    this.auth.user$
      .pipe(
        filter((u: any) => !!u?.sub),
        take(1)
      )
      .subscribe({
        next: (authUser: any) => {
          const sub = authUser.sub as string;

          this.userService.setSub(sub);

          this.userService.fetchUser(sub);
        },
        error: (err) => console.error('auth.user$ error', err)
      });
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

  toggleView(view: 'home' | 'map' | 'profile' | 'chat' | 'adminvalidation') {
    if (view === 'chat') {
      // Chat se superpose, donc on ne touche pas aux autres vues
      this.showChat = !this.showChat;
      return;
    }

    // On crée un mapping pour les vues principales
    const mainViews: Record<'home' | 'map' | 'profile' | 'adminvalidation', boolean> = {
      home: this.showHome,
      map: this.showMap,
      profile: this.showProfile,
      adminvalidation: this.showAdminValidation
    };

    if (mainViews[view]) {
      // Si la vue est déjà ouverte, revenir sur Home
      this.showHome = true;
      this.showMap = false;
      this.showProfile = false;
      this.showAdminValidation = false;
    } else {
      // Sinon activer la vue demandée et désactiver les autres
      this.showHome = false;
      this.showMap = false;
      this.showProfile = false;
      this.showAdminValidation = false;

      switch (view) {
        case 'home': this.showHome = true; break;
        case 'map': this.showMap = true; break;
        case 'profile': this.showProfile = true; break;
        case 'adminvalidation': this.showAdminValidation = true; break;
      }
    }
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

  changeLanguage(lang: 'fr' | 'en' | 'es') {
    this.languageService.setLanguage(lang);
    this.showLanguageMenu = false;
    this.loadTranslations(lang);

    const user = this.userService.userSignal();
    if (user.sub) {
      this.userService.updateLocale(user.sub, lang);
    }
  }

  private loadTranslations(lang: string) {
    this.http.get<Record<string, TranslationEntry>>(`/lang/${lang}_trad.json`)
      .subscribe(data => {
        this.translations = data;
        //this.updateTexts();
        this.updateSlides();
      });
  }
  //
  // private updateTexts() {
  //   setTimeout(() => {
  //     // Menu
  //     const homeText = document.querySelector('.home-text');
  //     const mapText = document.querySelector('.map-text');
  //     const chatText = document.querySelector('.chat-text');
  //
  //     if (homeText) homeText.textContent = this.translations['home'];
  //     if (mapText) mapText.textContent = this.translations['map'];
  //     if (chatText) chatText.textContent = this.translations['chat'];
  //
  //     // Header
  //     const title = document.querySelector('.title .hide-small');
  //     const subtitle = document.querySelector('.subtitle');
  //
  //     if (title) title.textContent = this.translations['welcome'];
  //     if (subtitle) subtitle.textContent = this.translations['subtitle'];
  //
  //     // Boutons carte (seulement si la map est affichée)
  //     const waterBtn = document.querySelector('.map-buttons button:nth-child(1)');
  //     const greenBtn = document.querySelector('.map-buttons button:nth-child(2)');
  //
  //     if (waterBtn) waterBtn.textContent = this.translations['water_points'];
  //     if (greenBtn) greenBtn.textContent = this.translations['green_spaces'];
  //   });
  // }

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
    this.slides[0].text = this.translations["tag:text_slide_1"].message;
    this.slides[1].text = this.translations['tag:text_slide_2'].message;
    this.slides[2].text = this.translations['tag:text_slide_3'].message;
  }

  protected readonly window = window;
  protected readonly getWindow = getWindow;
}
