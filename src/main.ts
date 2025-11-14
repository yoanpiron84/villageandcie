import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import {HttpClientModule, provideHttpClient} from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import {importProvidersFrom} from '@angular/core';
import {provideAuth0} from '@auth0/auth0-angular';
import {getWindow} from './utils/getWindow';

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(HttpClientModule) ,
    provideHttpClient(),
    provideRouter(routes),
    provideAuth0({
      domain: 'villageandcie.eu.auth0.com',
      clientId: 'Qsx2SsucYNKh4JsDeKcPtkPWhMti240U',
      authorizationParams: {
        redirect_uri: getWindow().location.origin, // SPA peut rediriger vers la racine
      },
      useRefreshTokens: true,              // pour rester connecté sans reload
      cacheLocation: 'localstorage',       // permet de stocker le token et éviter logout au refresh
    }),
  ],
}).catch(err => console.error(err));
