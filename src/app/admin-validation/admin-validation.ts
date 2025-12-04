import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { JsonPipe, NgForOf, NgIf } from '@angular/common';

interface ValidationItem {
  _id: string;
  type: string;
  name: string;
  coords: { lat: number; lon: number };
  tags: any;
  targetCollection?: string; // optionnel
  status?: 'pending' | 'accepted' | 'refused';
}

@Component({
  selector: 'app-admin-validation',
  templateUrl: './admin-validation.html',
  styleUrls: ['./admin-validation.scss'],
  imports: [JsonPipe, NgForOf, NgIf],
  standalone: true
})
export class AdminValidation implements OnInit {
  items: ValidationItem[] = [];
  loading = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchValidationItems();
  }

  fetchValidationItems() {
    this.loading = true;
    this.http.get<ValidationItem[]>('http://localhost:3000/nodejs/admin/validation')
      .subscribe({
        next: data => {
          // Vérifie que coords existe pour éviter l'erreur
          this.items = data.filter(item => item.coords);
          this.loading = false;
        },
        error: err => {
          console.error('Erreur fetch validationAdmin:', err);
          this.loading = false;
        }
      });
  }

  updateStatus(item: ValidationItem, status: 'accepted' | 'refused') {
    this.http.patch(`http://localhost:3000/nodejs/admin/validation/${item._id}`, { action: status })
      .subscribe({
        next: () => {
          // 🔹 Pas besoin de poster dans entity depuis Angular, c'est géré côté serveur
          this.fetchValidationItems(); // Rafraîchit la liste
        },
        error: err => console.error('Erreur update status:', err)
      });
  }

}
