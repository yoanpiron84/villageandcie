import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  SimpleChanges,
  OnChanges,
  AfterViewInit,
  ElementRef,
  ViewChild
} from '@angular/core';
import { MapService } from '../../services/map';
import { SearchService } from '../../services/search';
import { RouteService } from '../../services/route';
import { LayerService } from '../../services/layer';
import { InteractionService } from '../../services/interaction';
import { fromLonLat, toLonLat } from 'ol/proj';
import { ZoomSlider } from 'ol/control';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Icon } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import {debounceTime, Subscription} from 'rxjs';
import { FormsModule } from '@angular/forms';
import {DecimalPipe, NgClass, NgForOf, NgIf, SlicePipe, TitleCasePipe} from '@angular/common';
import Overlay from 'ol/Overlay';
import {Geometry} from 'ol/geom';
import {EditFormComponent} from '../edit-form/edit-form';
import {LanguageService} from '../../services/language';
import {TranslationEntry} from '../app';
import {AddFormComponent} from '../add-form/add-form';
import {HttpClient} from '@angular/common/http';
import {UserService} from '../../services/user';


@Component({
  selector: 'app-map',
  templateUrl: './map.html',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    NgIf,
    NgForOf,
    NgClass,
    TitleCasePipe,
    SlicePipe,
    EditFormComponent,
    AddFormComponent
  ],
  styleUrls: ['./map.scss']
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @ViewChild('sidebarPanel', {static: true}) sidebarPanel!: ElementRef<HTMLDivElement>;
  @ViewChild('sidebarContent', {static: true}) sidebarContent!: ElementRef<HTMLDivElement>;
  @ViewChild('mapHost', {static: true}) mapHost!: ElementRef<HTMLDivElement>;


  @Input() showMap: boolean = true;
  @Input() translations: Record<string, TranslationEntry> = {};

  searchQuery: string = '';
  selectedMode: String = 'routed-car';
  userLocation: { lat: number; lon: number } | null = null;
  showViewOptions = false;

  private mapClickSub?: Subscription;
  private mapInitialized = false;

  public lastAction: (() => void) | null = null;

  public newCenter: [number, number] = [0, 0];

  panelOpen = false;
  panelHTML = '';

  isAdding = false;
  showAddForm = false;

  newPointCoords: { lat: number, lon: number } | null = null;

  showRoutineModal = false;


  // Fonctions et variables routine
  routineChoices = {
    manger: false,
    boire: false,
    dormir: false,
    culte: false,
    evenements: false
  };

  selectedCity: any = null;

  private timeRefreshInterval?: number;

  openRoutineModal() {
    this.showRoutineModal = true;
  }

  closeRoutineModal() {
    this.showRoutineModal = false;
  }

  applyRoutine() {
    const selectedChoices = Object.keys(this.routineChoices)
      .filter(key => this.routineChoices[key as keyof typeof this.routineChoices]);

    if (selectedChoices.length === 0) {
      return;
    }

    selectedChoices.forEach(choice => {
      switch (choice) {

        // 🍽️ MANGER
        case 'manger':
          this.layerService.showAlimentaire(
            'manger',
            this.languageService.currentLanguage,
            true,
            tags => this.mapService.isCurrentlyOpen(tags?.opening_hours)
          );
          break;

        // BOIRE
        case 'boire':
          this.layerService.showAlimentaire(
            'boire',
            this.languageService.currentLanguage,
            true,
            tags => this.mapService.isCurrentlyOpen(tags?.opening_hours)
          );
          break;

        // 🛏️ DORMIR
        case 'dormir':
          this.layerService.showHotel();
          break;

        // 🎭 ÉVÉNEMENTS
        case 'evenements':
          this.layerService.showEvent();
          break;

        case 'culte':
          this.layerService.showChurch(
            (tags) => this.mapService.isCurrentlyOpen(tags?.opening_hours)
          );
          break;

        // ⛪ CULTE
        case 'naturel':
          this.layerService.showGreen(
            (tags) => this.mapService.isCurrentlyOpen(tags?.opening_hours)
          );
          this.layerService.showWater(
            (tags) => this.mapService.isCurrentlyOpen(tags?.opening_hours)
          );
          break;
      }
    });

    // ✅ Ferme la modal
    this.showRoutineModal = false;
  }






  constructor(
    public mapService: MapService,
    public searchService: SearchService,
    public routeService: RouteService,
    public layerService: LayerService,
    public interactionService: InteractionService,
    public languageService: LanguageService,
    public userService: UserService,
    public http: HttpClient
  ) {
  }

  ngOnInit(): void {
    this.interactionService.translations = this.translations;

    // Abonnement clic carte
    this.mapService.map.on('click', (event) => {
      const [lon, lat] = toLonLat(event.coordinate);

      // Mode pin
      if (this.interactionService.isPinModeActive) {
        this.interactionService.placePin(lon, lat);
        return;
      }

      // Mode itinéraire
      if (this.routeService.isRouteModeActive) {
        // Si userPosition existe → départ = GPS, clic = arrivée
        if (this.mapService.userPosition && this.interactionService.isLocalisationActive) {
          this.routeService.onDestinationSelected(lon, lat);
          return;
        }

        // Sinon → mode classique à deux points
        this.routeService.routePoints.push([lon, lat]);

        if (this.routeService.routePoints.length === 2) {
          this.routeService.fetchRoute();
          this.routeService.routePoints = []; // reset pour prochain itinéraire
        }
      }

      // Mode ajout feature
      if (this.isAdding) {
        this.onMapClick(event);
      }
    });

    this.interactionService.setSidebarElements(
      this.sidebarPanel.nativeElement,
      this.sidebarContent.nativeElement,
      this.interactionService.mapElement,
    );

    this.interactionService.initTooltip();

    // Recherche avec debounce
    this.searchService.searchSubject.pipe(
      debounceTime(1000)
    ).subscribe(term => {
      this.searchService.performSearch(term, this.languageService.currentLanguage);
    });
  }


  ngAfterViewInit(): void {

    if (this.showMap && !this.mapInitialized) {
      this.mapService.map.setTarget('map-container');
      this.mapInitialized = true;
    }

    this.timeRefreshInterval = window.setInterval(() => {
      console.log("refresh");
      this.mapService.map.render();
    }, 10000);

    this.interactionService.setSidebarElements(
      this.sidebarPanel.nativeElement,
      this.sidebarContent.nativeElement,
      this.mapHost.nativeElement
    );

    // Tooltip opening_hours manquant
    const tooltip = document.createElement('div');
    tooltip.className = 'without-hours-tooltip';
    document.body.appendChild(tooltip);

    this.mapService.map.on('pointermove', evt => {
      const feature = this.mapService.map.forEachFeatureAtPixel(
        evt.pixel,
        f => f
      );

      if (!feature) {
        tooltip.style.display = 'none';
        return;
      }

      const clusterFeatures: Feature[] | undefined = feature.get('features');

      if (clusterFeatures && clusterFeatures.length > 1) {
        tooltip.style.display = 'none';
        return;
      }

      const realFeature =
        clusterFeatures && clusterFeatures.length === 1
          ? clusterFeatures[0]
          : feature;

      if (realFeature.get('isPin')) {
        tooltip.style.display = 'none';
        return;
      }

      const tags = realFeature.get('tags') || {};

      if (!tags.opening_hours) {
        const { clientX, clientY } = evt.originalEvent as MouseEvent;

        tooltip.innerText =
          'Attention, il n\'y a pas d\'horaires affichées';

        tooltip.style.left = clientX + 10 + 'px';
        tooltip.style.top = clientY + 10 + 'px';
        tooltip.style.display = 'block';
      } else {
        tooltip.style.display = 'none';
      }
    });

    this.mapService.map.getViewport().addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['showMap']) {
      if (changes['showMap'].currentValue) {
        setTimeout(() => this.attachMap(), 0);
      } else {
        // Cache → détache la carte
        this.mapService.map.setTarget(undefined);
      }
    }

    // Gestion du changement de langue → recentrage
    if (changes['this.languageService.currentLanguage'] && this.mapService.map) {
      switch (this.languageService.currentLanguage) {
        case 'fr':
          this.newCenter = [2.2137, 46.2276]; // France
          break;
        case 'en':
          this.newCenter = [-0.1276, 51.5074]; // Londres
          break;
        case 'es':
          this.newCenter = [-3.7038, 40.4168]; // Madrid
          break;
        default:
          this.newCenter = [2.2137, 46.2276]; // fallback France
      }

      setTimeout(() => {
        this.mapService.map.getView().animate({
          center: fromLonLat(this.newCenter),
          zoom: 6,
          duration: 1000
        });
      }, 0);
    }

    if (changes['translations']) {
      this.interactionService.updateTranslations(this.translations);
      this.layerService.translations = this.translations;
      this.layerService.initLayerLabels();
    }
  }


  ngOnDestroy(): void {
    this.mapClickSub?.unsubscribe();

    if (this.timeRefreshInterval) {
      clearInterval(this.timeRefreshInterval);
    }

    // Détache la carte si le composant est détruit
    this.mapService.map.setTarget(undefined);
  }

  private attachMap(): void {
    if (this.mapInitialized && this.mapService.map) {
      this.mapService.map.setTarget('map-container');
    }
  }

  /** Gère le clic sur la carte */

  /** Toggle mode itinéraire */
  toggleRouteMode(): void {
    this.routeService.toggleRouteMode();
    if (!this.routeService.isRouteModeActive) {
      this.routeService.showStepsCard = false;
    }
  }

  setRouteMode(mode: String): void {
    this.selectedMode = mode;
    this.routeService.setRouteMode(mode);
  }

  toggleBaseLayer(layer: 'osm' | 'satellite'): void {
    const {osmLayer, satelliteLayer, labelsLayer} = this.mapService;
    if (layer === 'osm') {
      osmLayer.setVisible(true);
      satelliteLayer.setVisible(false);
      labelsLayer.setVisible(false);
    } else {
      osmLayer.setVisible(false);
      satelliteLayer.setVisible(true);
      labelsLayer.setVisible(true);
    }
  }

  toggleViewOptions(): void {
    this.showViewOptions = !this.showViewOptions;
  }

  setMapView(view: 'osm' | 'satellite'): void {
    this.mapService.osmLayer.setVisible(view === 'osm');
    this.mapService.satelliteLayer.setVisible(view === 'satellite');
    this.mapService.labelsLayer.setVisible(view === 'satellite');
    this.showViewOptions = false;
  }

  onSearchInput(event: any) {
    const term = event.target.value;
    this.searchService.searchSubject.next(term);
    this.searchService.showDropdown = this.searchService.searchResults.length > 0;
  }

  onSearchBlur(): void {
    setTimeout(() => this.searchService.searchResults = [], 200);
  }

  selectResult(result: any) {
    this.searchService.searchTerm = result.display_name;
    this.searchService.showDropdown = false;
    this.layerService.updateCoordsForCity(result);
    this.layerService.zoomToResult(result);

    this.selectedCity = result;
  }

  // MODAL EDIT

  onFeatureClick(feature: Feature<Geometry>) {
    this.interactionService.selectedFeature = feature;
    this.interactionService.modalName = feature.get('tags')?.name || '';
    this.interactionService.modalTags = feature.get('tags') || {};
    this.interactionService.showModal = true;
  }

  onModalOk(event: { name: string }) {
    if (this.interactionService.selectedFeature) {
      const tags = {...this.interactionService.selectedFeature.get('tags'), name: event.name};
      this.interactionService.selectedFeature.set('tags', tags);
    }
    this.interactionService.showModal = false;
  }

  onModalCancel() {
    this.interactionService.showModal = false;
  }

  closePanel() {
    this.panelOpen = false;
    this.panelHTML = '';
  }

  get isPanelOpen(): boolean {
    return this.sidebarPanel?.nativeElement.classList.contains('open');
  }

  get modalTagsValues(): any[] {
    return Object.values(this.interactionService.modalTags || {});
  }


  tooltipHeader: string = '';
  tooltipTags: string = '';

  async showTooltip(feature: Feature<Geometry>, key: string) {
    this.tooltipHeader = `<div class="title">${feature.get('tags')?.name || 'Nom'}</div>
                        <div class="subtitle">${feature.get('tags')?.shop || feature.get('tags')?.amenity || key}</div>`;

    this.tooltipTags = await this.interactionService.buildTagListHTML(feature.get('tags'), feature);
  }

  startAddMode() {
    this.isAdding = true;
    alert("Clique sur la carte pour placer le nouveau point.");
  }

  onMapClick(e: any) {
    if (this.isAdding) {
      // Coordonnées en projection de la carte (EPSG:3857)
      const coords = e.coordinate;

      // Conversion en lat/lon WGS84
      const lonLat = toLonLat(coords);

      this.newPointCoords = {
        lat: lonLat[1],
        lon: lonLat[0]
      };

      this.showAddForm = true;
      this.isAdding = false;
    }
  }

}
