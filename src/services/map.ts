import {inject, Injectable} from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import {Fill, Icon, Stroke, Style} from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import Point from 'ol/geom/Point';
import {Cluster} from 'ol/source';
import Text from 'ol/style/Text';

import ClusterSource from 'ol/source/Cluster';

@Injectable({ providedIn: 'root' })
export class MapService {
  map!: Map;
  waitingMessage: string = '';

  // Tile layers
  osmLayer: TileLayer<OSM>;
  satelliteLayer: TileLayer<XYZ>;
  labelsLayer: TileLayer<XYZ>;

  // Vector layers
  pinLayer: VectorLayer<VectorSource>;
  searchLayer: VectorLayer<VectorSource>;
  waterLayer: VectorLayer<VectorSource>;
  greenLayer: VectorLayer<VectorSource>;
  restaurantLayer: VectorLayer<VectorSource>;
  churchLayer: VectorLayer<VectorSource>;
  hotelLayer: VectorLayer<VectorSource>;



  routePointLayer: VectorLayer<VectorSource>;
  routeLineLayer: VectorLayer<VectorSource>;


  // Position utilisateur centrale
  userPosition: { lat: number; lon: number } | null = null;

  constructor() {

    // === SOURCES ===
    const restaurantSource = new VectorSource();

    const churchSource = new VectorSource();
    const churchClusterSource = new ClusterSource({
      distance: 40,
      source: churchSource
    });


    const hotelSource = new VectorSource();
    const hotelClusterSource = new Cluster({
      distance: 40,
      source: hotelSource
    });


    // === STYLES ===
    const treeStyle = new Style({
      fill: new Fill({ color: 'green' }),
      stroke: new Stroke({ color: 'darkgreen', width: 1 })
    });

    const parkStyle = new Style({
      fill: new Fill({ color: 'rgba(34,139,34,0.3)' }),
      stroke: new Stroke({ color: 'green', width: 2 })
    });

    // === COUCHES ===

    // Eau
    this.waterLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const geomType = feature.getGeometry()?.getType();
        return geomType === 'LineString'
          ? new Style({ stroke: new Stroke({ color: 'blue', width: 2 }) })
          : new Style({
            fill: new Fill({ color: 'rgba(0,0,255,0.3)' }),
            stroke: new Stroke({ color: 'blue', width: 1 })
          });
      }
    });

    // Espaces verts
    this.greenLayer = new VectorLayer({
      source: new VectorSource(),
      declutter: true,
      style: (feature, resolution) => {
        const geom = feature.getGeometry();
        const geomType = geom?.getType();

        // Si très dézoomé → on affiche un rond au centre
        if (resolution > 5 && geom && geomType === 'Polygon') {
          const extent = geom.getExtent();
          const x = (extent[0] + extent[2]) / 2;
          const y = (extent[1] + extent[3]) / 2;

          return new Style({
            geometry: new Point([x, y]),
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: 'rgba(0,150,0,0.5)' }),
              stroke: new Stroke({ color: 'rgba(0,0,0,0.8)', width: 1 })
            })
          });
        }

        // Vue normale → rendu du polygone
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
          return new Style({
            fill: new Fill({ color: 'rgba(0,150,0,0.3)' }),
            stroke: new Stroke({ color: 'rgba(0,100,0,0.8)', width: 1 })
          });
        }

        // Fallback pour les points (ex. arbres)
        return new Style({
          image: new CircleStyle({
            radius: 4,
            fill: new Fill({ color: 'rgba(0,150,0,0.6)' }),
            stroke: new Stroke({ color: 'rgba(0,100,0,0.8)', width: 1 })
          })
        });
      }
    });

    // Pin utilisateur / routes
    this.pinLayer = new VectorLayer({
      source: new VectorSource()
    });

    // Satellite ESRI
    this.satelliteLayer = new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: '© ESRI'
      }),
      visible: true
    });

    // Labels sur satellite
    this.labelsLayer = new TileLayer({
      source: new XYZ({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        attributions: '© ESRI'
      }),
      visible: true
    });

    // OpenStreetMap
    this.osmLayer = new TileLayer({
      source: new OSM(),
      visible: false
    });

    // Restaurants
    this.restaurantLayer = new VectorLayer({
      source: restaurantSource,
      style: (feature, resolution) => {
        const scale = Math.min(0.03, 1 / (resolution * 5));
        return new Style({
          image: new Icon({
            src: '/images/restaurant.png',
            scale,
            anchor: [0.5, 1],
            crossOrigin: 'anonymous'
          })
        });
      }
    });

    // Églises

    // this.churchLayer = new VectorLayer({
    //   source: churchSource,
    //   style: (feature, resolution) => {
    //     const scale = Math.min(0.03, 1 / (resolution * 5));
    //     return new Style({
    //       image: new Icon({
    //         src: '/images/church.png',
    //         scale,
    //         anchor: [0.5, 1],
    //         crossOrigin: 'anonymous'
    //       })
    //     });
    //   }
    // });

    this.churchLayer = new VectorLayer({
      source: churchClusterSource,
      style: (feature, resolution) => {
        const features = feature.get('features');
        const size = features.length;

        const baseScale = Math.min(0.12, 0.8 / (resolution * 2));
        const scale = size > 1 ? baseScale * Math.min(size, 3) : baseScale;

        return new Style({
          image: new Icon({
            src: '/images/church.png',
            scale,
            anchor: [0.5, 1],
            crossOrigin: 'anonymous'
          })
        });
      }
    });



    this.hotelLayer = new VectorLayer({
      source: hotelClusterSource,
      declutter: true,
      style: (feature, resolution) => {
        const features = feature.get('features');

        if (!features || !features.length) {
          // Fallback en cas d'erreur ou de cluster vide
          return new Style({
            image: new CircleStyle({
              radius: 6,
              fill: new Fill({ color: 'gray' }),
              stroke: new Stroke({ color: '#333', width: 1 })
            }),
            text: new Text({
              text: '?',
              font: 'bold 12px sans-serif',
              fill: new Fill({ color: '#fff' }),
              stroke: new Stroke({ color: '#000', width: 2 })
            })
          });
        }

        const count = features.length;

        if (count === 1) {
          const hotelFeature = features[0];
          const tags = hotelFeature.get('tags') || {};
          const name = tags.name || '';

          const scale = Math.min(0.05, 0.6 / (resolution * 4));
          return new Style({
            image: new Icon({
              src: '/images/hotel.png',
              scale,
              anchor: [0.5, 1],
              crossOrigin: 'anonymous'
            }),
            text: new Text({
              text: name,
              offsetY: -25,
              font: '12px sans-serif',
              fill: new Fill({ color: '#333' }),
              stroke: new Stroke({ color: '#fff', width: 2 })
            })
          });
        } else {
          const radius = 10 + Math.min(count, 20);
          return new Style({
            image: new CircleStyle({
              radius,
              fill: new Fill({ color: 'rgba(0, 0, 255, 0.4)' }),
              stroke: new Stroke({ color: '#004080', width: 2 })
            }),
            text: new Text({
              text: count.toString(),
              font: 'bold 13px sans-serif',
              fill: new Fill({ color: '#fff' }),
              stroke: new Stroke({ color: '#000', width: 3 })
            })
          });
        }
      }
    });



    this.routePointLayer = new VectorLayer({ source: new VectorSource() });
    this.routeLineLayer = new VectorLayer({ source: new VectorSource() });
    this.searchLayer = new VectorLayer({ source: new VectorSource() });


    this.map = new Map({
      layers: [
        this.satelliteLayer,
        this.labelsLayer,
        this.osmLayer,
        this.waterLayer,
        this.greenLayer,
        this.restaurantLayer,
        this.churchLayer,
        this.hotelLayer,
        this.pinLayer
      ],
      view: new View({
        center: [0, 0],
        zoom: 6,
        minZoom: 3,
        maxZoom: 19
      }),
      controls: []
    });
  }
}
