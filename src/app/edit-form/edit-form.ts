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

  featureName: string = '';
  tagKeys: string[] = [];

  // Champs pour ajouter un nouveau tag
  newKey: string = '';
  newValue: any = '';
  newType: string = 'text';

  ngOnInit(): void {
    this.featureName = this.name;
    this.tagKeys = Object.keys(this.tags || {});
  }

  confirm(): void {
    // Filtrer pour ne garder qu’un seul name “général”
    const cleanTags = { ...this.tags };
    if (this.featureName) {
      cleanTags['name'] = this.featureName;
    }

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
    const key = this.newKey.trim();
    if (!key) return;

    // Cas particulier : opening_hours
    if (key === 'opening_hours') {
      // Si le tag existe déjà, on met simplement à jour
      this.tags[key] = this.newValue || this.tags[key] || '';
    } else {
      // Sinon on ajoute un nouveau tag
      this.tags[key] = this.castValueByType(this.newValue, this.newType);
      this.tagKeys = Object.keys(this.tags);
    }

    // Réinitialiser le formulaire d’ajout
    this.newKey = '';
    this.newValue = '';
    this.newType = 'text';
  }

  private castValueByType(value: any, type: string): any {
    switch (type) {
      case 'number':
        return Number(value);
      case 'date':
      case 'time':
      case 'text':
      default:
        return value;
    }
  }
}
