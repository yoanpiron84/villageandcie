import {Injectable, Input, OnInit, SimpleChanges} from '@angular/core';
import { MapService } from './map';
import {fromLonLat, toLonLat} from 'ol/proj';
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

import {environment} from '../environnements/environnement';
import VectorLayer from 'ol/layer/Vector';
import {Geometry} from 'ol/geom';
import {getCenter} from 'ol/extent';
import {LanguageService} from './language';

interface CustomEntity {
  _id: string | number;
  type: string;
  name: string;
  coords: { lat: number; lon: number };
  tags: Record<string, any>;
}


@Injectable({ providedIn: 'root' })
export class LayerService {
  public activeLayers: Set<string> = new Set();
  public selectedLayerAction: string = '';
  public layerRadii: { [action: string]: number } = {};
  public currentRadius = 1;
  public showFilterCard = false;
  public canApplyFilter = true;
  coords: string = '';
  @Input() translations: Record<string, string> = {};

  layerLabels: Record<string, string> = {};

  public overpassCache: Map<string, any> = new Map();

  customTagsMap = new Map<string, any>();

  constructor(private mapService: MapService, private searchService: SearchService, private http: HttpClient, private languageService: LanguageService) {}

  public initLayerLabels() {
    // labels généraux
    this.layerLabels = {
      showRestaurant: this.translations["restaurant"] || 'Restaurant',
      showWater: this.translations["water"] || 'Points d\'eau',
      showChurch: this.translations["church"] || 'Église',
      showGreen: this.translations["green_space"] || 'Espaces verts',
      showHotel: this.translations["hotel"] || 'Hôtels',
    };

    // labels alimentaires dynamiques depuis environment
    const lang = this.languageService.currentLanguage || 'fr';
    const shopMap = environment.shopTagMap[lang];
    Object.entries(shopMap).forEach(([label, keyInternal]) => {
      const actionKey = `showAlimentaire('${keyInternal}')`;
      this.layerLabels[actionKey] = this.translations[keyInternal] || keyInternal.charAt(0).toUpperCase() + keyInternal.slice(1);
    });

  }


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
    } else if (this.selectedLayerAction.startsWith("showAlimentaire(")){
      const param = this.selectedLayerAction.match(/\(([^)]+)\)/)?.[1]?.replace(/['"]/g, '') || 'alimentaire';
      const lang = this.languageService.currentLanguage;
      this.showAlimentaire(param, lang, false);
    }


    this.canApplyFilter = false;
    setTimeout(() => this.canApplyFilter = true, 3000);
  }

  private isFeatureWithinRadius(feature: Feature<Geometry>, layerName: string): boolean {
    if (!this.mapService.userPosition) return false;
    const geom = feature.getGeometry();
    if (!geom) return false;

    let center: [number, number];

    if (geom instanceof Point) {
      center = toLonLat(geom.getCoordinates()) as [number, number];
    } else {
      const extent = geom.getExtent();
      center = toLonLat(getCenter(extent)) as [number, number];
    }

    const radiusKm = this.layerRadii[layerName] ?? this.currentRadius;
    const distanceMeters = this.getDistanceInMeters(
      [this.mapService.userPosition.lon, this.mapService.userPosition.lat],
      center
    );

    return distanceMeters <= radiusKm * 1000;
  }

  private getDistanceInMeters(coord1: [number, number], coord2: [number, number]): number {
    const toRad = (deg: number) => deg * Math.PI / 180;
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371000; // m
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }


  public fetchOverpassAndCustom(query: string, type?: string): Promise<any> {
    // 1️⃣ Fetch OSM via Overpass
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    const cached = this.overpassCache.get(url);

    const osmPromise = cached !== undefined
      ? Promise.resolve(cached)
      : new Promise((resolve, reject) => {
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

    // 2️⃣ Détermination des collections à fetcher
    let collections: { mongo: string, typeReal: string }[] = [];
    if (type) {
      let collection = type.toLowerCase();
      if (collection.startsWith('show')) collection = collection.slice(4);

      if (collection.startsWith('alimentaire(')) {
        let inner = collection.match(/\((.*?)\)/)?.[1];
        if (inner != null) inner = inner.slice(1, -1);

        if (inner === 'alimentaire') {
          collections = Object.keys(environment.iconMap)
            .filter(c => c !== 'alimentaire')
            .map(c => ({
              mongo: c.endsWith('s') ? c : c + 's',
              typeReal: c
            }));
        } else if (inner) {
          const mongo = inner.endsWith('s') ? inner : inner + 's';
          collections = [{ mongo, typeReal: inner }];
        }
      } else {
        if (!collection.endsWith('s')) collection += 's';
        collections = [{ mongo: collection, typeReal: collection.replace(/s$/, '') }];
      }
    }

    // 3️⃣ Récupération des customData via la nouvelle route GET /entity
    const typesQuery = collections.map(c => c.mongo).join(',');
    console.log(`http://localhost:3000/nodejs/entity?types=${typesQuery}`);
    const customPromise = typesQuery
      ? this.http.get<any[]>(`http://localhost:3000/nodejs/entity?types=${typesQuery}`).toPromise()
        .then(allData => {
          const safeData = allData || []; // ✅ fallback si undefined
          return collections.map(c => ({
            collection: c.mongo,
            type: c.typeReal,
            customData: safeData.filter(d => d.type && d.type.toLowerCase().includes(c.typeReal))
          }));
        })
        .catch(() => collections.map(c => ({ collection: c.mongo, type: c.typeReal, customData: [] })))
      : Promise.resolve([]);

    // 4️⃣ Fusion Overpass + MongoDB
    return Promise.all([osmPromise, customPromise]).then(([osmData, allCustom]) => {
      const osmSafe = (osmData && typeof osmData === 'object' && Array.isArray(osmData.elements))
        ? osmData
        : { elements: [] };

      const mergedData = JSON.parse(JSON.stringify(osmSafe));

      allCustom.forEach(({ type, customData }) => {
        customData.forEach(c => {
          mergedData.elements.push({
            type: 'node',
            id: `custom_${type}_${c._id}`,
            lat: c.coords.lat,
            lon: c.coords.lon,
            tags: {
              ...c.tags,
              name: c.name,
              opening_hours: c.hours
            }
          });
        });
      });

      return {
        mergedData,
        customDataByCollection: allCustom // [{ collection, type, customData }, ...]
      };
    });
  }










  public convertOverpassToGeoJSON(data: any) {
    const geojson: any = { type: 'FeatureCollection', features: [] };

    // Vérifie que data et data.elements existent et sont un tableau
    if (!data || !Array.isArray(data.elements)) {
      console.warn('convertOverpassToGeoJSON: data.elements est manquant ou invalide', data);
      return [];
    }

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
    const radiusMeters = (this.layerRadii['showWater'] || 0.5) * 1000;
    const delta = radiusMeters / 111320;
    const minLat = lat - delta, maxLat = lat + delta;
    const minLon = lon - delta, maxLon = lon + delta;

    const overpassQuery = `[out:json];
  (way["waterway"~"river|stream|canal|drain"](${minLat},${minLon},${maxLat},${maxLon});
   relation["waterway"~"river|stream|canal|drain"](${minLat},${minLon},${maxLat},${maxLon}););
  out geom;`;

    this.fetchOverpassAndCustom(overpassQuery, 'water')
      .then(result => {
        const features = this.convertOverpassToGeoJSON(result.mergedData);
        const source = this.mapService.waterLayer.getSource() as VectorSource<any>;
        source?.clear();

        const allCustom = (result.customDataByCollection || []).flatMap((c: any) => c.customData);

        features.forEach((f: Feature<Geometry>) => {
          // Filtrage par rayon
          if (!this.isFeatureWithinRadius(f, 'showWater')) {
            f.setStyle(new Style({}));
          } else {
            f.setStyle(undefined);
          }

          const geom = f.getGeometry();
          if (!geom) return;

          let tags = f.get('tags') || {};
          let match: any = null;

          // --------------------
          //      POINTS
          // --------------------
          if (geom instanceof Point) {
            const center = toLonLat(geom.getCoordinates()) as [number, number];
            const key = `${center[0]}_${center[1]}`;

            match = allCustom.find((c: any) =>
              Math.abs(c.coords.lat - center[1]) < 1e-6 &&
              Math.abs(c.coords.lon - center[0]) < 1e-6
            );

            if (match) {
              f.set('tags', { ...tags, ...match.tags, name: match.name });
              this.customTagsMap.set(key, f.get('tags'));
              console.log("MATCH: ",key, tags);
            } else {
              const localTags = this.customTagsMap.get(key);
              if (localTags) f.set('tags', localTags);
              console.log("UNMATCH LOCAL: ",localTags);
            }

            if (!f.get('type')) f.set('type', 'water');
            tags = f.get('tags') || {};
            if (!tags.name) f.set('tags', { ...tags, name: this.translations['waterway'] || 'Waterway' });
          }

            // --------------------
            //   LINE / POLYGON
          // --------------------
          else if (
            geom.getType() === 'LineString' ||
            geom.getType() === 'Polygon' ||
            geom.getType() === 'MultiPolygon'
          ) {
            const extent = geom.getExtent();
            const [centerX, centerY] = getCenter(extent);
            const center = toLonLat([centerX, centerY]) as [number, number];
            const key = `${center[0]}_${center[1]}`;

            match = allCustom.find((c: any) =>
              Math.abs(c.coords.lat - center[1]) < 1e-6 &&
              Math.abs(c.coords.lon - center[0]) < 1e-6
            );

            if (match) {
              f.set('tags', { ...tags, ...match.tags, name: match.name });
              this.customTagsMap.set(key, f.get('tags'));
            } else {
              const localTags = this.customTagsMap.get(key);
              if (localTags) f.set('tags', localTags);
            }

            if (!f.get('type')) f.set('type', 'water');
            tags = f.get('tags') || {};
            if (!tags.name) f.set('tags', { ...tags, name: this.translations['waterway'] || 'Waterway' });
          }
        });

        // Ajout des features à la couche
        source?.addFeatures(features);

        // Mise à jour état
        this.activeLayers.add('showWater');
        this.selectedLayerAction = 'showWater';

        // Fit map sur les features
        if (features.length > 0) {
          this.mapService.map.getView().fit(source!.getExtent(), { padding: [50, 50, 50, 50] });
        }
      })
      .catch(err => console.error('Erreur showWater:', err));
  }





  public hideWater() { const source = this.mapService.waterLayer.getSource(); source?.clear(); this.activeLayers.delete('showWater'); this.selectedLayerAction = Array.from(this.activeLayers)[0] || ''; }

  public showGreen() {
    if (!this.mapService.userPosition) return;

    const { lat, lon } = this.mapService.userPosition;
    const radiusMeters = (this.layerRadii['showGreen'] || 0.5) * 1000;
    const delta = radiusMeters / 111320;
    const minLat = lat - delta, maxLat = lat + delta, minLon = lon - delta, maxLon = lon + delta;

    const overpassQuery = `[out:json];
    (way["leisure"~"park|garden|nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});
     relation["leisure"~"park|garden|nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});
     way["landuse"~"forest|grass|meadow"](${minLat},${minLon},${maxLat},${maxLon});
     relation["landuse"~"forest|grass|meadow"](${minLat},${minLon},${maxLat},${maxLon});
     way["natural"="wood"](${minLat},${minLon},${maxLat},${maxLon});
     relation["natural"="wood"](${minLat},${minLon},${maxLat},${maxLon}););
    out geom;`;

    this.fetchOverpassAndCustom(overpassQuery, 'green')
      .then(result => {
        const features = this.convertOverpassToGeoJSON(result.mergedData);
        const source = this.mapService.greenLayer.getSource() as VectorSource<any>;
        source?.clear();

        features.forEach((f: Feature<Geometry>) => {
          if (!this.isFeatureWithinRadius(f, 'showGreen')) {
            f.setStyle(new Style({}));
          } else {
            f.setStyle(undefined);
          }

          const geom = f.getGeometry();
          if (!geom) return;

          let center: [number, number];

          if (geom instanceof Point) {
            center = toLonLat(geom.getCoordinates()) as [number, number];
            const key = `${center[0]}_${center[1]}`;

            // Cherche un match custom pour les points uniquement
            const match = (result.customData as CustomEntity[]).find(c =>
              Math.abs(c.coords.lat - center[1]) < 1e-6 &&
              Math.abs(c.coords.lon - center[0]) < 1e-6
            );

            if (match) {
              // Merge tags custom + Overpass et stocker dans la map
              f.set('tags', { ...f.get('tags'), ...match.tags, name: match.name });
              this.customTagsMap.set(key, f.get('tags'));
            } else {
              // Récupère tags précédemment stockés si existant
              const localTags = this.customTagsMap.get(key);
              if (localTags) f.set('tags', localTags);
            }

            // Toujours définir un type pour éviter "unknown"
            if (!f.get('type')) f.set('type', 'green');

            // Toujours définir un nom générique si absent
            const tags = f.get('tags') || {};
            if (!tags.name) f.set('tags', { ...tags, name: this.translations['green_space'] || 'Green space' });

          } else if (geom.getType() === 'LineString' || geom.getType() === 'Polygon' || geom.getType() === 'MultiPolygon') {
            const tags = f.get('tags') || {};
            // Définit type + nom générique pour les formes
            f.set('type', f.get('type') || 'green');
            if (!tags.name) f.set('tags', { ...tags, name: this.translations['green_space'] || 'Green space' });
          }
        });



        source?.addFeatures(features);
        this.activeLayers.add('showGreen');
        this.selectedLayerAction = 'showGreen';

        if (features.length > 0) {
          this.mapService.map.getView().fit(source!.getExtent(), { padding: [50, 50, 50, 50] });
        }
      })
      .catch(err => console.error('Erreur showGreen:', err));
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
    const radiusKey = 'showRestaurant';
    const radiusMeters = (this.layerRadii[radiusKey] || 0.5) * 1000;

    const overpassQuery = `[out:json];
    (node["amenity"="restaurant"](around:${radiusMeters},${lat},${lon});
     way["amenity"="restaurant"](around:${radiusMeters},${lat},${lon});
     relation["amenity"="restaurant"](around:${radiusMeters},${lat},${lon}););
    out geom;`;

    this.fetchOverpassAndCustom(overpassQuery, 'restaurant')
      .then(result => {
        const features = this.convertOverpassToGeoJSON(result.mergedData);
        const source = this.mapService.restaurantLayer.getSource() as VectorSource<any>;
        source?.clear();

        features.forEach((f: Feature<Geometry>) => {
          const geom = f.getGeometry();
          if (!geom) return;

          let center: [number, number];

          // Calcul du centre selon type de géométrie
          if (geom instanceof Point) {
            center = toLonLat(geom.getCoordinates()) as [number, number];
          } else {
            const [centerX, centerY] = getCenter(geom.getExtent());
            center = toLonLat([centerX, centerY]) as [number, number];
          }

          // Filtrage par rayon
          if (!this.isFeatureWithinRadius(f, radiusKey)) {
            f.setStyle(new Style({})); // invisible
          } else {
            f.setStyle(undefined); // style normal

            // Fusion tags custom si match
            let match: any = undefined;

            if ('customDataByCollection' in result) {
              for (const { customData } of result.customDataByCollection as any[]) {
                match = (customData as any[]).find(c =>
                  Math.abs(c.coords.lat - center[1]) < 1e-6 &&
                  Math.abs(c.coords.lon - center[0]) < 1e-6
                );
                if (match) break;
              }
            } else if ('customData' in result) {
              match = (result.customData as any[]).find(c =>
                Math.abs(c.coords.lat - center[1]) < 1e-6 &&
                Math.abs(c.coords.lon - center[0]) < 1e-6
              );
            }

            let tags = f.get('tags') || {};
            if (match) {
              tags = { ...tags, ...match.tags, name: match.name };
              this.customTagsMap.set(`${center[0]}_${center[1]}`, tags);
            } else {
              const localTags = this.customTagsMap.get(`${center[0]}_${center[1]}`);
              if (localTags) tags = localTags;
            }

            f.set('tags', tags);

            if (!f.get('type') || f.get('type') === 'amenity') f.set('type', 'restaurant');
          }

        });

        // Ajout des features à la source
        source?.addFeatures(features);

        // Mise à jour des layers actifs
        this.activeLayers.add(radiusKey);
        this.selectedLayerAction = radiusKey;

        // Fit map sur les features
        if (features.length > 0) {
          source && this.mapService.map.getView().fit(source.getExtent(), { padding: [50, 50, 50, 50] });
        }

      })
      .catch(err => console.error('Erreur showRestaurant:', err));
  }


  public hideRestaurant() { const source = this.mapService.restaurantLayer.getSource(); source?.clear(); this.activeLayers.delete('showRestaurant'); this.selectedLayerAction = Array.from(this.activeLayers)[0] || ''; }

  public showChurch() {
    if (!this.mapService.userPosition) return;

    const { lat, lon } = this.mapService.userPosition;
    const radiusKey = 'showChurch';
    const radiusMeters = (this.layerRadii[radiusKey] || 0.5) * 1000;

    const overpassQuery = `[out:json];
    (node["amenity"="place_of_worship"](around:${radiusMeters},${lat},${lon});
     way["amenity"="place_of_worship"](around:${radiusMeters},${lat},${lon});
     relation["amenity"="place_of_worship"](around:${radiusMeters},${lat},${lon}););
    out geom;`;

    this.fetchOverpassAndCustom(overpassQuery, 'church')
      .then(result => {
        const features = this.convertOverpassToGeoJSON(result.mergedData);

        const clusterFeatures: Feature<Point>[] = [];
        const otherFeatures: Feature<Geometry>[] = [];

        features.forEach(f => {
          const geom = f.getGeometry();
          if (!geom) return;

          let center: [number, number];
          if (geom instanceof Point) {
            center = toLonLat(geom.getCoordinates()) as [number, number];
          } else {
            const [cx, cy] = getCenter(geom.getExtent());
            center = toLonLat([cx, cy]) as [number, number];
          }

          // Vérifie le rayon
          if (!this.isFeatureWithinRadius(f, radiusKey)) return;

          const featureId = `${center[0]}_${center[1]}`;
          f.setId(featureId);

          // Fusion tags custom
          let tags = f.get('tags') || {};
          let match: any = undefined;

          if ('customDataByCollection' in result) {
            for (const { customData } of result.customDataByCollection as any[]) {
              match = (customData as any[]).find(c =>
                Math.abs(c.coords.lat - center[1]) < 1e-6 &&
                Math.abs(c.coords.lon - center[0]) < 1e-6
              );
              if (match) break;
            }
          } else if ('customData' in result) {
            match = (result.customData as any[]).find(c =>
              Math.abs(c.coords.lat - center[1]) < 1e-6 &&
              Math.abs(c.coords.lon - center[0]) < 1e-6
            );
          }

          if (match) {
            tags = { ...tags, ...match.tags, name: match.name };
            this.customTagsMap.set(featureId, tags);
          } else {
            const localTags = this.customTagsMap.get(featureId);
            if (localTags) tags = localTags;
          }

          f.setProperties({ ...f.getProperties(), tags, type: 'church' });

          // Cluster ou autre feature
          const rawSource = (this.mapService.churchLayer.getSource() as ClusterSource)?.getSource();
          const existing = rawSource?.getFeatureById(featureId);

          if (existing) {
            existing.setProperties(f.getProperties());
            existing.setGeometry(f.getGeometry());
          } else {
            if (geom instanceof Point || f.get('isIconPoint')) {
              clusterFeatures.push(f as Feature<Point>);
            } else {
              otherFeatures.push(f);
            }
          }
        });

        // Ajout aux sources
        const rawSource = (this.mapService.churchLayer.getSource() as ClusterSource)?.getSource();
        rawSource?.clear();
        rawSource?.addFeatures(clusterFeatures);

        this.activeLayers.add(radiusKey);
        this.selectedLayerAction = radiusKey;

      })
      .catch(err => console.error('Erreur showChurch:', err));
  }




  public hideChurch() {

    const clusterSource = this.mapService.churchLayer.getSource() as ClusterSource;
    const rawSource = clusterSource?.getSource();

    // Clear les deux : ClusterSource et Raw Source
    clusterSource?.clear();
    rawSource?.clear();

    this.activeLayers.delete('showChurch');
    this.selectedLayerAction = Array.from(this.activeLayers)[0] || '';
  }



  public showHotel() {
    if (!this.mapService.userPosition) return;

    const { lat, lon } = this.mapService.userPosition;
    const radiusKey = 'showHotel';
    const radiusMeters = (this.layerRadii[radiusKey] || 0.5) * 1000;

    const overpassQuery = `[out:json];
  (
    node["tourism"="hotel"](around:${radiusMeters},${lat},${lon});
    way["tourism"="hotel"](around:${radiusMeters},${lat},${lon});
    relation["tourism"="hotel"](around:${radiusMeters},${lat},${lon});
  );
  out geom;`;

    this.fetchOverpassAndCustom(overpassQuery, 'hotel')
      .then(result => {
        const features = this.convertOverpassToGeoJSON(result.mergedData);

        const clusterFeatures: Feature<Point>[] = [];
        const otherFeatures: Feature<Geometry>[] = [];

        features.forEach(f => {
          const geom = f.getGeometry();
          if (!geom) return;

          // Calcul du centre
          let center: [number, number];
          if (geom instanceof Point) {
            center = toLonLat(geom.getCoordinates()) as [number, number];
          } else {
            const extent = geom.getExtent();
            const [centerX, centerY] = getCenter(extent);
            center = toLonLat([centerX, centerY]) as [number, number];
          }

          // Vérifie le rayon
          if (!this.isFeatureWithinRadius(f, radiusKey)) return;

          // ID stable basé sur coordonnées arrondies
          const featureId = `${center[0]}_${center[1]}`;
          f.setId(featureId);

          // Fusion des tags custom
          let tags = f.get('tags') || {};
          let match: any = undefined;

          if ('customDataByCollection' in result) {
            for (const { customData } of result.customDataByCollection as any[]) {
              match = (customData as any[]).find(c =>
                Math.abs(c.coords.lat - center[1]) < 1e-6 &&
                Math.abs(c.coords.lon - center[0]) < 1e-6
              );
              if (match) break;
            }
          } else if ('customData' in result) {
            match = (result.customData as any[]).find(c =>
              Math.abs(c.coords.lat - center[1]) < 1e-6 &&
              Math.abs(c.coords.lon - center[0]) < 1e-6
            );
          }

          if (match) {
            tags = { ...tags, ...match.tags, name: match.name };
            this.customTagsMap.set(featureId, tags);
          } else {
            const localTags = this.customTagsMap.get(featureId);
            if (localTags) tags = localTags;
          }

          f.setProperties({ ...f.getProperties(), tags, type: 'hotel' });

          // Gestion cluster / feature unique
          const rawSource = (this.mapService.hotelLayer.getSource() as ClusterSource)?.getSource();
          const existing = rawSource?.getFeatureById(featureId);

          if (existing) {
            existing.setProperties(f.getProperties());
            existing.setGeometry(f.getGeometry());
          } else {
            if (geom instanceof Point || f.get('isIconPoint')) {
              clusterFeatures.push(f as Feature<Point>);
            } else {
              otherFeatures.push(f);
            }
          }
        });

        // Mise à jour du ClusterSource
        const rawSource = (this.mapService.hotelLayer.getSource() as ClusterSource)?.getSource();
        rawSource?.clear();
        rawSource?.addFeatures(clusterFeatures);

        this.activeLayers.add(radiusKey);
        this.selectedLayerAction = radiusKey;
      })
      .catch(err => console.error('Erreur showHotel:', err));
  }




  public hideHotel() {
    const clusterSource = this.mapService.hotelLayer.getSource() as ClusterSource;
    const rawSource = clusterSource?.getSource();

    // Clear les deux : ClusterSource et Raw Source
    clusterSource?.clear();
    rawSource?.clear();

    this.activeLayers.delete('showHotel');
    this.selectedLayerAction = Array.from(this.activeLayers)[0] || '';
  }
  //
  // // public showAlimAction(param: string, lang: string){
  // //
  // //   const lowerParam = param.toLowerCase();
  // //
  // //   const shopMap = environment.shopTagMap[lang] as Record<string, string>;
  // //
  // //   this.showAlimentaire(shopMap[param])
  // // }
  //

  public showAlimentaire(param: string, lang: string, firstTime: boolean) {
    if (!this.mapService.userPosition) return;
    const { lat, lon } = this.mapService.userPosition;

    const shopMapLang = environment.shopTagMap[lang] || {};
    const iconMap = environment.iconMap;

    const lowerParam = param.toLowerCase();
    const shopFilter = firstTime ? shopMapLang[lowerParam] || lowerParam : lowerParam;

    // Détermine les layers à afficher
    let layersToShow: VectorLayer<any>[] = [];
    if (shopFilter === 'alimentaire') {
      layersToShow = Object.values(this.mapService.alimentaireLayer);
    } else {
      const layer = this.mapService.alimentaireLayer?.[shopFilter];
      if (layer) layersToShow.push(layer);
    }

    if (!layersToShow.length) {
      console.warn(`Aucune couche trouvée pour '${shopFilter}'`);
      return;
    }

    const actionKey = `showAlimentaire('${shopFilter}')`;
    const radiusMeters = (this.layerRadii[actionKey] || 0.5) * 1000;

    // Prépare la query Overpass
    let shopQuery = shopFilter;
    if (shopFilter === 'alimentaire') shopQuery = Object.values(shopMapLang).join('|');
    if (shopQuery === 'organic') shopQuery = '."]["organic"~"^(yes|only)$';
    if (shopQuery === 'beer') shopQuery = '(beer|brewery)';

    let query: string;
    if (shopFilter === 'pastry') {
      query = `[out:json];
(nwr[shop=bakery][pastry=yes](around:${radiusMeters},${lat},${lon}););
out geom;`;
      layersToShow = [this.mapService.alimentaireLayer['bakery']];
    } else {
      query = `[out:json];
(nwr[~"^(shop|amenity)$"~"${shopQuery}"](around:${radiusMeters},${lat},${lon}););
out geom;`;
    }

    this.fetchOverpassAndCustom(query, actionKey)
      .then(result => {
        const features = this.convertOverpassToGeoJSON(result.mergedData);
        const iconPoints = features.filter(f => f.getGeometry() instanceof Point)
          .filter(f => this.isFeatureWithinRadius(f, actionKey));

        // Clear previous features
        layersToShow.forEach(layer => {
          const rawSource = (layer.getSource() as ClusterSource)?.getSource();
          if (rawSource) rawSource.clear();
        });

        iconPoints.forEach(f => {
          const geom = f.getGeometry() as Point;
          if (!geom) return;

          const coords = toLonLat(geom.getCoordinates()) as [number, number];
          const featureId = `${coords[1]}_${coords[0]}`; // lat_lon
          f.setId(featureId);

          let tags = f.get('tags') || {};
          let realType = (tags['shop'] || tags['amenity'] || shopFilter).toLowerCase();

          // Merge avec toutes les collections
          (result.customDataByCollection as any[]).forEach(c => {
            const typeReal = c.type; // bakery, spices, etc.
            const customData = c.customData;

            // Vérifie si la feature correspond au type réel
            const types = realType.split(';').map((s: string) => s.trim());
            if (types.includes(typeReal)) {
              const match = customData.find((d: any) =>
                Math.abs(d.coords.lat - coords[1]) < 1e-5 &&
                Math.abs(d.coords.lon - coords[0]) < 1e-5
              );

              if (match) {
                tags = { ...tags, ...match.tags, name: match.name };
              }
            }
          });

          this.customTagsMap.set(featureId, tags);

          const icon = (realType in iconMap)
            ? iconMap[realType as keyof typeof iconMap]
            : iconMap['alimentaire'];

          f.setProperties({
            ...f.getProperties(),
            tags,
            type: realType,
            name: tags['name'] || tags['brand'] || this.translations[shopFilter] || 'Commerce alimentaire',
            icon
          });
        });

        // Injecte les features dans les layers
        layersToShow.forEach(layer => {
          const rawSource = (layer.getSource() as ClusterSource)?.getSource();
          if (!rawSource) return;

          const layerKey = Object.entries(this.mapService.alimentaireLayer)
            .find(([key, l]) => l === layer)?.[0];
          if (!layerKey) return;

          const featuresForLayer = iconPoints.filter(f => {
            const types = (f.get('type') as string).split(';').map(s => s.trim());
            return layerKey === 'alimentaire' || types.includes(layerKey);
          });

          // Mets à jour l'icône
          featuresForLayer.forEach(f => {
            const types = (f.get('type') as string).split(';').map(s => s.trim());
            const displayType = layerKey === 'alimentaire' ? 'alimentaire' : layerKey;

            // Si layer global et feature multi-types → icône alimentaire
            const icon = (layerKey === 'alimentaire' && types.length > 1)
              ? iconMap['alimentaire']
              : iconMap[displayType as keyof typeof iconMap] || iconMap['alimentaire'];

            f.set('displayType', displayType);
            f.set('icon', icon);
          });



          rawSource.addFeatures(featuresForLayer);
        });


        // Mise à jour de l'état
        this.activeLayers.add(actionKey);
        this.selectedLayerAction = actionKey;
        this.layerRadii[actionKey] ??= 0.5;
        this.currentRadius = this.layerRadii[actionKey];
      })
      .catch(err => console.error('Erreur showAlimentaire:', err));
  }








  public hideAlimentaire(type: string) {
    if (type === 'alimentaire') {
      Object.values(this.mapService.alimentaireLayer).forEach(layer => {
        const source = (layer.getSource() as ClusterSource)?.getSource();
        source?.clear();
      });
      Object.keys(this.mapService.alimentaireLayer).forEach(key => {
        this.activeLayers.delete(`showAlimentaire('${key}')`);
      });
      this.activeLayers.delete(`showAlimentaire('alimentaire')`);
    } else {
      const layer = this.mapService.alimentaireLayer[type];
      if (!layer) return;
      const source = (layer.getSource() as ClusterSource)?.getSource();
      source?.clear();
      this.activeLayers.delete(`showAlimentaire('${type}')`);
    }
    this.selectedLayerAction = Array.from(this.activeLayers)[0] || '';
  }


  // public fetchCustomFeatures(lat: number, lon: number, radiusMeters: number = 500): Promise<any[]> {
  //   const url = `/api/custom?lat=${lat}&lon=${lon}&radius=${radiusMeters}`;
  //   return this.http.get<any[]>(url).toPromise();
  // }




}
