import osmtogeojson from "osmtogeojson";
import polygonClipping from "polygon-clipping";
import {surfaceFeatures} from "./harbor-geometry.mjs";

export const roadTypes = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/;

export function detailQuery(b) {
  const box = [b.minLat,b.minLon,b.maxLat,b.maxLon].join(",");
  return `[out:json][timeout:60][maxsize:268435456];(way[highway~"${roadTypes.source}"](${box});nwr[leisure~"^(park|nature_reserve)$"](${box});nwr[landuse=recreation_ground](${box}););out geom;`;
}

export function buildDetails(snapshot, land) {
  if(snapshot.remark || !Array.isArray(snapshot.elements) || !snapshot.elements.length) {
    throw new Error("Incomplete or empty OSM detail snapshot");
  }
  const features = osmtogeojson(snapshot,{flatProperties:false}).features;
  const result = [];
  const parks = [];
  for(const feature of features) {
    const tags = feature.properties.tags || {};
    const road = roadTypes.test(tags.highway || "");
    const park = /^(park|nature_reserve)$/.test(tags.leisure || "") || tags.landuse === "recreation_ground";
    if(!road && !park) continue;
    if(feature.properties.tainted) throw new Error("Incomplete OSM geometry: " + feature.id);
    const {type,coordinates} = feature.geometry;
    if(road && /^(LineString|MultiLineString)$/.test(type)) {
      const lines = type === "LineString" ? [coordinates] : coordinates;
      lines.forEach((points,index) => result.push({id:`${feature.id}-${index}`,kind:"street",closed:false,points}));
    }
    if(park && /^(Polygon|MultiPolygon)$/.test(type)) {
      parks.push(...(type === "Polygon" ? [coordinates] : coordinates));
    }
  }
  // Clip the whole park layer once, rather than reprocessing every shoreline for each park.
  // Hydrography owns the shoreline; green areas must stay on dry land.
  if(parks.length)result.push(...surfaceFeatures(polygonClipping.intersection(parks,land),"land"));
  return result;
}
