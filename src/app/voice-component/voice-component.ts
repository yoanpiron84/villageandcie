import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  NgZone,
  ViewChild,
  ElementRef,
  AfterViewInit,
  SimpleChanges
} from '@angular/core';
import { MapComponent } from '../map/map';
import { HttpClient } from '@angular/common/http';
import {NgClass, NgForOf, NgIf, NgStyle} from '@angular/common';
import { FormsModule } from '@angular/forms';
import ol from 'ol/dist/ol';

@Component({
  selector: 'app-voice',
  templateUrl: './voice-component.html',
  styleUrls: ['./voice-component.scss'],
  standalone: true,
  imports: [FormsModule, NgClass, NgStyle]
})
export class VoiceComponent implements OnInit, OnDestroy, AfterViewInit {

  /*********************************************************************

                        Initialisation des variables

   *********************************************************************/

  @Input() mapComponent!: MapComponent;
  @Input() translations: Record<string, string> = {};
  @Input() currentLanguage: string = 'fr';
  @ViewChild('chatModal', { static: false }) chatModal!: ElementRef<HTMLDivElement>;


  protected showChat = true;
  protected chatMessages: { user: 'user' | 'ai'; text: string }[] = [
    { user: 'ai', text: this.translations['ask_question'] || 'Entrez votre demande ici.'}
  ];
  protected userMessage = '';
  isMinimized = false;

  private offsetX = 0;
  private offsetY = 0;

  private initialWidth = 0;
  private initialHeight = 0;

  private dragging = false;

  private stream!: MediaStream;
  private listeningRecorder!: MediaRecorder;
  private commandRecorder!: MediaRecorder;
  private audioChunks: Blob[] = [];
  private silenceTimeout: any = null;
  protected isRecording = false;
  private rmsThreshold = -46;

  private initialPinchDistance: number | null = null;
  private initialModalWidth = 0;
  private initialModalHeight = 0;

  private wordMap: Record<string, string[]> = {}; // action => synonymes

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  /*********************************************************************

                          Fonctions système (Ng)

   *********************************************************************/

  ngOnChanges(changes: SimpleChanges) {
    if (changes['currentLanguage'] && !changes['currentLanguage'].firstChange) {
      this.loadWords(this.currentLanguage);
    }
  }

  ngOnInit() {
    this.loadWords(this.currentLanguage);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          console.log("Microphone activé", stream);
          this.stream = stream;
          this.startListening();
        })
        .catch(err => {
          console.error("Erreur d'accès au micro :", err);
        });
    } else {
      console.warn("getUserMedia non disponible. Utilise HTTPS ou localhost.");
    }
  }


  ngAfterViewInit() {
    const modal = this.chatModal.nativeElement;
    this.initialWidth = modal.offsetWidth;
    this.initialHeight = modal.offsetHeight;
    modal.style.touchAction = 'none';

    modal.addEventListener('touchstart', this.onPinchStart.bind(this), { passive: false });
    modal.addEventListener('touchmove', this.onPinchMove.bind(this), { passive: false });
    modal.addEventListener('touchend', this.onPinchEnd.bind(this));

    const observer = new MutationObserver(() => {
      if (this.isMinimized) {
        return;
      }

      const width = modal.offsetWidth;
      const height = modal.offsetHeight;

      if (width < this.initialWidth) modal.style.width = this.initialWidth + 'px';
      if (height < this.initialHeight) modal.style.height = this.initialHeight + 'px';
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
  }

  ngOnDestroy() {
    this.stopAll();
  }


  /*********************************************************************

                  Fonctions associées au lexique

   *********************************************************************/


  private loadWords(lang: string) {
    const fileName = `lang/words_${lang}.txt`;
    this.http.get(fileName, { responseType: 'text' }).subscribe(data => {
      this.wordMap = {};
      const lines = data.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes('=')) return;

        const [key, arrStr] = trimmed.split('=');
        const synonyms = arrStr
          .replace('[','').replace(']','')
          .split(',')
          .map(s => s.trim().toLowerCase());
        this.wordMap[key.trim()] = synonyms;
      });
    });
  }

  /** Détecte l’action correspondant au texte reconnu */
  private detectAction(text: string): string | null {
    text = text.toLowerCase();
    for (const action in this.wordMap) {
      if (this.wordMap[action].some(word => text.includes(word))) {
        return action; // retourne action standardisée
      }
    }
    return null;
  }


  /*********************************************************************

                  Fonctions d'interaction fenêtre

   *********************************************************************/


  private getDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }


  private onPinchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.initialPinchDistance = this.getDistance(event.touches);

      const modal = this.chatModal.nativeElement;
      this.initialModalWidth = modal.offsetWidth;
      this.initialModalHeight = modal.offsetHeight;
    }
  }


  private onPinchMove(event: TouchEvent) {
    if (event.touches.length === 2 && this.initialPinchDistance) {
      event.preventDefault();

      const modal = this.chatModal.nativeElement;
      const currentDistance = this.getDistance(event.touches);
      const scale = currentDistance / this.initialPinchDistance;

      // 🔹 Calculer la nouvelle taille
      let newWidth = this.initialModalWidth * scale;
      let newHeight = this.initialModalHeight * scale;

      // 🔹 Limites min/max pour pinch
      const minWidth = 100;
      const minHeight = 40;
      const maxWidth = window.innerWidth - 40;
      const maxHeight = window.innerHeight - 80;

      newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

      modal.style.width = newWidth + 'px';
      modal.style.height = newHeight + 'px';
    }
  }


  private onPinchEnd(event: TouchEvent) {
    if (event.touches.length < 2) {
      this.initialPinchDistance = null;
    }
  }


  toggleMinimize() {
    this.isMinimized = !this.isMinimized;

    const modal = this.chatModal.nativeElement;
    const chatBody = modal.querySelector<HTMLElement>('.chat-body');
    if (!chatBody) return;

    if (this.isMinimized) {
      modal.style.height = '40px';
      modal.style.width = '200px';
      modal.style.flex = 'none';

      chatBody.style.height = '0';
      chatBody.style.overflow = 'hidden';
      modal.style.resize = 'none';
    } else {
      modal.style.height = this.initialHeight + 'px';
      modal.style.width = this.initialWidth + 'px';
      modal.style.flex = '1 1 auto';
      modal.style.resize = 'both';

      chatBody.style.height = '';
      chatBody.style.overflow = '';
    }
  }


  toggleChat() {
    this.showChat = !this.showChat;
  }


  startDrag(event: MouseEvent | TouchEvent) {
    if (!this.chatModal) return;

    const target = event.target as HTMLElement;

    if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }

    event.preventDefault();
    this.dragging = true;

    const modal = this.chatModal.nativeElement;

    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

    const rect = modal.getBoundingClientRect();
    this.offsetX = clientX - rect.left;
    this.offsetY = clientY - rect.top;

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!this.dragging) return;

      const moveX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const moveY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;

      let left = moveX - this.offsetX;
      let top = moveY - this.offsetY;

      const maxLeft = window.innerWidth - modal.offsetWidth - 10;
      const maxTop = window.innerHeight - modal.offsetHeight - 10;
      left = Math.min(Math.max(left, 10), maxLeft);
      top = Math.min(Math.max(top, 10), maxTop);

      modal.style.left = left + 'px';
      modal.style.top = top + 'px';
    };

    const onEnd = () => {
      this.dragging = false;
      window.removeEventListener('mousemove', onMove as any);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove as any);
    window.addEventListener('mouseup', onEnd);

    window.addEventListener('touchmove', onMove as any);
    window.addEventListener('touchend', onEnd);
  }


  /*********************************************************************

                    Fonctions associées au Chat IA

   *********************************************************************/


  private startListening() {
    if (!this.stream) return;

    this.listeningRecorder = new MediaRecorder(this.stream);
    let tempChunks: Blob[] = [];

    this.listeningRecorder.ondataavailable = e => tempChunks.push(e.data);

    this.listeningRecorder.onstop = async () => {
      if (!tempChunks.length) return;

      const blob = new Blob(tempChunks, { type: 'audio/webm' });
      tempChunks = [];

      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) sum += channelData[i] ** 2;
      const rms = Math.sqrt(sum / channelData.length);
      const dB = 20 * Math.log10(rms);

      if (dB > this.rmsThreshold) {
        const formData = new FormData();
        formData.append('audio', blob, 'listen.webm');
        fetch('https://192.168.1.10:5000/voice', { method: 'POST', body: formData })
          .then(response => response.ok ? response.json() : { texte: '' })
          .catch(() => { return { texte: '' }; })
          .then(res => {
            if (res?.texte?.includes('ok michel') && !this.isRecording) {
              this.ngZone.run(() => this.startRecording());
            }
          });
      }

      this.restartListening();
    };

    this.listeningRecorder.start();
    setTimeout(() => { if (this.listeningRecorder.state === 'recording') this.listeningRecorder.stop(); }, 2000);
  }


  private restartListening() {
    if (this.listeningRecorder.state === 'inactive') {
      this.listeningRecorder.start();
      setTimeout(() => { if (this.listeningRecorder.state==='recording') this.listeningRecorder.stop(); }, 2000);
    }
  }


  public startRecording() {
    if (!this.stream || this.isRecording) return;

    const startSound = new Audio('/sons/record_on.mp3');
    startSound.play().catch(err => console.error('Erreur lecture son :', err));

    this.isRecording = true;
    this.audioChunks = [];
    this.commandRecorder = new MediaRecorder(this.stream);

    this.commandRecorder.ondataavailable = e => {
      this.audioChunks.push(e.data);
      this.resetSilenceTimer();
    };

    this.commandRecorder.onstop = () => {
      this.isRecording = false;
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice.webm');

      this.http.post<any>('https://192.168.1.10:5000/voice', formData).subscribe(res => {
        if (!this.mapComponent) return;

        if (res.texte?.trim()) {
          this.ngZone.run(() => {
            const msg = res.texte.trim();
            this.userMessage = msg;
            this.chatMessages.push({ user: 'user', text: msg });

            const verbs = this.translations['verbs']?.split(',') || [];
            const cityVerb = this.translations['city_verb'] || 'search';
            const lowerMsg = msg.toLowerCase();

            if (lowerMsg.startsWith(cityVerb)) {
              const cityName = lowerMsg.replace(cityVerb, '').trim();
              if (cityName) {
                this.mapComponent.showCity(cityName, (found: boolean) => {
                  const text = (found
                      ? this.translations['ok_city']
                      : this.translations['not_found_city']
                  )?.replace('{city}', cityName) || msg;
                  this.chatMessages.push({ user: 'ai', text });
                });
              }
            }
            else {
              const detectedAction = this.detectAction(lowerMsg);
              if (detectedAction) {
                const hasVerb = verbs.some(v => lowerMsg.includes(v));
                if (hasVerb) {
                  const methodName = 'show' + detectedAction.charAt(0).toUpperCase() + detectedAction.slice(1);
                  if (typeof (this.mapComponent as any)[methodName] === 'function') {
                    (this.mapComponent as any)[methodName]();
                  }
                  let displayText = lowerMsg;
                  verbs.forEach(v => displayText = displayText.replace(new RegExp(`\\b${v}\\b`, 'gi'), '').trim());
                  displayText = displayText.replace(/\s+/g, ' ');

                  const prefix = this.translations['show_prefix'] || 'Je vous affiche:';
                  this.chatMessages.push({ user: 'ai', text: `${prefix} ${displayText}` });
                } else {
                  this.chatMessages.push({ user: 'ai', text: this.translations['missing_verb'] });
                }
              } else {
                this.chatMessages.push({ user: 'ai', text: this.translations['not_understood'] });
              }
            }
          });
        }

        this.startListening();
      });
    };

    this.commandRecorder.start();
    this.resetSilenceTimer();
  }




  private resetSilenceTimer() {
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    this.silenceTimeout = setTimeout(() => this.stopRecording(), 6000);
  }


  public stopRecording() {
    if (this.commandRecorder && this.commandRecorder.state !== 'inactive') {
      this.commandRecorder.stop();
      const stopSound = new Audio('/sons/record_off.mp3');
      stopSound.play().catch(err => console.error('Erreur lecture son :', err));
      this.isRecording = false;
    }
  }


  private stopAll() {
    this.stopRecording();
    if (this.listeningRecorder && this.listeningRecorder.state !== 'inactive') this.listeningRecorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
  }


  sendMessage() {
    if (!this.userMessage.trim()) return;

    if (!this.mapComponent || !this.mapComponent['map']) {
      const mapMsg = this.translations['show_map_first']
        || 'Please display the map first to use city or action verbs.';
      this.chatMessages.push({ user: 'ai', text: mapMsg });
      this.userMessage = '';
      return;
    }

    const msg = this.userMessage.trim();
    this.chatMessages.push({ user: 'user', text: msg });

    const lowerMsg = msg.toLowerCase();
    const verbs = this.translations['verbs']?.split(',') || [];
    const cityVerb = this.translations['city_verb'] || 'search';

    if (lowerMsg.startsWith(cityVerb)) {
      const cityName = lowerMsg.replace(cityVerb, '').trim();
      if (cityName && this.mapComponent) {
        this.mapComponent.showCity(cityName, (found: boolean) => {
          const text = (found
              ? this.translations['ok_city']
              : this.translations['not_found_city']
          )?.replace('{city}', cityName) || msg;
          this.chatMessages.push({ user: 'ai', text });
        });
      } else {
        this.chatMessages.push({ user: 'ai', text: this.translations['not_understood'] });
      }
    }
    else {

      if (!this.mapComponent.pinLayer.getSource()?.getFeatures().length)  {
        this.chatMessages.push({ user: 'ai', text: 'Veuillez sélectionner une ville avant.' });
        this.userMessage = '';
        return;
      }

      const detectedAction = this.detectAction(lowerMsg);

      if (detectedAction) {
        const hasVerb = verbs.some(v => lowerMsg.includes(v));
        if (hasVerb) {
          const methodName = 'show' + detectedAction.charAt(0).toUpperCase() + detectedAction.slice(1);
          if (this.mapComponent && typeof (this.mapComponent as any)[methodName] === 'function') {
            (this.mapComponent as any)[methodName]();
          }

          this.mapComponent.lastAction = () => {
            (this.mapComponent as any)[methodName]();
          };

          let displayText = lowerMsg;
          verbs.forEach(v => displayText = displayText.replace(new RegExp(`\\b${v}\\b`, 'gi'), '').trim());
          displayText = displayText.replace(/\s+/g, ' ');

          const prefix = this.translations['show_prefix'] || 'Je vous affiche:';
          this.chatMessages.push({ user: 'ai', text: `${prefix} ${displayText}` });
        } else {
          this.chatMessages.push({ user: 'ai', text: this.translations['missing_verb'] + verbs });
        }
      } else {
        this.chatMessages.push({ user: 'ai', text: this.translations['not_understood'] });
      }
    }

    this.userMessage = '';
  }
}
