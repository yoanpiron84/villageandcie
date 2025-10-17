import {inject, Inject, Injectable} from '@angular/core';
import { MapService } from './map';
import { MapComponent } from '../app/map/map';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import { Style, Icon, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { HttpClient } from '@angular/common/http';
import {Observable, Subject} from 'rxjs';
import {LayerService} from './layer';
import {SearchService} from './search';
import VectorLayer from 'ol/layer/Vector';
import {Geometry} from 'ol/geom';
import Overlay from 'ol/Overlay';
import { Map as OlMap } from 'ol';
import {FeatureLike} from 'ol/Feature';

@Injectable({ providedIn: 'root' })
export class InteractionService {
  isPinModeActive = false;
  isLocalisationActive = false;
  userPosition: { lat: number, lon: number } | null = null;
  searchResults: any[] = [];
  activeFilters: Record<string, boolean> = {
    water: true,
    green: true,
    restaurant: true,
    church: true
  };

  translations: Record<string, string> = {};

  public isSatellite = false;

  private tooltipEl!: HTMLDivElement;
  private tooltipOverlay!: Overlay;
  private tooltipLayerMap!: Record<string, (feature: Feature) => string>;
  private currentFeature: Feature<Geometry> | null = null;

  countryCenters: Record<string, [number, number]> = {
    fr: [2.2137, 46.2276],    // France
    en: [-0.1276, 51.5074],   // Londres
    es: [-3.7038, 40.4168],   // Madrid
  };
  constructor() {}

  private readonly mapService = inject(MapService);
  private readonly http = inject(HttpClient);
  private readonly layerService = inject(LayerService);


  togglePinMode() {
    this.isPinModeActive = !this.isPinModeActive;
  }

  toggleViewOptions() {
    const isCurrentlySatellite = this.mapService.satelliteLayer.getVisible();
    this.setMapView(isCurrentlySatellite ? 'osm' : 'satellite');
  }

  setMapView(viewType: 'satellite' | 'osm') {
    this.isSatellite = viewType === 'satellite';
    this.mapService.satelliteLayer.setVisible(this.isSatellite);
    this.mapService.labelsLayer.setVisible(this.isSatellite);
    this.mapService.osmLayer.setVisible(!this.isSatellite);
  }

  toggleLocalisation(lang: string) {
    this.isLocalisationActive = !this.isLocalisationActive;

    const view = this.mapService.map.getView();

    if (this.isLocalisationActive) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            this.userPosition = { lat, lon };
            this.layerService.coords = `${lat},${lon}`;

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
      // Réinitialise la carte au centre par défaut passé en paramètre
      const center = this.countryCenters[lang] || this.countryCenters['fr'];
      view.animate({
        center: fromLonLat(center),
        zoom: 6,
        duration: 1000
      });
    }
  }


  placePin(lon: number, lat: number) {
    const pinSource = this.mapService.pinLayer.getSource();
    pinSource?.clear();
    const pin = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
    pin.setStyle(new Style({ image: new Icon({ src: '/images/pin.png', scale: 0.1, anchor: [0.5, 1] }) }));
    pinSource?.addFeature(pin);
    this.userPosition = { lat, lon };
  }

  initTooltip(){
    // Création du tooltip
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'tooltip-card';
    this.tooltipEl.style.display = 'none';
    document.body.appendChild(this.tooltipEl);

    this.tooltipOverlay = new Overlay({
      element: this.tooltipEl,
      offset: [10, 0],
      positioning: 'bottom-left'
    });
    this.mapService.map.addOverlay(this.tooltipOverlay);

    const tooltipLayerMap: Record<string, (feature: Feature) => string> = {
      restaurantLayer: (feature) => {
        const tags = feature.get('tags') || {};
        const name = tags.name || feature.get('name') || 'Restaurant';
        const phone = tags.phone || tags['contact:phone'] || '';
        const hours = tags.opening_hours || '';
        const type = tags.cuisine || '';
        const desc = tags.description || '';

        return `
          <div class="title">${name}</div>
          ${phone ? `<div class="field"><span class="label">${this.translations['phone']}</span> <span class="value">${phone}</span></div>` : ''}
          ${hours ? `<div class="field"><span class="label">${this.translations['hours']}</span> <span class="value">${hours}</span></div>` : ''}
          ${type ? `<div class="field"><span class="label">${this.translations['type']}</span> <span class="value">${type}</span></div>` : ''}
          ${desc ? `<div class="desc">${desc}</div>` : ''}
        `;
      },
      churchLayer: (feature) => {
        const tags = feature.get('tags') || {};
        const name = tags.name || feature.get('name') || this.translations['church'];
        const religion = tags.religion || tags['religion'] || '';

        return `
          <div class="title">${name}</div>
          ${religion ? `<div class="field"><span class="label">${this.translations['religion']}</span> <span class="value">${religion}</span></div>` : ''}
        `;
      },
      greenLayer: (feature) => {
        const tags = feature.get('tags') || {};
        const type = tags.natural || tags.leisure || this.translations['green_space'];
        return `<div class="title">${type}</div>`;
      },
      waterLayer: (feature) => {
        const tags = feature.get('tags') || {};
        const name = tags.name || '';
        const waterType = tags.type || tags.natural || this.translations['water'];

        return `
          ${name ? `<div class="title">${name}</div>` : ''}
          <div class="type">${waterType}</div>
        `;
      },
      pinLayer: () => `<div class="title">${this.translations['position']}</div>`
    };

// Fonction générique d’attachement du tooltip
    const attachTooltipToLayers = (layers: Record<string, VectorLayer<VectorSource>>) => {
      const layerNames = Object.keys(layers);

      const getLayerForFeature = (feature: Feature) => {
        return layerNames.find(name => layers[name].getSource()?.hasFeature(feature)) || '';
      };

      const fillTooltip = (featureLike: FeatureLike) => {
        if (featureLike instanceof Feature) {
          const feature = featureLike as Feature<Geometry>;

          const layerName = getLayerForFeature(feature); // ta fonction pour détecter le layer
          if (layerName && tooltipLayerMap[layerName]) {
            this.tooltipEl.innerHTML = tooltipLayerMap[layerName](feature);
          }
        }
      };

      // Hover desktop
      this.mapService.map.on('pointermove', (evt) => {
        if (evt.dragging) return;

        const feature = this.mapService.map.forEachFeatureAtPixel(evt.pixel, f => f, {
          layerFilter: (layer) => Object.values(layers).includes(layer as VectorLayer<VectorSource>)
        });

        if (feature) {
          fillTooltip(feature);
          this.tooltipOverlay.setPosition(evt.coordinate);
          this.tooltipEl.style.display = 'block';
        } else {
          this.tooltipEl.style.display = 'none';
        }
      });

      // Tap/click mobile
      this.mapService.map.on('click', (evt) => {
        const feature = this.mapService.map.forEachFeatureAtPixel(evt.pixel, f => f, {
          layerFilter: (layer) => Object.values(layers).includes(layer as VectorLayer<VectorSource>)
        });

        if (feature) {
          fillTooltip(feature);
          this.tooltipOverlay.setPosition(evt.coordinate);
          this.tooltipEl.style.display = 'block';
        } else {
          this.tooltipEl.style.display = 'none';
        }
      });
    };

// Exemple d’utilisation
    attachTooltipToLayers({
      restaurantLayer: this.mapService.restaurantLayer,
      greenLayer: this.mapService.greenLayer,
      waterLayer: this.mapService.waterLayer,
      churchLayer: this.mapService.churchLayer,
      pinLayer: this.mapService.pinLayer
    });
  }

  // Mise à jour des traductions et rafraîchissement du tooltip si visible
  updateTranslations(translations: Record<string, string>) {
    this.translations = translations;

    if (this.currentFeature && this.tooltipEl.style.display === 'block') {
      const layers: Record<string, VectorLayer<VectorSource>> = {
        restaurantLayer: this.mapService.restaurantLayer,
        greenLayer: this.mapService.greenLayer,
        waterLayer: this.mapService.waterLayer,
        churchLayer: this.mapService.churchLayer,
        pinLayer: this.mapService.pinLayer
      };

      const layerName = Object.keys(layers).find(name => layers[name].getSource()?.hasFeature(this.currentFeature!));
      if (layerName) {
        this.tooltipEl.innerHTML = this.tooltipLayerMap[layerName](this.currentFeature!);
      }
    }
  }



}
