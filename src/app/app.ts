// app.component.ts
import {Component, ElementRef, ViewChild} from '@angular/core';
import { VoiceComponent } from './voice-component/voice-component';
import { MapComponent } from './map/map';
import {NgClass, NgIf} from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [VoiceComponent, MapComponent, NgIf, NgClass],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {
  showChat = false;
  showMap = false;

  menuActive = false;

  @ViewChild('mapRef') mapRef!: MapComponent;


  // Toggle Chat modal
  toggleChat() {
    this.showChat = !this.showChat;
  }

  toggleMap() {
    this.showMap = !this.showMap;
  }

  toggleHome() {
    this.showChat = false;
    this.showMap = false;
  }

  toggleMenu() {
    this.menuActive = !this.menuActive;
  }

}
