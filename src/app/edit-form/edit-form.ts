import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {AsyncPipe, JsonPipe, NgClass, NgForOf, NgIf} from '@angular/common';
import {TranslationEntry} from '../app';
import {TranslationService} from '../../services/translation';
import {LanguageService} from '../../services/language';

@Component({
  selector: 'app-edit-form',
  templateUrl: './edit-form.html',
  standalone: true,
  imports: [FormsModule, NgForOf, NgIf, NgClass, JsonPipe, AsyncPipe],
  styleUrls: ['./edit-form.scss']
})
export class EditFormComponent implements OnInit {
  @Input() name: string = '';
  @Input() tags: Record<string, any> = {};

  @Output() ok = new EventEmitter<{ name: string; tags: Record<string, any> }>();
  @Output() cancel = new EventEmitter<void>();
  @Input() isEditing: boolean = false;
  @Input() translations!: Record<string, TranslationEntry>;

  featureName = '';
  tagKeys: string[] = [];

  newKey = '';
  newValue: any = '';
  newType = 'text';
  selectedKey = '';

  formError = '';
  isEditingName = false;


  availableKeys: string[] = [];

  openingHoursDays = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  openingHoursValues: Record<string, {
    startMorning: string;
    endMorning: string;
    startAfternoon: string;
    endAfternoon: string;
    status: string;
  }> = {};

  constructor(protected translationService: TranslationService, protected languageService: LanguageService) {
  }

  ngOnInit(): void {
    this.featureName = this.name;
    this.tagKeys = Object.keys(this.tags || {});
    this.availableKeys = this.tagKeys.filter(k => k !== 'shop' && k !== 'name');
    this.availableKeys.push('custom');
    console.log(this.translationService.translate('Modifier la feature', this.languageService.currentLanguage) );

    // Initialiser structure vide
    this.openingHoursDays.forEach(day => {
      this.openingHoursValues[day] = {
        startMorning: '',
        endMorning: '',
        startAfternoon: '',
        endAfternoon: '',
        status: ''
      };
    });

    this.prefillOpeningHours();
  }

  prefillOpeningHours() {
    const ohRaw = this.tags['opening_hours'];
    if (!ohRaw) {
      console.log('Aucun tag opening_hours trouvé');
      return;
    }

    // Extraction des blocs "jour(s) + horaires" ou simple "horaires"
    const blocks = ohRaw.match(
      /([A-Za-z]{2,3}(?:-[A-Za-z]{2,3})?:?\s+\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:, ?\d{1,2}:\d{2}-\d{1,2}:\d{2})*)/g
    ) || [ohRaw.trim()];



    //blocks.map((b: any) => {b.replace(/<br>/g, ' ').replace(/Mo:|Tu:|We:|Th:|Fr:|Sa:|Su:/g, '').trim()});
    console.log(blocks);

    const joursTrouves = new Set<string>();

    blocks.forEach((block: any) => {
      const match = block.match(/^([A-Za-z]{2,3}(?:-[A-Za-z]{2,3})?):?\s*(.*)/);

      // 🟦 CAS SANS JOUR — global
      if (!match) {
        const rawParts = block
          .split(', ')
          .map((p: any) => p.trim())
          .filter((p: any) => /\d{1,2}:\d{2}-\d{1,2}:\d{2}/.test(p));

        this.openingHoursDays.forEach(day => {
          joursTrouves.add(day); // tous les jours utilisés
          const v = this.openingHoursValues[day];

          if (rawParts.length === 1) {
            const [s, e] = rawParts[0].split('-');
            v.startMorning = s;
            v.endMorning = '';
            v.startAfternoon = '';
            v.endAfternoon = e;
            v.status = 'ouvert';
          } else if (rawParts.length >= 2) {
            const [s1, e1] = rawParts[0].split('-');
            const [s2, e2] = rawParts[1].split('-');
            v.startMorning = s1;
            v.endMorning = e1;
            v.startAfternoon = s2;
            v.endAfternoon = e2;
            v.status = 'ouvert avec pause';
          }
        });

        return;
      }

      // 🟩 CAS AVEC JOUR(S)
      const dayPart = match[1].replace(':', '').trim();
      const hoursPart = match[2]?.trim();

      // Détermination des jours concernés
      const days: string[] = [];

      if (dayPart.includes('-')) {
        const [start, end] = dayPart.split('-').map((s: any) => s.trim());
        let si = this.openingHoursDays.indexOf(start);
        let ei = this.openingHoursDays.indexOf(end);
        if (si >= 0 && ei >= 0) {
          if (ei < si) ei += 7;
          for (let i = si; i <= ei; i++) {
            const d = this.openingHoursDays[i % 7];
            days.push(d);
            joursTrouves.add(d);
          }
        }
      } else {
        if (this.openingHoursDays.includes(dayPart)) {
          days.push(dayPart);
          joursTrouves.add(dayPart);
        }
      }

      // Extraction des plages horaires
      const rawParts = hoursPart
        ? hoursPart
          .split(', ')
          .map((p: any) => p.trim())
          .filter((p: any) => /\d{1,2}:\d{2}-\d{1,2}:\d{2}/.test(p))
        : [];

      days.forEach(day => {
        const v = this.openingHoursValues[day];
        if (!v) return;

        if (!rawParts.length || /(off|closed|fermé)/i.test(hoursPart)) {
          v.startMorning = '';
          v.endMorning = '';
          v.startAfternoon = '';
          v.endAfternoon = '';
          v.status = 'fermé';
          return;
        }
        console.log("rawParts: ", rawParts);

        if (rawParts.length === 1) {
          console.log("JE RENTRE ICI: ", rawParts);
          const [s, e] = rawParts[0].split('-');
          v.startMorning = s;
          v.endMorning = '';
          v.startAfternoon = '';
          v.endAfternoon = e;
          v.status = 'ouvert';
        } else if (rawParts.length >= 2) {
          const [s1, e1] = rawParts[0].split('-');
          const [s2, e2] = rawParts[1].split('-');
          v.startMorning = s1;
          v.endMorning = e1;
          v.startAfternoon = s2;
          v.endAfternoon = e2;
          v.status = 'ouvert avec pause';
        }
      });
    });

    // 🟥 FERMER LES JOURS NON MENTIONNÉS
    this.openingHoursDays.forEach(day => {
      if (!joursTrouves.has(day)) {
        const v = this.openingHoursValues[day];
        v.startMorning = '';
        v.endMorning = '';
        v.startAfternoon = '';
        v.endAfternoon = '';
        v.status = 'fermé';
      }
    });

    console.log('Valeurs opening_hours pré-remplies: ', this.openingHoursValues);
  }





  confirm(): void {
    // Si la clé sélectionnée est opening_hours ou qu'un champ est invalide, bloquer
    if (this.selectedKey === 'opening_hours' && this.hasInvalidOpeningHours()) {
      this.formError = "Veuillez remplir tous les champs obligatoires avant de valider.";
      return;
    }

    // Optionnel : si un autre tag custom est vide, tu peux aussi le vérifier ici
    if (this.selectedKey === 'custom' && !this.newKey.trim()) {
      this.formError = "Veuillez renseigner le nom de la clé personnalisée.";
      return;
    }

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

  private hasInvalidOpeningHours(): boolean {
    for (const day of this.openingHoursDays) {
      const fields = ['startMorning', 'endMorning', 'startAfternoon', 'endAfternoon'];
      for (const f of fields) {
        if (this.isFieldInvalid(day, f)) return true;
      }
    }
    return false;
  }


  private verifyOpeningHoursBeforeSubmit(): boolean {
    if (this.selectedKey !== 'opening_hours') return true; // pas de vérif si autre clé

    if (this.hasInvalidOpeningHours()) {
      this.formError = "Veuillez remplir tous les champs obligatoires.";
      return false;
    }

    this.formError = "";
    return true;
  }


  addTag() {
    if (!this.verifyOpeningHoursBeforeSubmit()) return;

    let key = this.selectedKey;
    if (!key) return;

    if (key === 'custom' && this.newKey.trim()) key = this.newKey.trim();

    if (key === 'opening_hours')
      this.tags[key] = this.buildOpeningHoursTag();
    else
      this.tags[key] = this.newValue;

    this.tagKeys = Object.keys(this.tags);

    this.selectedKey = '';
    this.newKey = '';
    this.newValue = '';
    this.newType = 'text';
  }


  // private castValueByType(value: any, type: string): any {
  //   switch (type) {
  //     case 'number':
  //       return Number(value);
  //     default:
  //       return value;
  //   }
  // }

  isOpeningHours(): boolean {
    return this.selectedKey === 'opening_hours';
  }

  // 🔥 Corrigé : construit le format EXACT utilisé partout
  buildOpeningHoursTag(): string {
    return this.openingHoursDays.map(day => {
      const v = this.openingHoursValues[day];
      switch(v.status) {
        case 'fermé': return `${day}: fermé`;
        case 'fermé matin': return `${day}: ${v.startAfternoon}-${v.endAfternoon}`;
        case 'fermé aprem': return `${day}: ${v.startMorning}-${v.endMorning}`;
        case 'ouvert avec pause': return `${day}: ${v.startMorning}-${v.endMorning}, ${v.startAfternoon}-${v.endAfternoon}`;
        case 'ouvert': return `${day}: ${v.startMorning}-${v.endAfternoon}`;
        default:
          const morning = v.startMorning && v.endMorning ? `${v.startMorning}-${v.endMorning}` : '';
          const afternoon = v.startAfternoon && v.endAfternoon ? `${v.startAfternoon}-${v.endAfternoon}` : '';
          if(morning && afternoon) return `${day}: ${morning}-${afternoon}`;
          if(morning) return `${day}: ${morning}`;
          if(afternoon) return `${day}: ${afternoon}`;
          return `${day}: ouvert`;
      }
    }).join('<br>');
  }

  // 🔥 Mis à jour automatiquement quand on édite
  updateOpeningHoursTag(): void {
    this.tags['opening_hours'] = this.buildOpeningHoursTag();
  }

  // Vérifie si un champ doit être grisé/désactivé selon le status
  shouldDisable(day: string, field: 'startMorning' | 'endMorning' | 'startAfternoon' | 'endAfternoon'): boolean {
    const status = this.openingHoursValues[day].status;

    switch (status) {
      case 'ouvert':
        // Ouvert → seule startMorning et endAfternoon utiles
        return !((field === 'startMorning') || (field === 'endAfternoon'));
      case 'ouvert avec pause':
        // 4 champs actifs
        return false;
      case 'fermé matin':
        // Garder aprem, griser matin
        return field === 'startMorning' || field === 'endMorning';
      case 'fermé aprem':
        // Garder matin, griser aprem
        return field === 'startAfternoon' || field === 'endAfternoon';
      case 'fermé':
        // Tout grisé
        return true;
      default:
        return false;
    }
  }

// Nettoie les valeurs non pertinentes selon le status (pour éviter qu’elles restent avec des heures incorrectes)
  cleanInvalidFields(day: string) {
    const status = this.openingHoursValues[day].status;
    const v = this.openingHoursValues[day];

    switch (status) {
      case 'ouvert':
        v.endMorning = '';
        v.startAfternoon = '';
        break;
      case 'fermé matin':
        v.startMorning = '';
        v.endMorning = '';
        break;
      case 'fermé aprem':
        v.startAfternoon = '';
        v.endAfternoon = '';
        break;
      case 'fermé':
        v.startMorning = '';
        v.endMorning = '';
        v.startAfternoon = '';
        v.endAfternoon = '';
        break;
      // ouvert avec pause → rien à nettoyer
    }
  }


  isFieldInvalid(day: string, field: string): boolean {
    const v: any = this.openingHoursValues[day]; // 👈 Solution magique
    const status = v.status;

    const requiredFields: Record<string, string[]> = {
      'ouvert': ['startMorning', 'endAfternoon'],
      'ouvert avec pause': ['startMorning', 'endMorning', 'startAfternoon', 'endAfternoon'],
      'fermé matin': ['startAfternoon', 'endAfternoon'],
      'fermé aprem': ['startMorning', 'endMorning'],
      'fermé': []
    };

    const required = requiredFields[status] || [];

    if (!required.includes(field)) return false;

    return !v[field];
  }

  isEditingExistingKey(): boolean {
    return !!this.selectedKey && this.tagKeys.includes(this.selectedKey);
  }


  onPrimaryAction() {
    // ✅ Vérifie uniquement si selectedKey est opening_hours
    if (!this.verifyOpeningHoursBeforeSubmit()) return;

    let key = this.selectedKey;
    if (!key) return;

    // Gestion custom
    if (key === 'custom' && this.newKey.trim()) {
      key = this.newKey.trim();
    }

    // Mise à jour du tag
    if (key === 'opening_hours') {
      this.tags[key] = this.buildOpeningHoursTag();
    } else {
      // Ici, si tu veux ajouter une vérif sur valeur vide par exemple pour d'autres types
      if ((this.newValue === null || this.newValue === '') && key !== 'opening_hours') {
        this.formError = 'La valeur du tag ne peut pas être vide.';
        return;
      }
      this.tags[key] = this.newValue;
    }

    this.tagKeys = Object.keys(this.tags);

    // Reset UI
    this.selectedKey = '';
    this.newKey = '';
    this.newValue = '';
    this.formError = '';
  }




}
