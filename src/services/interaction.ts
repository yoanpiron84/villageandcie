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

@Injectable({ providedIn: 'root' })
export class InteractionService {
  isPinModeActive = false;
  isLocalisationActive = false;
  userPosition: { lat: number, lon: number } | null = null;
  searchResults: any[] = [];

  translations: Record<string, string> = {};

  public isSatellite = false;

  private tooltipEl!: HTMLDivElement;
  private tooltipOverlay!: Overlay;
  private tooltipLayerMap!: Record<string, (feature: Feature<Geometry>) => Promise<string>>;
  private currentFeature: Feature<Geometry> | null = null;

  countryCenters: Record<string, [number, number]> = {
    fr: [2.2137, 46.2276],    // France
    en: [-0.1276, 51.5074],   // Londres
    es: [-3.7038, 40.4168],   // Madrid
  };

  foodShopsConfig: Record<string, { label: string; fields?: string[] }> = {
    bakery: {label: this.translations['bakery'] || 'Boulangerie', fields: ['speciality']},
    butcher: {label: this.translations['butcher'] || 'Boucherie', fields: ['meat', 'speciality']},
    greengrocer: {label: this.translations['greengrocer'] || 'Primeur', fields: ['fruits', 'vegetables']},
    supermarket: {label: this.translations['supermarket'] || 'Supermarché', fields: ['aisles']},
    convenience: {label: this.translations['convenience'] || 'Supérette'},
    kiosk: {label: this.translations['kiosk'] || 'Kiosque'},
    cafe: {label: this.translations['cafe'] || 'Café'},
    coffee_shop: {label: this.translations['coffee_shop'] || 'Coffee Shop'},
    tea: {label: this.translations['tea'] || 'Salon de thé'},
    restaurant: {label: this.translations['restaurant'] || 'Restaurant', fields: ['cuisine']},
    fast_food: {label: this.translations['fast_food'] || 'Fast Food', fields: ['cuisine']},
    pub: {label: this.translations['pub'] || 'Pub'},
    bar: {label: this.translations['bar'] || 'Bar'},
    food_court: {label: this.translations['food_court'] || 'Aire de restauration'},
    ice_cream: {label: this.translations['ice_cream'] || 'Glacier', fields: ['flavors']},
    chocolate: {label: this.translations['chocolate'] || 'Chocolaterie', fields: ['speciality']},
    sweet_shop: {label: this.translations['sweet_shop'] || 'Confiserie', fields: ['speciality']},
    wine_shop: {label: this.translations['wine_shop'] || 'Caviste', fields: ['wines']},
    beer: {label: this.translations['beer'] || 'Magasin de bières', fields: ['beers']},
    spirits: {label: this.translations['spirits'] || 'Spiritueux', fields: ['spirits']},
    deli: {label: this.translations['deli'] || 'Épicerie fine', fields: ['speciality']},
    cheese: {label: this.translations['cheese'] || 'Fromagerie', fields: ['speciality']},
    seafood: {label: this.translations['seafood'] || 'Poissonnerie', fields: ['seafood']},
    bakery_shop: {label: this.translations['bakery_shop'] || 'Pâtisserie', fields: ['speciality']},
    juice_bar: {label: this.translations['juice_bar'] || 'Bar à jus', fields: ['juices']},
    milk: {label: this.translations['milk'] || 'Laiterie', fields: ['dairy']},
    honey: {label: this.translations['honey'] || 'Miel', fields: ['products']},
    organic: {label: this.translations['organic'] || 'Magasin bio', fields: ['products']},
    spices: {label: this.translations['spices'] || 'Épices', fields: ['products']},
    nuts: {label: this.translations['nuts'] || 'Noix et fruits secs', fields: ['products']},
    pasta: {label: this.translations['pasta'] || 'Pâtes', fields: ['products']},
    bakery_cafe: {label: this.translations['bakery_cafe'] || 'Boulangerie-Café', fields: ['speciality']},
    sandwich: {label: this.translations['sandwich'] || 'Sandwicherie', fields: ['ingredients']},
    salad: {label: this.translations['salad'] || 'Saladerie', fields: ['ingredients']},
    butcher_shop: {label: this.translations['butcher_shop'] || 'Charcuterie', fields: ['meat', 'speciality']},
    dessert: {label: this.translations['dessert'] || 'Desserts', fields: ['speciality']},
    yogurt: {label: this.translations['yogurt'] || 'Yaourterie', fields: ['flavors']},
    ice_cream_parlor: {label: this.translations['ice_cream_parlor'] || 'Crèmerie', fields: ['flavors']},
    bakery_pastry: {label: this.translations['bakery_pastry'] || 'Boulangerie-Pâtisserie', fields: ['speciality']},
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

    const getEditButtonHTML = () => {
      const text = this.translations['edit'] || 'Modifier';
      return `<button class="btn-edit" style="
        display:block;
        margin:5px auto 0;
        padding:6px 12px;
        background-color:#4caf50;
        color:#fff;
        border:none;
        border-radius:6px;
        cursor:pointer;
        font-weight:600;
        pointer-events: auto;
      ">${text}</button>`;
    };


    this.tooltipLayerMap = {
      restaurantLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};

        const name = tags.name || feature.get('name') || 'Restaurant';
        const phone = tags.phone || tags['contact:phone'];
        const hours = tags.opening_hours;
        const type = tags.cuisine;
        const desc = tags.description;

        let html = `<div class="title">${name}</div>`;

        const addField = async (labelKey: string, value?: string) => {
          if (!value) return '';
          const translatedLabel = await this.translateOSMTag(labelKey, this.languageService.currentLanguage as any);
          return `<div class="field"><span class="label">${translatedLabel}</span><span class="value">${value}</span></div>`;
        };

        html += await addField('phone', phone);
        html += await addField('hours', hours);
        html += await addField('type', type);
        if (desc) html += `<div class="desc">${desc}</div>`;

        html += await this.buildTagListHTML(tags, feature);

        html += getGoButtonHTML() + getEditButtonHTML();
        return html;
      },

      churchLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';

        const cluster = feature.get('features');

        // === 1) CLUSTER : plusieurs églises ===
        if (cluster && cluster.length > 1) {
          const count = cluster.length;
          return `
      <div class="title">${this.translations['cluster_churches'] || 'églises trouvées'}: ${count}</div>
    `;
        }

        // === 2) UNE SEULE ÉGLISE ===
        const f = cluster ? cluster[0] : feature;
        const tags = f.get('tags') || {};
        const name = tags.name || this.translations['church'];

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

        await add('religion', tags.religion);
        await add('denomination', tags.denomination || tags['denomination:wikidata']);
        await add('building', tags.building || tags['building:part']);
        await add('phone', tags.phone || tags['contact:phone']);
        await add('email', tags.email || tags['contact:email']);
        await add('website', tags.website || tags['contact:website']);
        await add('service_times', tags.service_times);

        html += await this.buildTagListHTML(tags, feature);
        html += getGoButtonHTML() + getEditButtonHTML();

        return html;
      },


      greenLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};
        const name = tags.name || '';

        let html = name ? `<div class="title">${name}</div>` : '';
        html += await this.buildTagListHTML(tags, feature);
        html += getGoButtonHTML() + getEditButtonHTML();
        return html;
      },

      waterLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';
        const tags = feature.get('tags') || {};

        const name = tags.name || '';

        let html = name ? `<div class="title">${name}</div>` : '';
        html += await this.buildTagListHTML(tags, feature);
        html += getGoButtonHTML() + getEditButtonHTML();
        return html;
      },


      pinLayer: async () => {
        this.tooltipEl.className = 'tooltip-pin';
        return `<div class="title">${this.translations['position']}</div>`;
      },

      hotelLayer: async (feature) => {
        this.tooltipEl.className = 'tooltip-card';

        const cluster = feature.get('features');

        // === 1) CLUSTER : plusieurs hôtels ===
        if (cluster && cluster.length > 1) {
          const count = cluster.length;
          const type = this.translations['hotel'] || 'hôtels';
          return `
      <div class="title">
        ${this.translations['number_cluster']?.replace('{type}', type).replace('{count}', String(count))
          || `Nombre de ${type}: ${count}`}
      </div>
    `;
        }

        // === 2) UN SEUL HÔTEL ===
        const f = cluster ? cluster[0] : feature;
        const tags = f.get('tags') || {};
        const name = tags.name || this.translations['hotel'];

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
        html += getGoButtonHTML() + getEditButtonHTML();

        return html;
      }
    };


    const getFoodTooltipHTML = async (feature: Feature<Geometry>, key: string) => {
      this.tooltipEl.className = 'tooltip-card';

      // Cluster
      const clusterFeatures: Feature[] = feature.get('features') || [];
      const isCluster = clusterFeatures.length > 1;

      // Feature réelle
      const f = clusterFeatures.length ? clusterFeatures[0] : feature;

      // Tags corrects
      const props = f.getProperties();
      const tags = f.get('tags') || {};

      // Type de commerce
      const shopType = tags.shop || tags['amenity'] || key;
      const genericLabel = this.translations[key] || this.foodShopsConfig[key]?.label || 'Commerce alimentaire';

      let html = '';

      if (isCluster) {
        html += `
      <div class="title">
        ${this.translations['number_cluster']
          .replace('{type}', genericLabel)
          .replace('{count}', clusterFeatures.length.toString())}
      </div>
    `;

      } else {
        const name = tags.name || f.get('name') || genericLabel;
        const brand = tags.brand || '';
        const address = [
          tags['addr:housenumber'] || tags['contact:housenumber'],
          tags['addr:street'] || tags['contact:street'],
          tags['addr:postcode'] || tags['contact:postcode'],
          tags['addr:city'] || tags['contact:city']
        ].filter(Boolean).join(', ');

        html += `<div class="title">${name}</div>`;

        const addField = (label: string, value?: string) => {
          if (value) {
            html += `<div class="field"><span class="label">${label}</span> <span class="value">${value}</span></div>`;
          }
        };

        // Champs principaux affichés en haut
        addField(this.translations['type'] || 'Type', shopType);
        addField(this.translations['brand'] || 'Enseigne', brand);
        addField(this.translations['address'] || 'Adresse', address);
        addField(this.translations['phone'] || 'Téléphone', tags.phone || tags['contact:phone']);
        addField(this.translations['email'] || 'Email', tags.email || tags['contact:email']);
        addField(this.translations['website'] || 'Site web', tags.website || tags['contact:website']);
        addField(this.translations['openingHours'] || 'Horaires d\'ouverture', tags.opening_hours);
        addField(this.translations['delivery'] || 'Livraison', tags.delivery);
        addField(this.translations['takeaway'] || 'À emporter', tags.takeaway);

        // 🟢 Affichage auto des tags restants
        html += await this.buildTagListHTML(tags, feature);
      }

      html += getGoButtonHTML();
      html += getEditButtonHTML();

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

    this.tooltipEl.addEventListener('click', (evt) => {
      const target = evt.target as HTMLElement;
      if (!target) return;

      // --- 1️⃣ Icône poubelle : PRIORITAIRE, sinon bouffé par les autres événements ---
      if (target.closest('.tag-delete')) {
        evt.stopPropagation();
        evt.preventDefault();

        const icon = target.closest('.tag-delete') as HTMLElement;
        const key = icon.dataset['key'];
        if (!key || !this.currentFeature) return;

        const realFeature = (this.currentFeature.get('features')?.[0]) || this.currentFeature;
        const props = realFeature.getProperties() as { type?: string; tags?: Record<string, any> };

        // Clone des tags
        const tags = { ...(realFeature.get('tags') || {}) };

        // Supprimer le tag
        delete tags[key];

        // Supprimer l'entrée correspondante dans modifiedFields
        if (Array.isArray(tags.modifiedFields)) {
          tags.modifiedFields = (tags.modifiedFields as { key: string; modifiedBy: string }[])
            .filter(f => f.key !== key);
          if (tags.modifiedFields.length === 0) delete tags.modifiedFields;
        }

        // Mettre à jour le feature
        realFeature.setProperties({ ...props, tags });
        this.currentFeature.set('tags', tags);

        const geom = this.currentFeature.getGeometry();
        if (!geom) return;
        const [lon, lat] = toLonLat(getCenter(geom.getExtent()));

        let collection = (props.type || 'unknown').toLowerCase();
        if (collection === 'alimentaire') {
          const tagType = (tags.shop || tags.amenity || '').toLowerCase();
          if (tagType && tagType in environment.iconMap) collection = tagType;
        }
        if (!collection.endsWith('s')) collection += 's';

        this.http.delete(`http://localhost:3000/nodejs/${collection}/${lat}_${lon}/${key}`)
          .subscribe({
            next: () => console.log(`Tag ${key} supprimé dans ${collection}`),
            error: (err) => console.error('Erreur suppression tag :', err)
          });



        const field = icon.closest('.field');
        if (field) field.remove();
      }


      let el: HTMLElement | null = target;

      // --- Autres boutons (go/edit) ---
      while (el && el !== this.tooltipEl) {

        // bouton "Y aller"
        if (el.classList.contains('btn-go')) {
          evt.stopPropagation();
          if (!this.isLocalisationActive) {
            this.toggleLocalisation(this.languageService.currentLanguage);
          }
          const geom = this.currentFeature?.getGeometry();
          if (geom?.getType() === 'Point') {
            const coords = (geom as Point).getCoordinates();
            const lonLat = toLonLat(coords) as [number, number];
            this.routeService.fetchRouteWithUserPosition(lonLat);
          }
          return;
        }

        // bouton "Modifier"
        if (el.classList.contains('btn-edit')) {
          evt.stopPropagation();
          if (this.currentFeature) {
            this.openEditForm(this.currentFeature);
          }
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
      this.mapService.map.on('click', async (evt) => {
        const clickedFeature = this.mapService.map.forEachFeatureAtPixel(evt.pixel, f => f);

        if (clickedFeature) {
          await this.fillTooltip(clickedFeature);
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
      pinLayer: this.mapService.pinLayer,
      hotelLayer: this.mapService.hotelLayer,
      ...this.mapService.alimentaireLayer
    });
  }

  private async fillTooltip(featureLike: FeatureLike) {
    if (!(featureLike instanceof Feature)) return;
    const feature = featureLike as Feature<Geometry>;

    const geom = feature.getGeometry();
    if (!geom) return;

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
      return '';
    };

    const layerName = getLayerForFeature(feature);
    if (layerName && this.tooltipLayerMap[layerName]) {
      this.currentFeature = feature;
      const htmlOrPromise = this.tooltipLayerMap[layerName](feature);

// Vérifie si c'est une Promise (duck typing)
      const html = htmlOrPromise && typeof (htmlOrPromise as any).then === 'function'
        ? await htmlOrPromise
        : htmlOrPromise;

      this.tooltipEl.innerHTML = html as string;


    }
  }



  // Mise à jour des traductions et rafraîchissement du tooltip si visible
  async updateTranslations(translations: Record<string, string>) {
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

      realFeature.setProperties({ ...props, tags: newTags });


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
        try {
          const translation = await firstValueFrom(
            this.translationService.translate(part, lang)
          );
          return translation || part;
        } catch {
          return part;
        }
      })
    )
      .then(translated => this.capitalize(translated.join(' ')));
  }

  private capitalize(s: string):
    string {
      if (!s) return '';
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

  private async buildTagListHTML(tags: Record<string, any>, feature: Feature<Geometry>): Promise<string> {
    if (!tags) return '';

    const excluded = new Set([
      'geometry','features','id','layer','type','name',
      'brand','shop','amenity',
      'addr:housenumber','addr:street','addr:postcode','addr:city',
      'contact:housenumber','contact:street','contact:postcode','contact:city',
      'phone','contact:phone','email','contact:email',
      'website','contact:website','opening_hours','delivery','takeaway',
      'modifiedFields'
    ]);

    const lang = this.languageService.currentLanguage as 'fr' | 'en' | 'es' || 'fr';
    const isAdmin = this.userService.isAdmin();

    const modifiedFields: { key: string, modifiedBy: string }[] = tags['modifiedFields'] || [];

    let html = '<div class="tags-list">';

    const promises: Promise<string>[] = Object.entries(tags)
      .filter(([key, value]) => value && !excluded.has(key) && !/^name(:.+)?$/i.test(key))
      .map(async ([key, value]) => {
        const translatedKey = await this.translateOSMTag(key, lang);
        const parts = String(value).split(';').map(v => v.trim());

        const translatedValues = await Promise.all(
          parts.map(async p => {
            try {
              const t = await firstValueFrom(this.translationService.translate(p, lang));
              return this.capitalize(t || p);
            } catch {
              return p;
            }
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


}
