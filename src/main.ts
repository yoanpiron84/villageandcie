import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import {HttpClientModule, provideHttpClient} from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import {importProvidersFrom} from '@angular/core';

bootstrapApplication(AppComponent, {
  providers: [importProvidersFrom(HttpClientModule) ,provideHttpClient(), provideRouter(routes)]
}).catch(err => console.error(err));
