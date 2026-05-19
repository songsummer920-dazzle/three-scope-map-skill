export type Position = [number, number];

export interface GeoFeature {
  type: 'Feature';
  properties: {
    name?: string;
    fullname?: string;
    center?: Position;
    [key: string]: unknown;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: Position[][] | Position[][][];
  };
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}
