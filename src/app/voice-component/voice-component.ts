import { Component, Input, OnInit, OnDestroy, NgZone } from '@angular/core';
import { MapComponent } from '../map/map';
import { HttpClient } from '@angular/common/http';
import {NgForOf, NgIf, NgStyle} from '@angular/common';
import {catchError, of} from 'rxjs';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-voice',
  templateUrl: './voice-component.html',
  styleUrls: ['./voice-component.scss'],
  standalone: true,
  imports: [NgIf, FormsModule, NgForOf]
})
export class VoiceComponent implements OnInit, OnDestroy {
  @Input() mapComponent!: MapComponent;
  private stream!: MediaStream;
  private listeningRecorder!: MediaRecorder;
  private commandRecorder!: MediaRecorder;
  private audioChunks: Blob[] = [];
  private silenceTimeout: any = null;
  protected isRecording = false;
  private rmsThreshold = -46; // ~50 dB

  protected showErrorSidebar = false;

  protected showChat = false;
  protected chatMessages: { user: 'user'|'ai', text: string }[] = [
    { user: 'ai', text: 'Ecrivez votre demande ici' }
  ];
  protected userMessage = '';


  constructor(private http: HttpClient, private ngZone: NgZone) {}

  ngOnInit() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      this.stream = stream;
      this.startListening();
    }).catch(err => console.error("❌ Impossible d'accéder au micro:", err));
  }

  ngOnDestroy() {
    this.stopAll();
  }

  private startListening() {
    if (!this.stream) return;

    this.listeningRecorder = new MediaRecorder(this.stream);
    let tempChunks: Blob[] = [];

    this.listeningRecorder.ondataavailable = e => tempChunks.push(e.data);

    this.listeningRecorder.onstop = async () => {
      if (!tempChunks.length) return;

      const blob = new Blob(tempChunks, { type: 'audio/webm' });
      tempChunks = [];

      // Calcul volume RMS
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) sum += channelData[i] ** 2;
      const rms = Math.sqrt(sum / channelData.length);
      const dB = 20 * Math.log10(rms);

      console.log(dB);

      // Seulement si le volume dépasse le seuil
      if (dB > this.rmsThreshold) {
        const formData = new FormData();
        formData.append('audio', blob, 'listen.webm');
        fetch('http://localhost:5000/voice', {
          method: 'POST',
          body: formData
        })
          .then(response => {
            if (!response.ok) {
              // Backend indisponible ou erreur → afficher la sidebar
              this.showTemporaryErrorSidebar();
              // On retourne une réponse simulée pour ne pas casser le front
              return { texte: '' };
            }
            return response.json();
          })
          .catch(() => {
            // Si le serveur est complètement injoignable
            this.showTemporaryErrorSidebar();
            // On retourne une réponse simulée
            return { texte: '' };
          })
          .then(res => {
            // Réponse simulée ou réelle : on peut continuer sans erreur
            if (res?.texte?.includes('ok michel') && !this.isRecording) {
              this.ngZone.run(() => this.startRecording());
            }
          });
      }

      // Toujours relancer l'écoute passive
      this.restartListening();
    };

    this.listeningRecorder.start();
    setTimeout(() => { if (this.listeningRecorder.state==='recording') this.listeningRecorder.stop(); }, 2000);
  }

  private restartListening() {
    if (this.listeningRecorder.state === 'inactive') {
      this.listeningRecorder.start();
      setTimeout(() => { if (this.listeningRecorder.state==='recording') this.listeningRecorder.stop(); }, 2000);
    }
  }

  public startRecording() {
    if (!this.stream || this.isRecording) return;
    console.log("RECORDING");
    this.isRecording = true; // ✅ Passe en rouge
    this.audioChunks = [];
    this.commandRecorder = new MediaRecorder(this.stream);

    this.commandRecorder.ondataavailable = e => {
      this.audioChunks.push(e.data);
      this.resetSilenceTimer();
    };

    this.commandRecorder.onstop = () => {
      this.isRecording = false; // ✅ Retour au bleu
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice.webm');

      this.http.post<any>('http://localhost:5000/voice', formData).subscribe(res => {
        if (!this.mapComponent) return;
        if (res.action === 'water') this.mapComponent.showWater();
        else if (res.action === 'green') this.mapComponent.showGreenSpaces();
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
      console.log("NOT EVEN RECORDING");
      this.commandRecorder.stop();
      this.isRecording = false;
    }
  }

  private stopAll() {
    this.stopRecording();
    if (this.listeningRecorder && this.listeningRecorder.state !== 'inactive') this.listeningRecorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
  }

  /** 🔹 Affiche la sidebar rouge pendant 3 secondes */
  private showTemporaryErrorSidebar() {
    this.ngZone.run(() => {
      this.showErrorSidebar = true;
      setTimeout(() => this.showErrorSidebar = false, 3000);
    });
  }

  toggleChat() {
    this.showChat = !this.showChat;
  }

  sendMessage() {
    if (!this.userMessage.trim()) return;

    // Ajouter message utilisateur
    this.chatMessages.push({ user: 'user', text: this.userMessage });

    // Analyse du message pour réponse IA
    const msg = this.userMessage.toLowerCase();
    if (msg.includes('eau')) {
      this.mapComponent?.showWater();
      this.chatMessages.push({ user: 'ai', text: 'Je vous affiche les points d’eau.' });
    } else if (msg.includes('parc') || msg.includes('vert')) {
      this.mapComponent?.showGreenSpaces();
      this.chatMessages.push({ user: 'ai', text: 'Je vous affiche les espaces verts.' });
    } else {
      this.chatMessages.push({ user: 'ai', text: 'Je n’ai pas compris votre demande.' });
    }

    this.userMessage = '';

    // Scroll automatique vers le bas
    setTimeout(() => {
      const chatDiv = document.querySelector('.chat-messages');
      if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
    }, 0);
  }



}
