import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Inject,
  Injectable,
  Input
} from '@angular/core';
import { MapService } from './map';
import { MapComponent } from '../app/map/map';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import { Style, Icon, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { HttpClient } from '@angular/common/http';
import {firstValueFrom, Observable, Subject} from 'rxjs';
import {LayerService} from './layer';
import {SearchService} from './search';
import VectorLayer from 'ol/layer/Vector';
import {Geometry, LineString, MultiLineString, MultiPoint, MultiPolygon} from 'ol/geom';
import Overlay from 'ol/Overlay';
import { Map as OlMap } from 'ol';
import {FeatureLike} from 'ol/Feature';
import {RouteService} from './route';
import {Cluster} from 'ol/source';
import {Polygon} from 'leaflet';
import {Extent, getCenter} from 'ol/extent';
import {environment} from '../environnements/environnement';
import {EditFormComponent} from '../app/edit-form/edit-form';
import {LanguageService} from './language';
import {TranslationService} from './translation';
import {UserService} from './user';
import {TranslationEntry} from '../app/app';

@Injectable({ providedIn: 'root' })
export class InteractionService {
  isPinModeActive = false;
  isLocalisationActive = false;
  userPosition: { lat: number, lon: number } | null = null;
  searchResults: any[] = [];

  translations: Record<string, TranslationEntry> = {};

  public isSatellite = false;

  private tooltipEl!: HTMLDivElement;
  private tooltipOverlay!: Overlay;



  private tooltipLayerMap!: Record<string, (feature: Feature<Geometry>) => Promise<string>>;
  private currentFeature: Feature<Geometry> | null = null;

  public sidebarPanel!: HTMLDivElement;
  public sidebarContent!: HTMLDivElement;
  public mapElement!: HTMLDivElement;

  // setter appelé depuis le component
  public setSidebarElements(panel: HTMLDivElement, content: HTMLDivElement, map: HTMLDivElement) {
    this.sidebarPanel = panel;
    this.sidebarContent = content;
    this.mapElement = map;
  }

  countryCenters: Record<string, [number, number]> = {
    fr: [2.2137, 46.2276],    // France
    en: [-0.1276, 51.5074],   // Londres
    es: [-3.7038, 40.4168],   // Madrid
  };

  foodShopsConfig: Record<string, { label: TranslationEntry | string; fields?: string[] }> = {
    bakery: {label: this.translations['tag:bakery']?.message || 'Boulangerie', fields: ['speciality']},
    butcher: {label: this.translations['tag:butcher']?.message || 'Boucherie', fields: ['meat', 'speciality']},
    greengrocer: {label: this.translations['tag:greengrocer']?.message || 'Primeur', fields: ['fruits', 'vegetables']},
    supermarket: {label: this.translations['tag:supermarket']?.message || 'Supermarché', fields: ['aisles']},
    convenience: {label: this.translations['tag:convenience']?.message || 'Supérette'},
    kiosk: {label: this.translations['tag:kiosk']?.message || 'Kiosque'},
    cafe: {label: this.translations['tag:cafe']?.message || 'Café'},
    coffee_shop: {label: this.translations['tag:coffee_shop']?.message || 'Coffee Shop'},
    tea: {label: this.translations['tag:tea']?.message || 'Salon de thé'},
    restaurant: {label: this.translations['tag:restaurant']?.message || 'Restaurant', fields: ['cuisine']},
    fast_food: {label: this.translations['tag:fast_food']?.message || 'Fast Food', fields: ['cuisine']},
    pub: {label: this.translations['tag:pub']?.message || 'Pub'},
    bar: {label: this.translations['tag:bar']?.message || 'Bar'},
    food_court: {label: this.translations['tag:food_court']?.message || 'Aire de restauration'},
    ice_cream: {label: this.translations['tag:ice_cream']?.message || 'Glacier', fields: ['flavors']},
    chocolate: {label: this.translations['tag:chocolate']?.message || 'Chocolaterie', fields: ['speciality']},
    sweet_shop: {label: this.translations['tag:sweet_shop']?.message || 'Confiserie', fields: ['speciality']},
    wine_shop: {label: this.translations['tag:wine_shop']?.message || 'Caviste', fields: ['wines']},
    beer: {label: this.translations['tag:beer']?.message || 'Magasin de bières', fields: ['beers']},
    spirits: {label: this.translations['tag:spirits']?.message || 'Spiritueux', fields: ['spirits']},
    deli: {label: this.translations['tag:deli']?.message || 'Épicerie fine', fields: ['speciality']},
    cheese: {label: this.translations['tag:cheese']?.message || 'Fromagerie', fields: ['speciality']},
    seafood: {label: this.translations['tag:seafood']?.message || 'Poissonnerie', fields: ['seafood']},
    bakery_shop: {label: this.translations['tag:bakery_shop']?.message || 'Pâtisserie', fields: ['speciality']},
    juice_bar: {label: this.translations['tag:juice_bar']?.message || 'Bar à jus', fields: ['juices']},
    milk: {label: this.translations['tag:milk']?.message || 'Laiterie', fields: ['dairy']},
    honey: {label: this.translations['tag:honey']?.message || 'Miel', fields: ['products']},
    organic: {label: this.translations['tag:organic']?.message || 'Magasin bio', fields: ['products']},
    spices: {label: this.translations['tag:spices']?.message || 'Épices', fields: ['products']},
    nuts: {label: this.translations['tag:nuts']?.message || 'Noix et fruits secs', fields: ['products']},
    pasta: {label: this.translations['tag:pasta']?.message || 'Pâtes', fields: ['products']},
    bakery_cafe: {label: this.translations['tag:bakery_cafe']?.message || 'Boulangerie-Café', fields: ['speciality']},
    sandwich: {label: this.translations['tag:sandwich']?.message || 'Sandwicherie', fields: ['ingredients']},
    salad: {label: this.translations['tag:salad']?.message || 'Saladerie', fields: ['ingredients']},
    butcher_shop: {label: this.translations['tag:butcher_shop']?.message || 'Charcuterie', fields: ['meat', 'speciality']},
    dessert: {label: this.translations['tag:dessert']?.message || 'Desserts', fields: ['speciality']},
    yogurt: {label: this.translations['tag:yogurt']?.message || 'Yaourterie', fields: ['flavors']},
    ice_cream_parlor: {label: this.translations['tag:ice_cream_parlor']?.message || 'Crèmerie', fields: ['flavors']},
    bakery_pastry: {label: this.translations['tag:bakery_pastry']?.message || 'Boulangerie-Pâtisserie', fields: ['speciality']},
  };

  selectedFeature: Feature<Geometry> | null = null;
  showModal = false;
  modalName = '';
  modalTags: Record<string, any> = {};

  constructor(
    private appRef: ApplicationRef,
    http: HttpClient,
    layerService: LayerService,
    private envInjector: EnvironmentInjector,
    private languageService: LanguageService,
    private translationService: TranslationService,
    private userService: UserService) {}

  private async updateTooltipContent() {
    if (!this.currentFeature) return;

    const allLayers: Record<string, VectorLayer<VectorSource>> = {
      restaurantLayer: this.mapService.restaurantLayer,
      greenLayer: this.mapService.greenLayer,
      waterLayer: this.mapService.waterLayer,
      churchLayer: this.mapService.churchLayer,
      pinLayer: this.mapService.pinLayer,
      hotelLayer: this.mapService.hotelLayer,
      ...this.mapService.alimentaireLayer
    };

    const layerName = Object.keys(allLayers).find(name =>
      allLayers[name].getSource()?.hasFeature(this.currentFeature!)
    );

    if (layerName && this.tooltipLayerMap[layerName]) {
      this.tooltipEl.innerHTML = await this.tooltipLayerMap[layerName](this.currentFeature!);
    }
  }

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

            this.userPosition = {lat, lon};
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
    const pin = new Feature({geometry: new Point(fromLonLat([lon, lat]))});
    pin.setStyle(new Style({image: new Icon({src: '/images/pin.png', scale: 0.1, anchor: [0.5, 1]})}));
    pinSource?.addFeature(pin);
    this.userPosition = {lat, lon};
    this.mapService.userPosition = this.userPosition;

    // Coordonnées exactes du pin
    this.routeService.updateRouteFromPin([lon, lat]);
  }

  initTooltip() {
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
    const getGoButtonHTML = () => `<button class="btn-go"><i class="fa fa-location-arrow"></i> Y Aller</button>`;
    const getEditButtonHTML = () => `<button class="btn-edit"><i class="fa fa-pencil-alt"></i> Modifier</button>`;




    this.tooltipLayerMap = {
      restaurantLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};

        const name = tags.name || feature.get('name') || 'Restaurant';

        let html = `<div class="title">${name}</div>`;

        // 🟢 Tous les autres tags passent dans tags-container
        html += await this.buildTagListHTML(tags, feature);

        const isCluster = !!feature.get('features') && feature.get('features').length > 1;

        if (!isCluster) {
          html += `
            <div class="card-footer">
              ${getGoButtonHTML()}
              ${getEditButtonHTML()}
            </div>
          `;
        }


        return html;
      },


      churchLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';

        const cluster = feature.get('features');

        // === 1) CLUSTER : plusieurs églises ===
        if (cluster && cluster.length > 1) {
          const count = cluster.length;
          return `
      <div class="title">${this.translations['tag:cluster_churches']?.message || 'églises trouvées'}: ${count}</div>
    `;
        }

        // === 2) UNE SEULE ÉGLISE ===
        const f = cluster ? cluster[0] : feature;
        const tags = f.get('tags') || {};
        const name = tags.name || this.translations['tag:church']?.message;

        let html = `<div class="title">${name}</div>`;

        // 🟢 Tous les autres tags passent dans tags-container
        html += await this.buildTagListHTML(tags, feature);

        const isCluster = !!feature.get('features') && feature.get('features').length > 1;

        if (!isCluster) {
          html += `
            <div class="card-footer">
              ${getGoButtonHTML()}
              ${getEditButtonHTML()}
            </div>
          `;
        }

        return html;
      },



      greenLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};
        const name = tags.name || '';

        let html = name ? `<div class="title">${name}</div>` : '';
        html += await this.buildTagListHTML(tags, feature);

        const isCluster = !!feature.get('features') && feature.get('features').length > 1;

        if (!isCluster) {
          html += `
            <div class="card-footer">
              ${getGoButtonHTML()}
              ${getEditButtonHTML()}
            </div>
          `;
        }

        return html;
      },

      waterLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};

        const name = tags.name || '';
        const type = tags.type || tags.natural || this.translations['tag:water']?.message;

        let html = name ? `<div class="title">${name}</div>` : '';
        html += `<div class="type">${type}</div>`;
        html += await this.buildTagListHTML(tags, feature);

        const isCluster = !!feature.get('features') && feature.get('features').length > 1;

        if (!isCluster) {
          html += `
            <div class="card-footer">
              ${getGoButtonHTML()}
              ${getEditButtonHTML()}
            </div>
          `;
        }

        return html;
      },


      pinLayer: async () => {
        this.tooltipEl.className = 'tooltip-pin';
        return `<div class="title">${this.translations['tag:position']?.message}</div>`;
      },

      hotelLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';

        const cluster = feature.get('features');

        // === 1) CLUSTER : plusieurs hôtels ===
        if (cluster && cluster.length > 1) {
          const count = cluster.length;
          const type = this.translations['tag:hotel']?.message || 'hôtels';
          return `
      <div class="title">
        ${this.translations['number_cluster']?.message.replace('{type}', type).replace('{count}', String(count))
          || `Nombre de ${type}: ${count}`}
      </div>
    `;
        }

        // === 2) UN SEUL HÔTEL ===
        const f = cluster ? cluster[0] : feature;
        const tags = f.get('tags') || {};
        const name = tags.name || this.translations['tag:hotel']?.message;

        let html = `<div class="title">${name}</div>`;

        const add = async (labelKey: string, value?: string) => {
          if (!value) return;
          const translatedLabel = await this.translateOSMTag(
            labelKey,
            this.languageService.currentLanguage as any
          );
          html += `
      <div class="field">
        <span class="label">${translatedLabel}</span>
        <span class="value">${value}</span>
      </div>`;
        };

        await add('stars', tags.stars || tags['stars:official']);
        await add('phone', tags.phone || tags['contact:phone']);
        await add('email', tags.email || tags['contact:email']);
        await add('website', tags.website || tags['contact:website']);
        await add('openingHours', tags.opening_hours);
        await add('checkin', tags.checkin);
        await add('checkout', tags.checkout);

        html += await this.buildTagListHTML(tags, feature);

        const isCluster = !!feature.get('features') && feature.get('features').length > 1;

        if (!isCluster) {
          html += `
            <div class="card-footer">
              ${getGoButtonHTML()}
              ${getEditButtonHTML()}
            </div>
          `;
        }

        return html;
      }
    };

    const daysKeys = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

    const normalizeHours = (hours: string) =>
      hours.trim().replace(/\s+/g, "").replace(/h/g, ":").replace(/([0-9]{1,2})([0-9]{2})/g, "$1:$2");

    const formatOpeningHours = (
      oh: string,
      translations: Record<string, TranslationEntry>,
      currentMap: Record<string, string> = {}
    ) => {
      if (!oh || typeof oh !== "string") return "";

      const blocks = oh
        .replace(/<br>/g, ";")
        .split(/;\s*/)
        .map(x => x.trim())
        .filter(Boolean);

      const resultMap: Record<string, string> = { ...currentMap };

      for (const block of blocks) {
        if (!block) continue;

        const blockIsOff = /(off|closed|fermé)/i.test(block);

        if (/^\s*(\d{1,2}[:h]?\d{0,2}-\d{1,2}[:h]?\d{0,2})(\s*,\s*\d{1,2}[:h]?\d{0,2}-\d{1,2}[:h]?\d{0,2})*\s*$/i.test(block)) {
          const hours = block
            .split(",")
            .map(h => normalizeHours(h.trim()))
            .join(", ");

          for (const k of daysKeys) {
            resultMap[k] = hours;
          }

          continue;
        }

        // Nouveau regex : capture le jour/plage + tous les horaires séparés par ,
        const subBlocks = block.match(
          /([A-Za-z]{2,3}(?:-[A-Za-z]{2,3})?)\s*:?\s*((?:\d{1,2}[:h]?\d{0,2}-\d{1,2}[:h]?\d{0,2})(?:,\s*\d{1,2}[:h]?\d{0,2}-\d{1,2}[:h]?\d{0,2})*)?/g
        );


        if (!subBlocks) {
          if (blockIsOff) {
            for (const k of daysKeys) {
              if (!resultMap[k]) resultMap[k] = "fermé";
            }
          }
          continue;
        }

        for (const sub of subBlocks) {
          if (!sub) continue;

          // Extraction jour et horaires
          const match = sub.match(/([A-Za-z]{2,3}(?:-[A-Za-z]{2,3})?)\s*:?\s*(.*)/);
          if (!match) continue;

          const dayPartRaw = match[1];       // ex: "Mo", "Tu-Fr"
          const hoursPart = match[2] || "";  // ex: "09:00-14:00,14:30-19:30"

          const isOff = /(off|closed|fermé)/i.test(hoursPart) || blockIsOff;

          const hoursRawMatch = hoursPart
            ? hoursPart.split(',').map(h => h.trim()).filter(Boolean)
            : [];
          const hours = isOff ? "fermé" : hoursRawMatch.map(normalizeHours).join(", ");

          const dayRanges: string[] = [];
          if (dayPartRaw) {
            const parts = dayPartRaw.split(",").map(s => s.trim());
            for (const p of parts) {
              if (p.includes("-")) {
                const [start, end] = p.split("-").map(s => s.trim());
                let startKey = daysKeys.includes(start) ? start : undefined;
                let endKey = daysKeys.includes(end) ? end : undefined;
                if (!startKey) startKey = daysKeys.find(k => k.toLowerCase() === start.toLowerCase());
                if (!endKey) endKey = daysKeys.find(k => k.toLowerCase() === end.toLowerCase());
                if (startKey && endKey) dayRanges.push(`${startKey}-${endKey}`);
              } else {
                const key = daysKeys.includes(p) ? p : daysKeys.find(k => k.toLowerCase() === p.toLowerCase());
                if (key) dayRanges.push(key);
              }
            }
          }

          for (const dr of dayRanges) {
            if (dr.includes("-")) {
              const [start, end] = dr.split("-");
              let si = daysKeys.indexOf(start);
              let ei = daysKeys.indexOf(end);
              if (ei < si) ei += 7;
              for (let i = si; i <= ei; i++) {
                const key = daysKeys[i % 7];
                if (!resultMap[key] || (isOff && !hours)) resultMap[key] = isOff ? "fermé" : hours;
              }
            } else if (daysKeys.includes(dr)) {
              if (!resultMap[dr] || (isOff && !hours)) resultMap[dr] = isOff ? "fermé" : hours;
            }
          }
        }
      }

      // Compléter les jours manquants
      for (const k of daysKeys) {
        if (!resultMap[k]) resultMap[k] = "fermé";
      }


      // On traduit pas daysKeys directement, on fait juste un mapping avec les nouvelles valeurs
      daysKeys.map(k => `${k}: ${resultMap[k]}`);

      let html = "";
      for(const i of daysKeys){
        html += translations[`tag:${i}`]?.message + ": " + resultMap[i] + '<br><br>';
      }

      return html;
    };


    const getFoodTooltipHTML = async (feature: Feature<Geometry>, key: string) => {
      this.tooltipEl.className = 'tooltip-card';

      // Cluster
      const clusterFeatures: Feature[] = feature.get('features') || [];
      const isCluster = clusterFeatures.length > 1;

      // Feature réelle
      const f = clusterFeatures.length ? clusterFeatures[0] : feature;

      // Tags
      const tags = f.get('tags') || {};

      // Ici on sauvegarde l'état du tag d'origine
      const saveOpeningHours = tags.opening_hours;

      if (tags.opening_hours) {
        // On modifie le tag d'origine (à ne pas faire de base) pour traduire correctement
        tags.opening_hours = formatOpeningHours(tags.opening_hours, this.translations);
      }

      // Type de commerce
      const shopType = tags.shop || tags['amenity'] || key;
      const genericLabel = this.translations[`tag:${key}`]?.message || this.foodShopsConfig[key]?.label || 'Commerce alimentaire';

      let html = '';

      if (isCluster) {
        if (typeof genericLabel === "string") {
          html += `
      <div class="card-header">
        <div class="title">
          ${this.translations['tag:number_cluster']?.message
            .replace('{type}', genericLabel)
            .replace('{count}', clusterFeatures.length.toString())}
        </div>
      </div>
    `;
        }
      } else {
        const name = tags.name || f.get('name') || genericLabel;

        // Nom et type centrés, gros, gras, bleu
        html += `
          <div class="card-header">
            <div class="title">${name}</div>
            <div class="subtitle">
              <span style="color:#1a73e8; font-weight:700;">Type:</span>
              <span style="color:#000; font-weight:600; margin-left:4px;">
                ${ (this.translations[`tag:${shopType}`]?.message || shopType).replace(/s$/, '') }
              </span>
            </div>
          </div>
        `;


        // Tous les autres tags dans tags-container
        html += await this.buildTagListHTML(tags, feature);
      }

      if (!isCluster) {
        html += `
      <div class="card-footer">
        ${getGoButtonHTML()}
        ${getEditButtonHTML()}
      </div>
    `;
      }
      // Ici, on utilise une backup du tag d'origine pour que le prochain clic sur une feature affiche les bonnes horaires
      tags.opening_hours = saveOpeningHours;

      return html;
    };





    if (this.mapService.alimentaireLayer) {
      Object.keys(this.mapService.alimentaireLayer).forEach(key => {
        this.tooltipLayerMap[key] = async (feature) => getFoodTooltipHTML(feature, key);
      });
    }



    // ===== Ajout du bouton "Y aller" et gestion du clic =====
    // this.tooltipEl.addEventListener('click', (evt) => {
    //   console.log("EVENT 1");
    //   evt.stopPropagation(); // ← IMPORTANT
    //   let target = evt.target as HTMLElement;
    //
    //   while (target && target !== this.tooltipEl && !target.classList.contains('btn-go')) {
    //     target = target.parentElement as HTMLElement;
    //   }
    //
    //   if (target?.classList.contains('btn-go') && this.currentFeature) {
    //
    //     if (!this.isLocalisationActive) this.toggleLocalisation(this.languageService.currentLanguage);
    //
    //     const geom = this.currentFeature.getGeometry();
    //     if (!geom || geom.getType() !== 'Point') return;
    //
    //     const coords = (geom as Point).getCoordinates();
    //     const lonLat = toLonLat(coords) as [number, number];
    //
    //     this.routeService.fetchRouteWithUserPosition(lonLat);
    //
    //   }
    // });

    // this.tooltipEl.addEventListener('click', (evt) => {
    //   console.log("EVENT 2");
    //   let target = evt.target as HTMLElement; // ✅ cast ici
    //
    //   while (target && target !== this.tooltipEl) {
    //
    //     console.log("test");
    //     console.log(target);
    //     // bouton "Y aller"
    //     if (target.classList.contains('btn-go')) {
    //       if (!this.isLocalisationActive) this.toggleLocalisation(this.languageService.currentLanguage);
    //       const geom = this.currentFeature?.getGeometry();
    //       if (geom && geom.getType() === 'Point') {
    //         const coords = (geom as Point).getCoordinates();
    //         const lonLat = toLonLat(coords) as [number, number];
    //         this.routeService.fetchRouteWithUserPosition(lonLat);
    //       }
    //       return;
    //     }
    //
    //     // bouton "Edit"
    //     if (target.classList.contains('btn-edit')) {
    //       this.openEditForm(this.currentFeature!);
    //       return;
    //     }
    //
    //     console.log("TEST");
    //
    //     // icône poubelle
    //     if (target.classList.contains('tag-delete')) {
    //       const key = target.dataset['key']; // ✅ dataset existe maintenant
    //       if (!key || !this.currentFeature) return;
    //
    //       const tags = this.currentFeature.get('tags') || {};
    //       delete tags[key];
    //       this.currentFeature.set('tags', tags);
    //
    //       const parentDiv = target.closest('.field');
    //       if (parentDiv) parentDiv.remove();
    //
    //       evt.stopPropagation();
    //       evt.preventDefault();
    //       return;
    //     }
    //
    //     target = target.parentElement as HTMLElement;
    //   }
    // });

    this.sidebarContent.addEventListener('click', (evt) => {
      const target = evt.target as HTMLElement;
      if (!target) return;

      // --- 1️⃣ Supprimer un tag ---
      if (target.closest('.tag-delete')) {
        evt.stopPropagation();
        evt.preventDefault();

        const icon = target.closest('.tag-delete') as HTMLElement;
        const key = icon.dataset['key'];
        if (!key || !this.currentFeature) return;

        const realFeature = (this.currentFeature.get('features')?.[0]) || this.currentFeature;
        const props = realFeature.getProperties() as { type?: string; tags?: Record<string, any> };
        const tags = { ...(realFeature.get('tags') || {}) };
        delete tags[key];
        realFeature.set('tags', tags);

        const field = icon.closest('.field');
        if (field) field.remove();

        const collection = realFeature.get('type');

        if (collection) {
          (async () => {
            try {
              const res = await fetch(`http://localhost:3000/nodejs/${collection}s/${realFeature.getId()}/${key}`, { method: 'DELETE' });
              if (!res.ok) {
                console.error('Erreur suppression tag, status:', res.status, res.statusText);
                return;
              }
              const data: { success: boolean; error?: string } = await res.json();
              if (!data.success) console.error('Erreur suppression tag:', data.error);
            } catch (err) {
              console.error('Erreur fetch:', err);
            }
          })();
        }
      }

      // --- 2️⃣ Bouton "Y aller" ---
      let el: HTMLElement | null = target;
      while (el && el !== this.sidebarContent) {
        if (el.classList.contains('btn-go')) {
          evt.stopPropagation();
          if (!this.isLocalisationActive) this.toggleLocalisation(this.languageService.currentLanguage);
          const geom = this.currentFeature?.getGeometry();
          if (geom?.getType() === 'Point') {
            const coords = (geom as Point).getCoordinates();
            const lonLat = toLonLat(coords) as [number, number];
            this.routeService.fetchRouteWithUserPosition(lonLat);
          }
          return;
        }

        // --- 3️⃣ Bouton "Modifier" ---
        if (el.classList.contains('btn-edit')) {
          evt.stopPropagation();
          if (this.currentFeature) this.openEditForm(this.currentFeature);
          return;
        }

        el = el.parentElement;
      }
    });



    const attachTooltipToLayers = (layers: Record<string, VectorLayer<VectorSource>>) => {
      const layerNames = Object.keys(layers);

      const layerHasFeature = (layer: VectorLayer<any>, feature: Feature<Geometry>): boolean => {
        const source = layer.getSource();
        if (!source) return false;

        // Cluster
        if ('getSource' in source && typeof (source as any).getSource === 'function') {
          const clusterSource: VectorSource = (source as any).getSource();
          const clusterFeatures = clusterSource.getFeatures();
          return clusterFeatures.some(f => {
            const innerFeatures: Feature[] = f.get('features') || [];
            return innerFeatures.includes(feature) || f === feature;
          });
        }

        // VectorSource classique
        return (source as VectorSource).hasFeature(feature);
      };

      // Tap/click mobile
      this.mapService.map.on('click', async evt => {
        const clickedFeature = this.mapService.map.forEachFeatureAtPixel(evt.pixel, f => f);

        if (!this.sidebarPanel || !this.sidebarContent) return;

        if (clickedFeature) {
          const html = await this.fillTooltip(clickedFeature);
          this.sidebarContent.innerHTML = html;

          this.sidebarPanel.classList.add('open');
        } else {
          this.sidebarPanel.classList.remove('open');
        }
      });






    };

// Exemple d’utilisation
    attachTooltipToLayers({
      restaurantLayer: this.mapService.restaurantLayer,
      greenLayer: this.mapService.greenLayer,
      waterLayer: this.mapService.waterLayer,
      churchLayer: this.mapService.churchLayer,
      pinLayer: this.mapService.pinLayer,
      hotelLayer: this.mapService.hotelLayer,
      ...this.mapService.alimentaireLayer
    });
  }

  private async fillTooltip(featureLike: FeatureLike): Promise<string> {
    if (!(featureLike instanceof Feature)) return "";
    const feature = featureLike as Feature<Geometry>;

    const geom = feature.getGeometry();
    if (!geom) return "";

    const allLayers = {
      restaurantLayer: this.mapService.restaurantLayer,
      greenLayer: this.mapService.greenLayer,
      waterLayer: this.mapService.waterLayer,
      churchLayer: this.mapService.churchLayer,
      pinLayer: this.mapService.pinLayer,
      hotelLayer: this.mapService.hotelLayer,
      ...this.mapService.alimentaireLayer
    };

    const getLayerForFeature = (feature: Feature<Geometry>) => {
      for (const [name, layer] of Object.entries(allLayers)) {
        const source = layer.getSource();
        if (!source) continue;
        const features = source.getFeatures();
        for (const f of features) {
          const inner = f.get('features') || [];
          if (inner.includes(feature) || f === feature) return name;
        }
      }
      return "";
    };

    const layerName = getLayerForFeature(feature);
    if (layerName && this.tooltipLayerMap[layerName]) {
      this.currentFeature = feature;

      const htmlOrPromise = this.tooltipLayerMap[layerName](feature);

      // 🔥 Supporte string ou Promise<string>
      const html =
        htmlOrPromise && typeof (htmlOrPromise as any).then === "function"
          ? await htmlOrPromise
          : htmlOrPromise;

      // 🔥 NE PAS toucher au DOM ici → on retourne le HTML
      return html || "";
    }

    return "";
  }




  // Mise à jour des traductions et rafraîchissement du tooltip si visible
  async updateTranslations(translations: Record<string, TranslationEntry>) {
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
        this.tooltipEl.innerHTML = await this.tooltipLayerMap[layerName](this.currentFeature!);
      }
    }
  }

  openEditForm(feature: Feature<Geometry>) {
    const realFeature = (feature.get('features')?.[0]) || feature;
    const props = realFeature.getProperties() as { type?: string; tags?: any };
    const oldTags = props.tags || {};
    const type = props.type || 'unknown';

    // 1️⃣ Créer dynamiquement le composant EditFormComponent
    const componentRef: ComponentRef<EditFormComponent> = createComponent(EditFormComponent, {
      environmentInjector: this.envInjector,  // <-- utiliser environmentInjector
    });

    // 2️⃣ Initialiser ses inputs avec un clone pour éviter de modifier oldTags
    componentRef.instance.name = oldTags.name || '';
    componentRef.instance.tags = { ...oldTags }; // important : clone
    componentRef.instance.translations = this.translations;

    // 3️⃣ Événements ok / cancel
    const subOk = componentRef.instance.ok.subscribe(event => {
      const newName = event.name;
      const currentUser = this.userService.userSignal();
      const modifiedBy = currentUser.name || 'Utilisateur inconnu';

      // Nouveau set de tags basé sur l'ancien
      const newTags: Record<string, any> = { ...oldTags };
      let modifiedFields: { key: string, modifiedBy: string }[] = Array.isArray(oldTags.modifiedFields)
        ? [...oldTags.modifiedFields]
        : [];

      // Parcourir tous les tags du formulaire
      for (const key of Object.keys(event.tags)) {
        const oldValue = oldTags[key];
        const newValue = event.tags[key];

        if (oldValue !== newValue) {
          newTags[key] = newValue;

          // Ajouter ou mettre à jour le modifiedFields pour ce tag
          const existing = modifiedFields.find(f => f.key === key);
          if (existing) {
            existing.modifiedBy = modifiedBy; // si déjà dans modifiedFields, mettre à jour
          } else {
            modifiedFields.push({ key, modifiedBy });
          }
        }
      }

      // Supprimer les tags supprimés
      for (const key of Object.keys(oldTags)) {
        if (!event.tags.hasOwnProperty(key)) {
          delete newTags[key];
          // Retirer du modifiedFields
          modifiedFields = modifiedFields.filter(f => f.key !== key);
        }
      }

      // Ajouter modifiedFields seulement si non vide
      if (modifiedFields.length > 0) {
        newTags['modifiedFields'] = modifiedFields;
      } else {
        delete newTags['modifiedFields'];
      }

      //realFeature.setProperties({ ...props, tags: newTags });


      const geom = realFeature.getGeometry();
      if (!geom) return;
      const centerXY = getCenter(geom.getExtent());
      const [lon, lat] = toLonLat(centerXY);

      let collection = type.toLowerCase();
      if (collection === 'alimentaire') {
        const tagType = (newTags['shop'] || newTags['amenity'] || '').toLowerCase();
        if (tagType && tagType in environment.iconMap) collection = tagType;
      }
      if (!collection.endsWith('s')) collection += 's';

      this.http.post(`http://localhost:3000/nodejs/entity/${collection}`, {
        _id: `${lat}_${lon}`,
        type,
        name: newName,
        coords: { lat, lon },
        tags: newTags
      }).subscribe({
        next: () => {
          const key = `${lat}_${lon}`;
          this.layerService.customTagsMap.set(key, newTags);
          this.fillTooltip(realFeature);
        },
        error: (err) => {
          console.error(`Erreur lors de l'enregistrement dans ${collection}:`, err);
          alert(`Erreur lors de l'enregistrement dans ${collection}`);
        }
      });

      subOk.unsubscribe();
      subCancel.unsubscribe();
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    });


    const subCancel = componentRef.instance.cancel.subscribe(() => {
      subOk.unsubscribe();
      subCancel.unsubscribe();
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    });

    // 4️⃣ Ajouter au DOM
    this.appRef.attachView(componentRef.hostView);
    const domElem = (componentRef.hostView as any).rootNodes[0] as HTMLElement;
    document.body.appendChild(domElem);
  }


  // ====== Traduction d'une clé OSM via Google Translate uniquement ======
  private translateOSMTag(key: string, lang: 'fr' | 'en' | 'es'): Promise<string> {
    if (!key) return Promise.resolve('');

    const parts = key.split(/[:_]/);

    return Promise.all(
      parts.map(async part => {
        return this.getTranslation(part) || part;
      })
    )
      .then(translated => this.capitalize(translated.join(' ')));
  }

  private capitalize(s: string):
    string {
      if (!s) return '';
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

  async buildTagListHTML(tags: Record<string, any>, feature: Feature<Geometry>): Promise<string> {
    if (!tags) return '';

    const excluded = new Set([
      'geometry','features','id','layer','name',
      'brand','shop','amenity',
      'modifiedFields'
    ]);

    const lang = this.languageService.currentLanguage as 'fr' | 'en' | 'es' || 'fr';
    const isAdmin = this.userService.isAdmin();

    const modifiedFields: { key: string, modifiedBy: string }[] = tags['modifiedFields'] || [];

    let html = '<div class="tags-container">';

    const promises: Promise<string>[] = Object.entries(tags)
      .filter(([key, value]) => value && !excluded.has(key) && !/^name(:.+)?$/i.test(key))
      .map(async ([key, value]) => {
        let translatedKey = this.getTranslation(key);
        if(translatedKey == key){
          translatedKey = await firstValueFrom(this.translationService.translate(key, lang)) || key;
        }
        const parts = String(value).split(';').map(v => v.trim());

        const translatedValues = await Promise.all(
          parts.map(async p => {
            const t = key !== 'opening_hours' ? this.translations['tag:'+p]?.message || p : p;
            return this.capitalize(t);
          })
        );

        // 🟡 Vérifier si ce tag est modifié et récupérer le modifiedBy correspondant
        const modifiedEntry = modifiedFields.find(f => f.key === key);
        const modifiedText = modifiedEntry
          ? ` <span style="color:orange; font-weight:600;">(modifié par ${modifiedEntry.modifiedBy})</span>`
          : '';

        const deleteIcon = isAdmin
          ? `<button class="tag-delete" data-key="${key}" style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:24px;
          height:24px;
          padding:0;
          margin-right:6px;
          color:white;
          background-color: transparent;
          border:none;
          border-radius:4px;
          cursor:pointer;
          font-size:14px;
          font-weight:bold;
          pointer-events:auto;
          ">🗑️</button>`
          : '';

        return `
      <div class="field" style="display:flex; align-items:center;">
        ${deleteIcon}
        <span class="label">${translatedKey}</span>
        <span class="value">${translatedValues.join(', ')}${modifiedText}</span>
      </div>`;
      });

    const blocks = await Promise.all(promises);
    html += blocks.join('\n');
    html += '</div>';

    return html;
  }

  getTranslation(key: string): string {
    let parts = key.split(':');
    while (parts.length > 0) {
      const testKey = 'tag:' + parts.join(':');
      const message = this.translations[testKey]?.message;
      if (message) return message;
      parts.pop(); // retire le dernier segment et essaye la clé "parent"
    }
    return key; // fallback sur la valeur brute
  }



}
