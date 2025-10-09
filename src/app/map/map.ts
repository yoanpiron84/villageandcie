import {Component, ElementRef, Input, OnInit, SimpleChanges, ViewChild} from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { XYZ, OSM } from 'ol/source';
import { Fill, Stroke, Style, Icon, Circle as CircleStyle } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { GeoJSON } from 'ol/format';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import { FormsModule } from '@angular/forms';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { getDistance as olDistance } from 'ol/sphere';
import { Coordinate } from 'ol/coordinate';


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
    FormsModule,
    NgClass
  ],
  styleUrls: ['./map.scss']
})
export class MapComponent implements OnInit {

  /*********************************************************************

                      Initialisation de variables

   *********************************************************************/

  private map!: Map;
  private waterLayer!: VectorLayer<VectorSource>;
  private greenLayer!: VectorLayer<VectorSource>;
  private restaurantLayer!: VectorLayer<VectorSource>;


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
  pinLayer!: VectorLayer<VectorSource>;
  private currentPinFeature: Feature | null = null;
  isPinModeActive: boolean = false;

  @Input() translations: Record<string, string> = {};

  @Input() currentLanguage: string = 'fr';

  private coords: string = "41.303, -5.266, 51.124, 9.662"; // Coordonnées France

  countryCenters: Record<string, [number, number]> = {
    fr: [2.2137, 46.2276], // France
    en: [-0.1276, 51.5074], // Angleterre (Londres)
    es: [-3.7038, 40.4168]  // Espagne (Madrid)
  };

  protected isLocalisationActive: boolean = false;

  private userPosition: { lat: number, lon: number } | null = null;

  lastAction: (() => void) | null = null;


  // Filtre rayon
  showFilterCard = false;
  radius = 1;
  currentRadius = 1;
  @ViewChild('radiusSlider', { static: false }) radiusSlider!: ElementRef<HTMLInputElement>;
  protected waitingMessage: string | null = null;
  canApplyFilter = true;
  layerNames: { [key: string]: string } = {};
  selectedLayerAction: string = "";

  layerLabels: Record<string, string> = {
    showRestaurant: 'Restaurants',
    showWater: 'Points d\'eau',
    showChurch: 'Églises',
    showGreen: 'Espaces verts',
    // ajoute les autres actions/layers ici
  };

  activeLayers: Set<string> = new Set();


  constructor(private http: HttpClient) {}

  /*********************************************************************

                        Fonctions système (Ng)

   *********************************************************************/

  ngOnInit(): void {

    // par défaut
    this.initMap();

    const overlay = document.querySelector('.ol-overlaycontainer-stopevent') as HTMLElement;
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      overlay.querySelectorAll('*').forEach(el => (el as HTMLElement).style.pointerEvents = 'none');
    }

    this.searchSubject.pipe(
      debounceTime(1000)
    ).subscribe(term => {
      this.performSearch(term);
    });


  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['currentLanguage'] && this.map) {
      const newCenter = this.countryCenters[this.currentLanguage] || this.countryCenters['fr'];

      this.map.getView().animate({
        center: fromLonLat(newCenter),
        zoom: 6,
        duration: 1000
      });
    }

  }




  /** Initialise la carte avec un fond OSM et une couche vide pour les eaux */
  initMap() {
    const center = this.countryCenters[this.currentLanguage] || this.countryCenters['fr'];
    const restaurantSource = new VectorSource();

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

    // Couche Restaurant
    this.restaurantLayer = new VectorLayer({
      source: restaurantSource,
      style: new Style({
        image: new Icon({
          src: '/images/restaurant.png',
          scale: 0.05,
          anchor: [0.5, 1]
        })
      })
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
        this.restaurantLayer,
        this.pinLayer
      ],
      view: new View({
        center: fromLonLat(center),
        zoom: 6,
        minZoom: 3,
        maxZoom: 19
      })
    });

    this.map.on('click', (event) => {
      if (!this.isPinModeActive) return;

      const [lon, lat] = toLonLat(event.coordinate);
      this.placePin(lon, lat);
    });
  }

  /*********************************************************************

                    Fonctions d'interaction map

   *********************************************************************/

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

  toggleLocalisation() {
    this.isLocalisationActive = !this.isLocalisationActive;

    if (this.isLocalisationActive) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            this.userPosition = { lat, lon };

            this.coords = `${lat},${lon}`;

            const view = this.map.getView();
            view.animate({
              center: fromLonLat([lon, lat]),
              zoom: 18,
              duration: 1000
            });
          },
          (error) => {
            console.error("Erreur de géolocalisation :", error);
            alert("Impossible d'accéder à la localisation.");
            this.isLocalisationActive = false;
          }
        );
      } else {
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
        this.isLocalisationActive = false;
      }
    } else {
      const view = this.map.getView();
      const center = this.countryCenters[this.currentLanguage] || this.countryCenters['fr'];
      view.animate({
        center: fromLonLat(center),
        zoom: 6,
        duration: 1000
      });
    }
  }

  toggleFilterCard() {
    this.showFilterCard = !this.showFilterCard;
    if (this.showFilterCard) {
      // Permet de stocker la valeur rayon
      this.currentRadius = this.radius;
    }
  }

  applyFilter() {
    if (!this.selectedLayerAction || !this.canApplyFilter || !this.userPosition || !this.currentRadius || !this.lastAction) return;

    if (typeof (this as any)[this.selectedLayerAction] === 'function') {
      this.radius = this.currentRadius;
      (this as any)[this.selectedLayerAction]();
    }

    this.canApplyFilter = false;
    const delaySec = 6;
    this.waitingMessage = `Veuillez attendre ${delaySec} secondes avant de refiltrer...`;

    setTimeout(() => {
      this.canApplyFilter = true;
      this.waitingMessage = "";
    }, delaySec * 1000);

    this.showFilterCard = false;
  }

  get availableLayers(): string[] {
    return Array.from(this.activeLayers).map(action => this.layerLabels[action]);
  }


  /*********************************************************************

                        Fonctions de conversion

   *********************************************************************/

  /**
   * Convertit la réponse Overpass en features OpenLayers
   */
  private convertOverpassToGeoJSON(data: any) {
    const geojson = {
      type: 'FeatureCollection',
      features: [] as any[]
    };

    data.elements.forEach((element: any) => {

      // ✅ CAS 1 : NODES → Point (restaurants, arbres, etc.)
      if (element.type === 'node') {
        geojson.features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [element.lon, element.lat]
          },
          properties: {
            id: element.id,
            tags: element.tags || {}
          }
        });
        return;
      }

      // Rivières, routes, etc.
      if (element.geometry) {
        const coords = element.geometry.map((g: any) => [g.lon, g.lat]);

        if (element.tags?.waterway) {
          geojson.features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords
            },
            properties: {
              id: element.id,
              type: 'waterway',
              tags: element.tags || {}
            }
          });
        }

        // Parcs, lacs, zones
        else if ((element.type === 'way' || element.type === 'relation') && coords.length >= 3) {
          geojson.features.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [coords]
            },
            properties: {
              id: element.id,
              type: 'area',
              tags: element.tags || {}
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


  /*********************************************************************

            Fonctions de recherche textuelle de ville

   *********************************************************************/

  performSearch(term: string) {
    if (!term.trim()) return;

    // On prend la langue actuelle (FR par défaut)
    const lang = this.currentLanguage?.toLowerCase() || 'fr';

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}&addressdetails=1&limit=10`;

    const headers = { 'Accept-Language': lang };

    this.http.get<NominatimResult[]>(url, { headers }).subscribe({
      next: (results) => {
        // On peut filtrer ou adapter les résultats si nécessaire
        this.searchResults = results.map(r => ({
          ...r,
          display_name: r.display_name // Nominatim renvoie déjà en bonne langue
        }));
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

    const coord = fromLonLat([lon, lat]);

    this.pinLayer.getSource()?.clear();

    const pinFeature = new Feature({
      geometry: new Point(coord)
    });

    // 3️⃣ Applique un style avec une image
    pinFeature.setStyle(
      new Style({
        image: new Icon({
          src: '/images/pin_search.png',
          anchor: [0.5, 1],
          scale: 0.1
        })
      })
    );

    this.pinLayer.getSource()?.addFeature(pinFeature);

    this.map.getView().animate({
      center: fromLonLat([lon, lat]),
      zoom: 13,
      duration: 1000
    });

  }


  private updateCoordsForCity(result: any) {
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);

    const offset = 0.02;

    this.coords = `${lat - offset},${lon - offset},${lat + offset},${lon + offset}`;
    this.userPosition = { lat, lon };
    console.log('Coords mises à jour pour Overpass:', this.coords);
  }


  /*********************************************************************

   Fonctions associées aux actions (water, city, etc...)

   *********************************************************************/

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

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    this.http.get(url).subscribe({
      next: (result: any) => {
        const features = this.convertOverpassToGeoJSON(result);

        const source = this.waterLayer.getSource();
        source?.clear();
        source?.addFeatures(features);
        this.activeLayers.add('showWater');

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

  showGreen() {
    if (this.isLocalisationActive || this.userPosition) {
      console.log("ENTREE DANS ESPACES VERTS");
      const {lat, lon} = this.userPosition ?? {lat: 0, lon: 0};
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
        const features = this.convertOverpassToGeoJSON(result);

        const source = this.greenLayer.getSource();
        source?.clear();
        source?.addFeatures(features);
        this.activeLayers.add('showGreen');
      });
    }
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
          onResult(false);
          return;
        }

        const result = results[0];


        const lon = parseFloat(result.lon);
        const lat = parseFloat(result.lat);
        const offset = 0.02;
        this.coords = `${lat - offset},${lon - offset},${lat + offset},${lon + offset}`;
        this.userPosition = { lat, lon };
        console.log('Coords mises à jour pour Overpass:', this.coords);


        this.zoomToResult(result);


        this.searchTerm = result.display_name;

        onResult(true);
      },
      error: (err) => {
        console.error('Erreur Nominatim:', err);
        onResult(false);
      }
    });
  }

  showRestaurant() {
    let query = "";
    const r = this.radius * 1000;

    if (this.isLocalisationActive || this.userPosition) {
      const { lat, lon } = this.userPosition ?? { lat: 0, lon: 0 };

      query = `
      [out:json];
      (
        node["amenity"="restaurant"](around:${r},${lat},${lon});
        way["amenity"="restaurant"](around:${r},${lat},${lon});
        relation["amenity"="restaurant"](around:${r},${lat},${lon});
      );
      out geom;
    `;
    }

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);


    this.http.get(url).subscribe((result: any) => {
      const features = this.convertOverpassToGeoJSON(result);

      const source = this.restaurantLayer.getSource();
      source?.clear();
      source?.addFeatures(features);
      this.activeLayers.add('showRestaurant');
    });
  }

}
