import { Component, Input, Output, EventEmitter } from '@angular/core';
import {NgForOf, NgIf } from '@angular/common';
import {FormsModule} from '@angular/forms';
import {UserService} from '../../services/user';

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

  constructor(private userService: UserService) {
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
        }
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


}
