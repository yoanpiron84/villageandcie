import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgForOf, NgIf } from '@angular/common';

@Component({
  selector: 'app-edit-form',
  templateUrl: './edit-form.html',
  standalone: true,
  imports: [FormsModule, NgForOf, NgIf],
  styleUrls: ['./edit-form.scss']
})
export class EditFormComponent implements OnInit {
  @Input() name: string = '';
  @Input() tags: Record<string, any> = {};

  @Output() ok = new EventEmitter<{ name: string; tags: Record<string, any> }>();
  @Output() cancel = new EventEmitter<void>();

  featureName = '';
  tagKeys: string[] = [];

  newKey = '';
  newValue: any = '';
  newType = 'text';
  selectedKey = '';

  availableKeys: string[] = [];

  openingHoursDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  openingHoursValues: Record<string, {
    morning: string;
    afternoon: string;
    status: string;
  }> = {};

  ngOnInit(): void {
    this.featureName = this.name;
    this.tagKeys = Object.keys(this.tags || {});

    this.availableKeys = this.tagKeys.filter(k => k !== 'shop' && k !== 'name');
    this.availableKeys.push('custom');

    // 🔥 Init structure vide pour chaque jour
    this.openingHoursDays.forEach(day => {
      this.openingHoursValues[day] = {
        morning: '',
        afternoon: '',
        status: ''
      };
    });

    // 🔥 Pré-remplissage opening_hours
    if (this.tags['opening_hours']) {
      const lines = this.tags['opening_hours'].split('<br>');

      lines.forEach((line: string) => {
        if (!line.includes(':')) return;

        const [dayRaw, valueRaw] = line.split(':');
        const day = dayRaw.trim();
        const value = valueRaw.trim();

        if (!this.openingHoursValues[day]) return;

        // ⚠️ Fermeture totale
        if (value.toLowerCase().includes('fermé') && !value.includes(':')) {
          this.openingHoursValues[day].status = value;
          return;
        }

        // Exemple : "06:30-12:30 14:00-18:00"
        const parts = value.split(' ').filter(v => v.includes('-'));

        if (parts[0]) this.openingHoursValues[day].morning = parts[0];    // ex 06:30-12:30
        if (parts[1]) this.openingHoursValues[day].afternoon = parts[1];  // ex 14:00-18:00
      });
    }
  }

  confirm(): void {
    const cleanTags = { ...this.tags };
    if (this.featureName) cleanTags['name'] = this.featureName;

    this.ok.emit({
      name: this.featureName,
      tags: cleanTags
    });
  }

  cancelEdit(): void {
    this.cancel.emit();
  }

  getInputType(value: any): string {
    if (!value) return 'text';
    if (!isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (/^\d{2}:\d{2}/.test(value)) return 'time';
    if (typeof value === 'number') return 'number';
    return 'text';
  }

  addTag(): void {
    let key = this.selectedKey;
    if (!key) return;

    if (key === 'custom') {
      if (!this.newKey.trim()) return;
      key = this.newKey.trim();
    }

    if (key === 'opening_hours') {
      this.tags[key] = this.buildOpeningHoursTag();
    } else {
      this.tags[key] = this.castValueByType(this.newValue, this.newType);
    }

    this.tagKeys = Object.keys(this.tags);

    this.newKey = '';
    this.newValue = '';
    this.selectedKey = '';
    this.newType = 'text';
  }

  private castValueByType(value: any, type: string): any {
    switch (type) {
      case 'number':
        return Number(value);
      default:
        return value;
    }
  }

  isOpeningHours(): boolean {
    return this.selectedKey === 'opening_hours';
  }

  // 🔥 Corrigé : construit le format EXACT utilisé partout
  buildOpeningHoursTag(): string {
    return this.openingHoursDays.map(day => {
      const v = this.openingHoursValues[day];

      if (v.status) return `${day}: ${v.status}`;

      const morning = v.morning ? v.morning : '';
      const afternoon = v.afternoon ? v.afternoon : '';

      return `${day}: ${morning}${afternoon ? ' ' + afternoon : ''}`;
    }).join('<br>');
  }

  // 🔥 Mis à jour automatiquement quand on édite
  updateOpeningHoursTag(): void {
    this.tags['opening_hours'] = this.buildOpeningHoursTag();
  }
}
