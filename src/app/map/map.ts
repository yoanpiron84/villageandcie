import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import {fromLonLat, toLonLat} from 'ol/proj';
import { GeoJSON } from 'ol/format';
import CircleStyle from 'ol/style/Circle';
import {XYZ} from 'ol/source';
import {FormsModule} from '@angular/forms';
import {NgForOf, NgIf} from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import Icon from 'ol/style/Icon';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';




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


@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  imports: [
    FormsModule
    , HttpClientModule, NgIf, NgForOf
  ],
  styleUrls: ['./map.scss']
})
export class MapComponent implements OnInit {
  private map!: Map;
  private waterLayer!: VectorLayer<VectorSource>;
  private greenLayer!: VectorLayer<VectorSource>;

  searchTerm: string = '';
  searchResults: NominatimResult[] = [];
  showDropdown: boolean = false;


  private searchSubject = new Subject<string>();

  isSatelliteView: boolean = true;
  showViewOptions: boolean = false;

  private satelliteLayer!: TileLayer<XYZ>;
  private labelsLayer!: TileLayer<XYZ>;
  private osmLayer!: TileLayer<OSM>;

  // --- Gestion du Pin ---
  private pinLayer!: VectorLayer<VectorSource>;
  private currentPinFeature: Feature | null = null;
  isPinModeActive: boolean = false;



  constructor(private http: HttpClient) {}
  coords = "44.17,5.43,44.19,5.45";

  ngOnInit(): void {
    this.initMap();

    // Déclenche la recherche 1s après la dernière frappe
    this.searchSubject.pipe(
      debounceTime(1000)  // 1 seconde
    ).subscribe(term => {
      this.performSearch(term);
    });
  }

  ngAfterViewInit() {
    const overlay = document.querySelector('.ol-overlaycontainer-stopevent') as HTMLElement;
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      overlay.querySelectorAll('*').forEach(el => (el as HTMLElement).style.pointerEvents = 'none');
    }
  }


  /** Initialise la carte avec un fond OSM et une couche vide pour les eaux */
  initMap() {
    // Styles pour arbres et parcs
    const treeStyle = new Style({
      image: new CircleStyle({
        radius: 4,
        fill: new Fill({ color: 'green' }),
        stroke: new Stroke({ color: 'darkgreen', width: 1 })
      })
    });

    const parkStyle = new Style({
      fill: new Fill({ color: 'rgba(34,139,34,0.3)' }),
      stroke: new Stroke({ color: 'green', width: 2 })
    });

    // Couche vecteur eau
    this.waterLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const geomType = feature.getGeometry()?.getType();
        return geomType === 'LineString'
          ? new Style({ stroke: new Stroke({ color: 'blue', width: 2 }) })
          : new Style({ fill: new Fill({ color: 'rgba(0,0,255,0.3)' }), stroke: new Stroke({ color: 'blue', width: 1 }) });
      }
    });

    // Couche vecteur espaces verts
    this.greenLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const geomType = feature.getGeometry()?.getType();
        return geomType === 'Point' ? treeStyle : parkStyle;
      }
    });

    // Couche pour le Pin
    this.pinLayer = new VectorLayer({
      source: new VectorSource(),
    });

    // Couche Satellite ESRI
    this.satelliteLayer = new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: '© ESRI'
      }),
      visible: this.isSatelliteView
    });

    this.labelsLayer = new TileLayer({
      source: new XYZ({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        attributions: '© ESRI'
      }),
      visible: this.isSatelliteView
    });

// Couche OpenStreetMap
    this.osmLayer = new TileLayer({
      source: new OSM(),
      visible: !this.isSatelliteView
    });

// Création de la carte
    this.map = new Map({
      target: 'map-container',
      layers: [
        this.satelliteLayer,
        this.labelsLayer,
        this.osmLayer,
        this.waterLayer,
        this.greenLayer,
        this.pinLayer
      ],
      view: new View({
        center: fromLonLat([5.43, 44.17]),
        zoom: 15,
        minZoom: 3,
        maxZoom: 19
      })
    });

    // Événement clic pour placer le pin si le mode est activé
    this.map.on('click', (event) => {
      if (!this.isPinModeActive) return;

      const [lon, lat] = toLonLat(event.coordinate);
      this.placePin(lon, lat);
    });
  }

  /** Placer ou déplacer le pin sur la carte */
  private placePin(lon: number, lat: number) {
    const pinSource = this.pinLayer.getSource();
    pinSource?.clear();

    const pin = new Feature({
      geometry: new Point(fromLonLat([lon, lat])),
    });

    pin.setStyle(
      new Style({
        image: new Icon({
          src: '/images/pin.png', // ton image de pin
          scale: 0.1,
          anchor: [0.5, 1],
        }),
      })
    );

    pinSource?.addFeature(pin);
    this.currentPinFeature = pin;

    // Mettre à jour les coords pour Overpass autour du pin
    const offset = 0.02; // zone ~2km
    this.coords = `${lat - offset},${lon - offset},${lat + offset},${lon + offset}`;
  }

  /** Active/Désactive le mode placement de pin */
  togglePinMode() {
    this.isPinModeActive = !this.isPinModeActive;
  }



  /** Charge et affiche les polygones d'eau */
  showWater() {
    const query = `
    [out:json];
    (
      way["waterway"="river"](${this.coords});       // rivières
      way["waterway"="stream"](${this.coords});      // ruisseaux
      way["waterway"="canal"](${this.coords});       // canaux
      way["waterway"="drain"](${this.coords});       // petits fossés ou canaux artificiels
      relation["natural"="water"](${this.coords});   // lacs, étangs
    );
    out geom;
  `;


    console.log("requête eau: ", query)

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    this.http.get(url).subscribe({
      next: (result: any) => {
        const features = this.convertOverpassToGeoJSON(result);

        const source = this.waterLayer.getSource();
        source?.clear();
        source?.addFeatures(features);

        if (features.length > 0) {
          const extent = source!.getExtent();
          this.map.getView().fit(extent, { padding: [50, 50, 50, 50] });
        }
      },
      error: (err) => {
        console.error('Erreur Overpass API:', err);
      }
    });
  }

  showGreenSpaces() {
    const query = `
    [out:json];
    (
      node["natural"="tree"](`+this.coords+`);
      way["natural"="tree"](`+this.coords+`);
      relation["natural"="tree"](`+this.coords+ `);

      way["leisure"="park"](`+this.coords+`);
      relation["leisure"="park"](`+this.coords+ `);

      way["landuse"="forest"](`+this.coords+`);
      relation["landuse"="forest"](`+this.coords+`);

      way["natural"="wood"](`+this.coords+`);
      relation["natural"="wood"](`+this.coords+`);
    );
    out geom;
  `;

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    this.http.get(url).subscribe((result: any) => {
      console.log('Green data:', result);
      const features = this.convertOverpassToGeoJSON(result);

      const source = this.greenLayer.getSource();
      source?.clear();
      source?.addFeatures(features);
    });
  }



  /**
   * Convertit la réponse Overpass en features OpenLayers
   */
  private convertOverpassToGeoJSON(data: any) {
    const geojson = {
      type: 'FeatureCollection',
      features: [] as any[]
    };

    data.elements.forEach((element: any) => {
      if (element.geometry) {
        const coords = element.geometry.map((g: any) => [g.lon, g.lat]);

        if (element.tags?.waterway) {
          // Cas d'une rivière / canal → LineString
          geojson.features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords
            },
            properties: {
              id: element.id,
              type: 'waterway'
            }
          });
        } else if ((element.type === 'way' || element.type === 'relation') && coords.length >= 3) {
          // Cas d'un lac ou plan d'eau → Polygon
          geojson.features.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [coords]
            },
            properties: {
              id: element.id,
              type: 'water'
            }
          });
        }
      }
    });

    return new GeoJSON().readFeatures(geojson, {
      dataProjection: 'EPSG:4326',   // Coordonnées OSM
      featureProjection: 'EPSG:3857' // Projection utilisée par OpenLayers
    });
  }



  performSearch(term: string) {
    if (!term.trim()) return;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}&addressdetails=1&limit=10`;

    this.http.get<NominatimResult[]>(url).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.showDropdown = results.length > 0;
      },
      error: (err) => {
        console.error('Erreur API Nominatim :', err);
        this.showDropdown = false;
      }
    });
  }

  onSearchInput(event: any) {
    const term = event.target.value;
    this.searchSubject.next(term);
  }

  onSearchBlur() {
    setTimeout(() => this.showDropdown = false, 200);
  }


  selectResult(result: any) {
    this.searchTerm = result.display_name;
    this.showDropdown = false;
    this.updateCoordsForCity(result);
    this.zoomToResult(result);
  }

  /** Zoom sur le point choisi */
  zoomToResult(result: any) {
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);

    console.log('Zoom sur :', lon, lat);

    this.map.getView().animate({
      center: fromLonLat([lon, lat]),
      zoom: 13,
      duration: 1000
    });
  }

  private updateCoordsForCity(result: any) {
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);

    // Offset pour définir une zone autour de la ville (~2km)
    const offset = 0.02;

    // Format Overpass : "sud, ouest, nord, est"
    this.coords = `${lat - offset},${lon - offset},${lat + offset},${lon + offset}`;
    console.log('Coords mises à jour pour Overpass:', this.coords);
  }

  toggleViewOptions() {
    this.showViewOptions = !this.showViewOptions;
  }

  /** Changer la vue de la map */
  setMapView(viewType: 'satellite' | 'osm') {
    this.isSatelliteView = viewType === 'satellite';

    this.satelliteLayer.setVisible(this.isSatelliteView);
    this.labelsLayer.setVisible(this.isSatelliteView);
    this.osmLayer.setVisible(!this.isSatelliteView);

  }

  showCity(cityName: string, onResult: (found: boolean) => void): void {
    if (!cityName || !cityName.trim()) {
      onResult(false);
      return;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&addressdetails=1&limit=1`;

    this.http.get<any[]>(url).subscribe({
      next: (results) => {
        if (results.length === 0) {
          console.warn('Ville non trouvée :', cityName);
          onResult(false); // ❌ Ville introuvable
          return;
        }

        const result = results[0];

        // --- 1. Mettre à jour coords ---
        const lon = parseFloat(result.lon);
        const lat = parseFloat(result.lat);
        const offset = 0.02;
        this.coords = `${lat - offset},${lon - offset},${lat + offset},${lon + offset}`;
        console.log('Coords mises à jour pour Overpass:', this.coords);

        // --- 2. Zoomer sur la ville ---
        this.map.getView().animate({
          center: fromLonLat([lon, lat]),
          zoom: 13,
          duration: 1000
        });

        // --- 3. Mettre à jour la barre de recherche ---
        this.searchTerm = result.display_name;

        onResult(true); // ✅ Ville trouvée
      },
      error: (err) => {
        console.error('Erreur Nominatim:', err);
        onResult(false);
      }
    });
  }


}
