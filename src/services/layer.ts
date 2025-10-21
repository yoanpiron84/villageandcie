import { Injectable } from '@angular/core';
import { MapService } from './map';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { GeoJSON } from 'ol/format';
import { HttpClient } from '@angular/common/http';
import {SearchService} from './search';
import View from 'ol/View';
import {Feature} from 'ol';
import Point from 'ol/geom/Point';
import {Icon, Style} from 'ol/style';
import {Cluster} from 'ol/source';
import ClusterSource from 'ol/source/Cluster';

@Injectable({ providedIn: 'root' })
export class LayerService {
  public activeLayers: Set<string> = new Set();
  public selectedLayerAction: string = '';
  public layerRadii: { [action: string]: number } = {};
  public currentRadius = 1;
  public showFilterCard = false;
  public canApplyFilter = true;
  coords: string = '';

  layerLabels: Record<string, string> = {
    showRestaurant: 'Restaurants',
    showWater: 'Points d\'eau',
    showChurch: 'Églises & Cathédrales',
    showGreen: 'Espaces verts',
    // ajoute les autres actions/layers ici
  };

  public overpassCache: Map<string, any> = new Map();

  constructor(private mapService: MapService, private searchService: SearchService, private http: HttpClient) {}

  public toggleFilterCard() {
    this.showFilterCard = !this.showFilterCard;
    if (this.showFilterCard && this.selectedLayerAction) {
      this.currentRadius = this.layerRadii[this.selectedLayerAction] ?? 1;
    }
  }

  public applyFilter(newRadius: number) {
    if (!this.selectedLayerAction || !this.canApplyFilter) return;

    this.currentRadius = newRadius;
    this.layerRadii[this.selectedLayerAction] = newRadius;

    if (typeof (this as any)[this.selectedLayerAction] === 'function') {
      (this as any)[this.selectedLayerAction]();
    }

    this.canApplyFilter = false;
    setTimeout(() => this.canApplyFilter = true, 3000);
  }

  public fetchOverpassData(query: string): Promise<any> {
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    const cached = this.overpassCache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject('Timeout Overpass'), 20000);
      this.http.get(url).subscribe({
        next: (result) => {
          clearTimeout(timeout);
          this.overpassCache.set(url, result);
          resolve(result);
        },
        error: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  public convertOverpassToGeoJSON(data: any) {
    const geojson: any = { type: 'FeatureCollection', features: [] };

    // On crée un dictionnaire pour retrouver les éléments par id (pour assembler les membres de relation)
    const elementsById = new Map<number, any>();
    data.elements.forEach((el: any) => elementsById.set(el.id, el));

    data.elements.forEach((element: any) => {
      if (element.type === 'node') {
        geojson.features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [element.lon, element.lat]
          },
          properties: { id: element.id, tags: element.tags || {} }
        });
        return;
      }

      if (element.type === 'way') {
        if (!element.geometry) return;
        const coords = element.geometry.map((g: { lon: number, lat: number }) => [g.lon, g.lat]);

        // Si c'est un polygone fermé (premier et dernier points identiques), on le traite comme Polygon
        const isPolygon = coords.length >= 4 &&
          coords[0][0] === coords[coords.length -1][0] &&
          coords[0][1] === coords[coords.length -1][1];

        if (isPolygon) {
          geojson.features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: { id: element.id, tags: element.tags || {} }
          });

          const lons = coords.map((c: [number, number]) => c[0]);
          const lats = coords.map((c: [number, number]) => c[1]);
          const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
          const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;

          geojson.features.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [centerLon, centerLat]
            },
            properties: {
              id: element.id,
              isIconPoint: true,
              tags: element.tags || {}
            }
          });
        } else {
          // Sinon c'est une ligne
          geojson.features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { id: element.id, tags: element.tags || {} }
          });
        }
        return;
      }

      if (element.type === 'relation' && element.tags?.type === 'multipolygon') {
        if (!element.members) return;

        const outers: any[] = [];
        const inners: any[] = [];

        element.members.forEach((member: any) => {
          if (!member || !member.geometry) return;

          const coords = member.geometry.map((g: any) => [g.lon, g.lat]);
          if (member.role === 'outer') outers.push(coords);
          else if (member.role === 'inner') inners.push(coords);
        });

        if (outers.length === 0) return;

        const polygons = outers.map(outer => [outer, ...inners]);

        geojson.features.push({
          type: 'Feature',
          geometry: {
            type: polygons.length > 1 ? 'MultiPolygon' : 'Polygon',
            coordinates: polygons.length > 1 ? polygons : polygons[0]
          },
          properties: { id: element.id, tags: element.tags || {} }
        });

        // Optionnel : ajoute une feature Point pour l'icône, au centre de la relation
        // Calculer le centre de la bounding box de la géométrie
        // ici on utilise le premier polygon uniquement pour le point d'icône

        const flatCoords = outers[0]; // prendre le premier contour extérieur
        type Coord = [number, number];
        const lons = flatCoords.map((c: Coord) => c[0]);
        const lats = flatCoords.map((c: Coord) => c[1]);

        const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;

        console.log(centerLat, centerLon);
        console.log(geojson.features);
        geojson.features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [centerLon, centerLat] },
          properties: { id: element.id, isIconPoint: true, tags: element.tags || {} }
        });
      }
    });

    // Conversion finale en features OL
    return new GeoJSON().readFeatures(geojson, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });
  }


  zoomToResult(result: any) {
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);

    console.log('Zoom sur :', lon, lat);

    const coord = fromLonLat([lon, lat]);

    this.mapService.pinLayer.getSource()?.clear();

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

    this.mapService.pinLayer.getSource()?.addFeature(pinFeature);

    this.mapService.map.getView().animate({
      center: fromLonLat([lon, lat]),
      zoom: 13,
      duration: 1000
    });

  }

  updateCoordsForCity(result: any) {
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);

    const offset = 0.02;

    this.coords = `${lat - offset},${lon - offset},${lat + offset},${lon + offset}`;
    this.mapService.userPosition = { lat, lon };
    console.log('Coords mises à jour pour Overpass:', this.coords);
  }

  get availableLayers(): string[] {
    return Array.from(this.activeLayers).map(action => this.layerLabels[action]);
  }


  public showWater() {
    if (!this.mapService.userPosition) return;
    const { lat, lon } = this.mapService.userPosition;
    const r = (this.layerRadii['showWater'] || 1) * 1000;
    const delta = r / 111320;
    const minLat = lat - delta, maxLat = lat + delta, minLon = lon - delta, maxLon = lon + delta;

    const query = `[out:json];
      (way["waterway"~"river|stream|canal|drain"](${minLat},${minLon},${maxLat},${maxLon});
      relation["waterway"~"river|stream|canal|drain"](${minLat},${minLon},${maxLat},${maxLon}););
      out geom;`;

    this.fetchOverpassData(query).then((result: any) => {
      const features = this.convertOverpassToGeoJSON(result);
      const source = this.mapService.waterLayer.getSource();
      source?.clear();
      source?.addFeatures(features);
      this.activeLayers.add('showWater');
      this.selectedLayerAction = 'showWater';
      if (features.length > 0) this.mapService.map.getView().fit(source!.getExtent(), { padding: [50, 50, 50, 50] });
    }).catch(err => console.error('Erreur Overpass API (water):', err));
  }

  public hideWater() { const source = this.mapService.waterLayer.getSource(); source?.clear(); this.activeLayers.delete('showWater'); this.selectedLayerAction = Array.from(this.activeLayers)[0] || ''; }

  public showGreen() {
    if (!this.mapService.userPosition) return;
    const { lat, lon } = this.mapService.userPosition;
    const r = (this.layerRadii['showGreen'] || 1) * 1000;
    const delta = r / 111320;
    const minLat = lat - delta, maxLat = lat + delta, minLon = lon - delta, maxLon = lon + delta;

    const query = `[out:json];
      (way["leisure"~"park|garden|nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});
      relation["leisure"~"park|garden|nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});
      way["landuse"~"forest|grass|meadow"](${minLat},${minLon},${maxLat},${maxLon});
      relation["landuse"~"forest|grass|meadow"](${minLat},${minLon},${maxLat},${maxLon});
      way["natural"="wood"](${minLat},${minLon},${maxLat},${maxLon});
      relation["natural"="wood"](${minLat},${minLon},${maxLat},${maxLon}););
      out geom;`;

    this.fetchOverpassData(query).then((result: any) => {
      const features = this.convertOverpassToGeoJSON(result);
      const source = this.mapService.greenLayer.getSource();
      source?.clear();
      source?.addFeatures(features);
      this.activeLayers.add('showGreen');
      this.selectedLayerAction = 'showGreen';
      if (features.length > 0) this.mapService.map.getView().fit(source!.getExtent(), { padding: [50, 50, 50, 50] });
    }).catch(err => console.error('Erreur Overpass API (green):', err));
  }

  hideGreen() { const source = this.mapService.greenLayer.getSource(); source?.clear(); this.activeLayers.delete('showGreen'); this.selectedLayerAction = Array.from(this.activeLayers)[0] || ''; }

  showCity(cityName: string, onResult: (found: boolean) => void): void {
    if (!cityName || !cityName.trim()) {
      onResult(false);
      return;
    }

    const url = `/api/search?format=json&q=${encodeURIComponent(cityName)}&addressdetails=1&limit=1`;

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
        this.mapService.userPosition = { lat, lon };
        console.log('Coords mises à jour pour Overpass:', this.coords);

        this.zoomToResult(result);


        this.searchService.searchTerm = result.display_name;

        onResult(true);
      },
      error: (err) => {
        console.error('Erreur Nominatim:', err);
        onResult(false);
      }
    });
  }

  public showRestaurant() {
    if (!this.mapService.userPosition) return;
    const { lat, lon } = this.mapService.userPosition;
    const r = (this.layerRadii['showRestaurant'] || 1) * 1000;

    const query = `[out:json];
      (node["amenity"="restaurant"](around:${r},${lat},${lon});
      way["amenity"="restaurant"](around:${r},${lat},${lon});
      relation["amenity"="restaurant"](around:${r},${lat},${lon}););
      out geom;`;

    this.fetchOverpassData(query).then((result: any) => {
      const features = this.convertOverpassToGeoJSON(result);
      features.forEach((f: any) => { f.set('name', f.get('tags')?.name || 'Restaurant'); });
      const source = this.mapService.restaurantLayer.getSource();
      source?.clear();
      source?.addFeatures(features);
      this.activeLayers.add('showRestaurant');
      this.selectedLayerAction = 'showRestaurant';
    }).catch(err => console.error('Erreur Overpass API (restaurant):', err));
  }

  public hideRestaurant() { const source = this.mapService.restaurantLayer.getSource(); source?.clear(); this.activeLayers.delete('showRestaurant'); this.selectedLayerAction = Array.from(this.activeLayers)[0] || ''; }

  public showChurch() {
    if (!this.mapService.userPosition) return;
    const { lat, lon } = this.mapService.userPosition;
    const r = (this.layerRadii['showChurch'] || 1) * 1000;

    const query = `[out:json];
      (node["amenity"="place_of_worship"](around:${r},${lat},${lon});
      way["amenity"="place_of_worship"](around:${r},${lat},${lon});
      relation["amenity"="place_of_worship"](around:${r},${lat},${lon}););
      out geom;`;

    this.fetchOverpassData(query).then((result: any) => {
      const features = this.convertOverpassToGeoJSON(result);
      // features.forEach((f: any) => { f.set('name', f.get('tags')?.name || 'Église'); });
      const iconPoints = features.filter(f => {
        const geom = f.getGeometry();
        return geom instanceof Point || f.get('isIconPoint');
      });

      iconPoints.forEach((f: any) => {
        const tags = f.getProperties().tags || {};
        f.set('tags', tags);
      });

      const rawSource = (this.mapService.churchLayer.getSource() as ClusterSource)?.getSource();
      rawSource?.clear();
      rawSource?.addFeatures(iconPoints);



      this.activeLayers.add('showChurch');
      this.selectedLayerAction = 'showChurch';
    }).catch(err => console.error('Erreur Overpass API (church):', err));
  }

  public hideChurch() { const source = this.mapService.churchLayer.getSource(); source?.clear(); this.activeLayers.delete('showChurch'); this.selectedLayerAction = Array.from(this.activeLayers)[0] || ''; }



  public showHotel() {
    if (!this.mapService.userPosition) return;
    const { lat, lon } = this.mapService.userPosition;
    const r = (this.layerRadii['showHotel'] || 1) * 1000;

    const query = `[out:json];
    (
      node["tourism"="hotel"](around:${r},${lat},${lon});
      way["tourism"="hotel"](around:${r},${lat},${lon});
      relation["tourism"="hotel"](around:${r},${lat},${lon});
    );
    out geom;`;

    console.log(query);

    this.fetchOverpassData(query).then((result: any) => {
      const features = this.convertOverpassToGeoJSON(result);
      features.forEach((f: any) => {
        f.set('name', f.get('tags')?.name || 'Hôtel');
      });
      const clusterSource = this.mapService.hotelLayer.getSource() as Cluster;
      const hotelSource = clusterSource.getSource();
      if (hotelSource) {
        hotelSource.clear();
        hotelSource.addFeatures(features);
      }

      this.activeLayers.add('showHotel');
      this.selectedLayerAction = 'showHotel';
    }).catch(err => console.error('Erreur Overpass API (hotel):', err));
  }

  public hideHotel() {
    const source = this.mapService.hotelLayer.getSource();
    source?.clear();
    this.activeLayers.delete('showHotel');
    this.selectedLayerAction = Array.from(this.activeLayers)[0] || '';
  }


}
