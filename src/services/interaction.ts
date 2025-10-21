import {inject, Inject, Injectable, Input} from '@angular/core';
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
import {RouteService} from './route';

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

  @Input() currentLanguage: string = 'fr';

  countryCenters: Record<string, [number, number]> = {
    fr: [2.2137, 46.2276],    // France
    en: [-0.1276, 51.5074],   // Londres
    es: [-3.7038, 40.4168],   // Madrid
  };
  constructor() {}

  private readonly mapService = inject(MapService);
  private readonly http = inject(HttpClient);
  private readonly layerService = inject(LayerService);
  private readonly routeService = inject(RouteService);


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
    this.mapService.userPosition = this.userPosition;

    // Coordonnées exactes du pin
    this.routeService.updateRouteFromPin([lon, lat]);
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

    // Fonction pour générer le bouton "Y aller"
    const getGoButtonHTML = () => {
      const text = this.translations['go_here'] || 'Y aller';
      return `<button class="btn-go" style="
        display:block;
        margin:10px auto 0;
        padding:6px 12px;
        background-color:#1a73e8;
        color:#fff;
        border:none;
        border-radius:6px;
        cursor:pointer;
        font-weight:600;
        pointer-events: auto;
      ">${text}</button>`;
    };

    this.tooltipLayerMap = {
      restaurantLayer: (feature) => {
        this.tooltipEl.className = 'tooltip-card';
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
          ${getGoButtonHTML()}
        `;
      },
      churchLayer: (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const clusterFeatures = feature.get('features');

        if (clusterFeatures && clusterFeatures.length > 1) {
          const count = clusterFeatures.length;
          const label = this.translations['cluster_churches'] || 'Églises dans ce cluster';
          return `<div class="title">${label}: ${count}</div>`;
        }

        const f = clusterFeatures ? clusterFeatures[0] : feature;
        const tags = f.get('tags') || {};
        const name = tags.name || f.get('name') || this.translations['church'];
        const religion = tags.religion || 'Non spécifiée';
        const denomination = tags.denomination || tags['denomination:wikidata'] || '';
        const building = tags.building || tags['building:part'] || '';
        const phone = tags.phone || tags['contact:phone'] || '';
        const email = tags.email || tags['contact:email'] || '';
        const website = tags.website || tags['contact:website'] || '';
        const address = [
          tags['addr:housenumber'],
          tags['addr:street'],
          tags['addr:postcode'],
          tags['addr:city']
        ].filter(Boolean).join(', ');

        let html = `<div class="title">${name}</div>`;

        const addField = (label: string, value?: string) => {
          if (value) html += `<div class="field"><span class="label">${label}</span> <span class="value">${value}</span></div>`;
        };

        addField(this.translations['religion'], religion);
        addField(this.translations['denomination'], denomination);
        addField(this.translations['building'], building);
        addField(this.translations['address'], address);
        addField(this.translations['phone'], phone);
        addField(this.translations['email'], email);
        addField(this.translations['website'], website);

        if (tags.service_times) {
          addField(this.translations['service_times'], tags.service_times);
        }

        html += getGoButtonHTML();

        return html;
    },
      greenLayer: (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};
        const type = tags.natural || tags.leisure || this.translations['green_space'];
        return `<div class="title">${type}</div>${getGoButtonHTML()}`;
      },
      waterLayer: (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};
        const name = tags.name || '';
        const waterType = tags.type || tags.natural || this.translations['water'];

        return `
          ${name ? `<div class="title">${name}</div>` : ''}
          <div class="type">${waterType}</div>
          ${getGoButtonHTML()}
        `;
      },
      pinLayer: () => {
        this.tooltipEl.className = 'tooltip-pin';
        return `<div class="title">${this.translations['position']}</div>`;
      }
    };

    // ===== Ajout du bouton "Y aller" et gestion du clic =====
    this.tooltipEl.addEventListener('click', (evt) => {
      evt.stopPropagation(); // ← IMPORTANT
      let target = evt.target as HTMLElement;

      while (target && target !== this.tooltipEl && !target.classList.contains('btn-go')) {
        target = target.parentElement as HTMLElement;
      }

      if (target?.classList.contains('btn-go') && this.currentFeature) {

        if (!this.isLocalisationActive) this.toggleLocalisation(this.currentLanguage);

        const geom = this.currentFeature.getGeometry();
        if (!geom || geom.getType() !== 'Point') return;

        const coords = (geom as Point).getCoordinates();
        const lonLat = toLonLat(coords) as [number, number];

        this.routeService.fetchRouteWithUserPosition(lonLat);

      }
    });



    const attachTooltipToLayers = (layers: Record<string, VectorLayer<VectorSource>>) => {
      const layerNames = Object.keys(layers);

      const getLayerForFeature = (feature: Feature) => {
        return layerNames.find(name => layers[name].getSource()?.hasFeature(feature)) || '';
      };

      const fillTooltip = (featureLike: FeatureLike) => {
        if (featureLike instanceof Feature) {
          const feature = featureLike as Feature<Geometry>;

          const layerName = getLayerForFeature(feature); // ta fonction pour détecter le layer
          if (layerName && this.tooltipLayerMap[layerName]) {
            this.currentFeature = feature;
            this.tooltipEl.innerHTML = this.tooltipLayerMap[layerName](feature);
          }
        }
      };


      // // Hover desktop
      // this.mapService.map.on('pointermove', (evt) => {
      //   if (evt.dragging) return;
      //
      //   const feature = this.mapService.map.forEachFeatureAtPixel(evt.pixel, f => f, {
      //     layerFilter: (layer) => Object.values(layers).includes(layer as VectorLayer<VectorSource>)
      //   });
      //
      //   if (feature) {
      //     fillTooltip(feature);
      //     if (!isHoveringTooltip) {
      //       this.tooltipOverlay.setPosition(evt.coordinate);
      //     }
      //     this.tooltipEl.style.display = 'block';
      //   } else {
      //     if (!isHoveringTooltip) {
      //       // Disparaît seulement si la souris n'est pas sur le tooltip
      //       this.tooltipEl.style.display = 'none';
      //       this.tooltipOverlay.setPosition(undefined);
      //     }
      //   }
      //
      //   // Si on est dans le tooltip, maintenir la position figée
      //   if (isHoveringTooltip && tooltipFixedCoordinate) {
      //     this.tooltipOverlay.setPosition(tooltipFixedCoordinate);
      //   }
      //
      // });



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
