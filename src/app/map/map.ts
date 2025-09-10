import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { GeoJSON } from 'ol/format';
import CircleStyle from 'ol/style/Circle';
import {XYZ} from 'ol/source';


@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  styleUrls: ['./map.scss']
})
export class MapComponent implements OnInit {
  private map!: Map;
  private waterLayer!: VectorLayer<VectorSource>;
  private greenLayer!: VectorLayer<VectorSource>;

  constructor(private http: HttpClient) {}
  coords = "44.17,5.43,44.19,5.45";

  ngOnInit(): void {
    this.initMap();
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

    // Couche Satellite ESRI
    const satelliteLayer = new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: '© ESRI'
      })
    });

    const labelsLayer = new TileLayer({
      source: new XYZ({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        attributions: '© ESRI'
      })
    });


    // Création de la carte
    this.map = new Map({
      target: 'map-container',
      layers: [
        satelliteLayer,  // fond satellite
        labelsLayer,     // noms des villes et routes
        this.waterLayer,
        this.greenLayer
      ],
      view: new View({
        center: fromLonLat([5.43, 44.17]), // Montbrun-les-Bains
        zoom: 15,
        minZoom: 3,
        maxZoom: 19
      })
    });
  }

  // PARCS



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


}
