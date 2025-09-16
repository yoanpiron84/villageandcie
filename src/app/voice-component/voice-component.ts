import { Component, Input, OnInit, OnDestroy, NgZone, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { MapComponent } from '../map/map';
import { HttpClient } from '@angular/common/http';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-voice',
  templateUrl: './voice-component.html',
  styleUrls: ['./voice-component.scss'],
  standalone: true,
  imports: [NgIf, NgForOf, FormsModule, NgClass]
})
export class VoiceComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() mapComponent!: MapComponent;
  @ViewChild('chatModal', { static: false }) chatModal!: ElementRef<HTMLDivElement>;


  protected showChat = true;
  protected chatMessages: { user: 'user' | 'ai'; text: string }[] = [
    { user: 'ai', text: 'Posez moi vos questions, j\'y répondrai !'}
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

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  ngOnInit() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          console.log("Microphone activé", stream);
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
      const minWidth = 100;   // largeur minimale en px
      const minHeight = 40;   // hauteur minimale en px
      const maxWidth = window.innerWidth - 40;   // max largeur
      const maxHeight = window.innerHeight - 80; // max hauteur

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

  ngOnDestroy() {
    this.stopAll();
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

    // ⛔ Ignore le drag si on clique sur un bouton, un input, etc.
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





  // ENREGISTREMENT
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
        fetch('http://192.168.1.110:5000/voice', { method: 'POST', body: formData })
          .then(response => response.ok ? response.json() : { texte: '' })
          .catch(() => { return { texte: '' }; })
          .then(res => {
            console.log("ENTREE", res?.texte);
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

      this.http.post<any>('http://192.168.1.110:5000/voice', formData).subscribe(res => {
        if (!this.mapComponent) return;

        if (res.texte && res.texte.trim() !== '') {
          this.ngZone.run(() => {
            this.userMessage = res.texte;
            this.sendMessage();
          });
        }

        if (res.action === 'water') {
          this.mapComponent.showWater();
        } else if (res.action === 'green') {
          this.mapComponent.showGreenSpaces();
        } else if (res.action === 'city' && res.city) {
          console.log("Chercher la ville :", res.city);
          return;
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
      this.isRecording = false;
    }
  }

  private stopAll() {
    this.stopRecording();
    if (this.listeningRecorder && this.listeningRecorder.state !== 'inactive') this.listeningRecorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
  }

  // ================= CHAT =================
  sendMessage() {
    if (!this.userMessage.trim()) return;

    this.chatMessages.push({ user: 'user', text: this.userMessage });

    const msg = this.userMessage.toLowerCase();

    if (msg.includes('eau')) {
      this.mapComponent?.showWater();
      this.chatMessages.push({ user: 'ai', text: 'Je vous affiche les points d’eau.' });

    } else if (msg.includes('parc') || msg.includes('vert')) {
      this.mapComponent?.showGreenSpaces();
      this.chatMessages.push({ user: 'ai', text: 'Je vous affiche les espaces verts.' });

    } else if (msg.startsWith('chercher ')) {
      const city = msg.replace('chercher', '').trim();
      if (city && this.mapComponent) {
        this.mapComponent.showCity(city, (found: boolean) => {
          if (found) {
            this.chatMessages.push({ user: 'ai', text: `Ok, je vous affiche ${city}.` });
          } else {
            this.chatMessages.push({ user: 'ai', text: `Désolé, je n'ai pas trouvé la ville "${city}".` });
          }

          setTimeout(() => {
            if (!this.chatModal) return;
            const chatDiv = this.chatModal.nativeElement.querySelector('.chat-messages');
            if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
          }, 0);
        });
      } else {
        this.chatMessages.push({ user: 'ai', text: "Je n'ai pas compris le nom de la ville." });
      }

    } else {
      this.chatMessages.push({ user: 'ai', text: 'Je n’ai pas compris votre demande.' });
    }

    this.userMessage = '';
  }



}
