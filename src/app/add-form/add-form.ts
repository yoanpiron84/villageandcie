import { Component, Input, Output, EventEmitter } from '@angular/core';
import {NgForOf, NgIf } from '@angular/common';
import {FormsModule} from '@angular/forms';
import {UserService} from '../../services/user';
import {HttpClient} from '@angular/common/http';

@Component({
  selector: 'app-add-form',
  standalone: true,
  templateUrl: './add-form.html',
  styleUrls: ['./add-form.scss'],
  imports: [FormsModule, NgForOf, NgIf]
})
export class AddFormComponent {

  @Input() coords!: { lat: number; lon: number };

  @Output() submitForm = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  name = "";
  type = "";
  customType: string = "";
  eventStart = "";
  eventEnd = "";

  logoFile: File | null = null;
  logoFilePreview: string | null = null;


  // tags simples
  tags: { key: string; value: string }[] = [];

  newTagKey = "";
  newTagValue = "";

  openingHoursDays = ["mo", "tu", "we", "th", "fr", "sa", "su"];

  openingHoursValues: any = {
    mo: { start: "", end: "" },
    tu: { start: "", end: "" },
    we: { start: "", end: "" },
    th: { start: "", end: "" },
    fr: { start: "", end: "" },
    sa: { start: "", end: "" },
    su: { start: "", end: "" },
  };

  constructor(private userService: UserService, private http: HttpClient) {
  }

// Formate en chaîne OSM : "Mo 08:00-12:00; Tu 09:00-17:00"
  generateOpeningHoursTag(): string {
    const map = {
      mo: "Mo",
      tu: "Tu",
      we: "We",
      th: "Th",
      fr: "Fr",
      sa: "Sa",
      su: "Su"
    };

    const parts: string[] = [];

    for (const d of this.openingHoursDays) {
      const { start, end } = this.openingHoursValues[d];
      if (start && end) {
        parts.push(`${map[d as keyof typeof map]} ${start}-${end}`);
      }
    }

    return parts.join("; ");
  }

// Validation obligatoire
  isOpeningHoursValid(): boolean {
    return this.openingHoursDays.some(d =>
      this.openingHoursValues[d].start &&
      this.openingHoursValues[d].end
    );
  }


  addTag() {
    if (!this.newTagKey || !this.newTagValue) return;
    this.tags.push({ key: this.newTagKey, value: this.newTagValue });
    this.newTagKey = "";
    this.newTagValue = "";
  }

  submit() {
    // Nom obligatoire
    if (!this.name) {
      alert("Le nom est obligatoire.");
      return;
    }

    // Vérifie que le type est choisi ou rempli si custom
    if (!this.type || (this.type === 'custom' && !this.customType)) {
      alert("Le type est obligatoire.");
      return;
    }

    // Vérifie les horaires
    if (!this.isOpeningHoursValid()) {
      alert("Veuillez remplir au moins un créneau d’ouverture.");
      return;
    }

    const finalType = this.type === 'custom' ? this.customType : this.type;

    // Récupère l'utilisateur courant pour createdBy
    const user = this.userService.userSignal();
    const createdBy = user?.name ? `${user.name}` : 'unknown';

    // ------- CAS EVENT -------
    if (finalType === "event") {
      if (!this.eventStart || !this.eventEnd) {
        alert("Veuillez préciser la durée de l'événement.");
        return;
      }

      this.submitForm.emit({
        mode: "event",
        name: this.name,
        coords: this.coords,
        createdBy,
        type: finalType,
        duration: {
          start: this.eventStart,
          end: this.eventEnd
        },
        tags: {
          ...this.formatTags(),
          opening_hours: this.generateOpeningHoursTag()
        },
        logo: this.logoFile
      });

      return;
    }

    // ------- CAS AJOUT NORMAL AVEC VALIDATIONADMIN -------
    this.submitForm.emit({
      mode: "validation",
      name: this.name,
      type: finalType,
      coords: this.coords,
      createdBy,
      tags: {
        ...this.formatTags(),
        opening_hours: this.generateOpeningHoursTag()
      }
    });
  }


  formatTags() {
    const out: any = {};
    this.tags.forEach(t => out[t.key] = t.value);
    return out;
  }

  onLogoChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.logoFile = file;

      // Pour preview
      const reader = new FileReader();
      reader.onload = () => this.logoFilePreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  onFormSubmit() {
    // Validation simple
    if (!this.name) return alert("Le nom est obligatoire.");
    if (!this.type || (this.type === 'custom' && !this.customType)) return alert("Le type est obligatoire.");
    if (!this.isOpeningHoursValid()) return alert("Veuillez remplir au moins un créneau d’ouverture.");

    const finalType = this.type === 'custom' ? this.customType : this.type;
    const user = this.userService.userSignal();
    const createdBy = user?.name || 'unknown';
    const _id = `${this.coords.lat}_${this.coords.lon}`;

    const data: any = {
      mode: finalType === "event" ? "event" : "validation",
      _id,
      name: this.name,
      coords: this.coords,
      createdBy,
      type: finalType,
      tags: {
        ...this.formatTags(),
        opening_hours: this.generateOpeningHoursTag()
      }
    };

    if (finalType === "event") {
      if (!this.eventStart || !this.eventEnd) return alert("Veuillez préciser la durée de l'événement.");
      data.duration = { start: this.eventStart, end: this.eventEnd };

      // ⚠️ FormData pour le fichier logo
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (typeof data[key] === 'object') {
          formData.append(key, JSON.stringify(data[key]));
        } else {
          formData.append(key, data[key]);
        }
      });

      if (this.logoFile) {
        formData.append('logo', this.logoFile);
      }

      this.http.post("http://localhost:3000/nodejs/evenements", formData)
        .subscribe({
          next: res => console.log("Événement créé :", res),
          error: err => console.error("Erreur création événement :", err)
        });
    } else {
      // Pour validationAdmin
      this.http.post("http://localhost:3000/nodejs/admin/validation", {
        targetCollection: data.type,
        targetId: `${this.coords.lat}_${this.coords.lon}`,
        newData: data,
        createdBy,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).subscribe({
        next: res => console.log("ValidationAdmin créée :", res),
        error: err => console.error(err)
      });
    }
  }


}
