declare module 'shpjs' {
  export interface ShpGeoJSON extends GeoJSON.FeatureCollection {
    fileName?: string
  }

  function shp(buffer: ArrayBuffer | string): Promise<ShpGeoJSON | ShpGeoJSON[]>
  export default shp
}
