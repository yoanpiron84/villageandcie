import {inject, Injectable} from '@angular/core';
import { MapService } from './map';
import { fromLonLat } from 'ol/proj';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import { Style, Icon } from 'ol/style';
import { HttpClient } from '@angular/common/http';
import { GeoJSON } from 'ol/format';
import {InteractionService} from './interaction';
import {Subject} from 'rxjs';


interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    state?: string;
    county?: string;
    country?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  searchTerm: string = '';
  searchResults: any[] = [];
  showDropdown = false;

  constructor() {}

  private readonly mapService = inject(MapService)
  private readonly http = inject(HttpClient);

  public searchSubject = new Subject<string>();


  performSearch(term: string, language: string = 'fr') {
    if (!term.trim()) {
      this.searchResults = [];
      return;
    }

    const url = `/api/search?format=json&q=${encodeURIComponent(term)}&addressdetails=1&limit=10`;
    const lang = language.toLowerCase() || 'fr';
    const headers = { 'Accept-Language': lang };

    this.http.get<NominatimResult[]>(url, { headers }).subscribe({
      next: (results) => {
        this.searchResults = results.map(r => ({
          ...r,
          display_name: r.display_name
        }));
        this.showDropdown = results.length > 0;
      },
      error: (err) => {
        console.error('Erreur API Nominatim :', err);
        this.searchResults = [];
        this.showDropdown = false;
      }
    });
  }

}
