// app.component.ts
import { Component } from '@angular/core';
import { VoiceComponent } from './voice-component/voice-component';
import { MapComponent } from './map/map';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [VoiceComponent, MapComponent],
  templateUrl: './app.html'
})
export class AppComponent {}
