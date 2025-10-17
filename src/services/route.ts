import { Injectable } from '@angular/core';
import { MapService } from './map';
import { HttpClient } from '@angular/common/http';
import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Vector as VectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import {Style, Stroke, Fill, Circle as CircleStyle, Icon} from 'ol/style';
import Overlay from 'ol/Overlay';
import { GeoJSON } from 'ol/format';

@Injectable({ providedIn: 'root' })
export class RouteService {
  isRouteModeActive = false;
  routePoints: [number, number][] = [];
  lastRoutePoints: [number, number][] = [];
  routeInfo: { distance: number; duration: number; steps: any[] } | null = null;
  routeMode: String = 'routed-car';

  showStepsCard = false;


  routeLineLayer: VectorLayer<VectorSource> | null = null;
  routePointLayer: VectorLayer<VectorSource> | null = null;
  private routeHoverListener: any = null;

  constructor(private mapService: MapService, private http: HttpClient) {}

  toggleRouteMode() {
    this.isRouteModeActive = !this.isRouteModeActive;
    this.routePoints = [];
    this.routeInfo = null;

    if (!this.routeLineLayer) {
      this.routeLineLayer = new VectorLayer({
        source: new VectorSource(),
        style: new Style({ stroke: new Stroke({ color: 'red', width: 4 }) })
      });
      this.mapService.map.addLayer(this.routeLineLayer);
    }

    if (!this.isRouteModeActive) {
      this.clearRoute();
    }
  }

  private clearRoute() {
    this.routeLineLayer?.getSource()?.clear();
    this.routePointLayer?.getSource()?.clear();
    if (this.routePointLayer) this.mapService.map.removeLayer(this.routePointLayer);
    this.routePointLayer = null;
    if (this.routeLineLayer) this.mapService.map.removeLayer(this.routeLineLayer);
    this.routeLineLayer = null;
    const overlays = this.mapService.map.getOverlays().getArray();
    overlays.forEach(o => {
      const el = o.getElement() as HTMLElement;
      if (el?.classList.contains('tooltip-card-itineraire')) this.mapService.map.removeOverlay(o);
    });
    if (this.routeHoverListener) {
      this.mapService.map.un('pointermove', this.routeHoverListener);
      this.routeHoverListener = null;
    }
    this.lastRoutePoints = [];
  }

  setRouteMode(mode: String) {
    this.routeMode = mode;
    if (this.lastRoutePoints.length >= 2) {
      this.routePoints = [...this.lastRoutePoints];
      this.fetchRoute();
    }
  }

  private async reverseGeocode(lat: number, lon: number): Promise<string | null> {
    const url = `/api/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    try {
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'QuixOfUs/1.0 (yoan.piron@example.com)' }
      });
      if (!resp.ok) throw new Error('HTTP Error');
      const data = await resp.json();
      const addr = data.address;
      if (!addr) return null;
      const road = addr.road || addr.street || addr.pedestrian || addr.footway || '';
      const locality = addr.city || addr.town || addr.village || addr.hamlet || '';
      let name = '';
      if (road) name += road;
      if (locality) name += (name ? ', ' : '') + locality;
      return name || null;
    } catch (e) {
      console.error('Erreur reverse geocode:', e);
      return null;
    }
  }

  fetchRoute() {
    if (this.routePoints.length < 2 && this.lastRoutePoints.length < 2) return;
    const points = this.routePoints.length >= 2 ? this.routePoints : this.lastRoutePoints;
    const coordsStr = points.map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://routing.openstreetmap.de/${this.routeMode}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true&annotations=true&continue_straight=false`;

    console.log(url);

    this.http.get<any>(url).subscribe({
      next: async (data) => {
        if (!data.routes?.length) return;
        const route = data.routes[0];
        this.routeInfo = { distance: route.distance, duration: route.duration, steps: route.legs[0].steps };
        this.lastRoutePoints = points;

        const [lon0, lat0] = points[0];
        const [lon1, lat1] = points[points.length - 1];
        const [startName, endName] = await Promise.all([this.reverseGeocode(lat0, lon0), this.reverseGeocode(lat1, lon1)]);

        if (!this.routeLineLayer) {
          this.routeLineLayer = new VectorLayer({
            source: new VectorSource(),
            style: new Style({ stroke: new Stroke({ color: 'red', width: 4 }) })
          });
          this.mapService.map.addLayer(this.routeLineLayer);
        }
        const lineFeatures = new GeoJSON().readFeatures(
          { type: 'Feature', geometry: route.geometry },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        );
        this.routeLineLayer.getSource()?.clear();
        this.routeLineLayer.getSource()?.addFeatures(lineFeatures);

        if (!this.routePointLayer) {
          this.routePointLayer = new VectorLayer({ source: new VectorSource() });
          this.mapService.map.addLayer(this.routePointLayer);
        }

        const startPoint = new Feature({ geometry: new Point(fromLonLat(points[0])), name: 'Départ' });
        const endPoint = new Feature({ geometry: new Point(fromLonLat(points[points.length - 1])), name: 'Arrivée' });

        startPoint.setStyle(new Style({
          image: new CircleStyle({ radius: 6, fill: new Fill({ color: 'green' }), stroke: new Stroke({ color: '#000', width: 1 }) })
        }));
        endPoint.setStyle(new Style({
          image: new CircleStyle({ radius: 6, fill: new Fill({ color: 'red' }), stroke: new Stroke({ color: '#000', width: 1 }) })
        }));

        this.routePointLayer.getSource()?.clear();
        this.routePointLayer.getSource()?.addFeatures([startPoint, endPoint]);

        let tooltipEl = document.querySelector('.tooltip-card-itineraire') as HTMLElement;
        if (!tooltipEl) {
          tooltipEl = document.createElement('div');
          tooltipEl.className = 'tooltip-card-itineraire';
          document.body.appendChild(tooltipEl);
        }

        const tooltipOverlay = new Overlay({ element: tooltipEl, offset: [10, 0], positioning: 'bottom-left' });
        if (!this.mapService.map.getOverlays().getArray().includes(tooltipOverlay)) this.mapService.map.addOverlay(tooltipOverlay);

        if (this.routeHoverListener) this.mapService.map.un('pointermove', this.routeHoverListener);
        this.routeHoverListener = (evt: any) => {
          const feature = this.mapService.map.forEachFeatureAtPixel(
            evt.pixel,
            f => f,
            { layerFilter: l => l === this.routePointLayer || l === this.routeLineLayer, hitTolerance: 6 }
          );
          if (!feature) {
            tooltipEl.style.display = 'none';
            tooltipOverlay.setPosition(undefined);
            return;
          }
          if (feature === startPoint)
            tooltipEl.innerHTML = `🚗 <b>Départ</b><br>${startName || 'Chargement...'}<br><small>X: ${points[0][0]} | Y: ${points[0][1]}</small>`;
          else if (feature === endPoint)
            tooltipEl.innerHTML = `🏁 <b>Arrivée</b><br>${endName || 'Chargement...'}<br><small>X: ${points[points.length - 1][0]} | Y: ${points[points.length - 1][1]}</small>`;
          else if (feature.getGeometry()?.getType() === 'LineString' && this.routeInfo)
            tooltipEl.innerHTML = `📏 ${(this.routeInfo.distance / 1000).toFixed(2)} km<br>🕒 ${Math.floor(this.routeInfo.duration / 60)} min`;
          tooltipOverlay.setPosition(evt.coordinate);
          tooltipEl.style.display = 'block';
        };

        this.mapService.map.on('pointermove', this.routeHoverListener);
      },
      error: (err) => console.error('Erreur OSRM:', err)
    });

    this.routePoints = [];
  }

}
