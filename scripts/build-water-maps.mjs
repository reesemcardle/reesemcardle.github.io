import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildSurface, surfaceFeatures } from "./harbor-geometry.mjs";
import { harborBounds } from "./harbor-map.mjs";
import "./build-harbor-map.mjs";

const input = await readFile(new URL("../content/maps/water-source.geojson", import.meta.url), "utf8");
const source = JSON.parse(input);
if (source.type !== "FeatureCollection" || !source.features.length || source.exceededTransferLimit) {
  throw new Error("Expected a complete hydrography FeatureCollection");
}
const park = JSON.parse(await readFile(new URL("../content/maps/prospect-park-osm.json", import.meta.url), "utf8"));
const { land: water } = buildSurface(source.features, park.bounds);
await writeFile(new URL("../content/maps/prospect-park-water.json", import.meta.url), JSON.stringify({
  source: "US Census TIGERweb areal hydrography (2026); see water-sources.json",
  bounds: park.bounds,
  features: surfaceFeatures(water, "water")
}) + "\n");
await writeFile(new URL("../content/maps/water-sources.json", import.meta.url), JSON.stringify({
  source: "US Census Bureau, TIGERweb Areal Hydrography, January 1, 2026",
  url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer/1",
  query: { where: "1=1", geometry: [harborBounds.minLon, harborBounds.minLat, harborBounds.maxLon, harborBounds.maxLat].join(","), geometryType: "esriGeometryEnvelope", inSR: 4326, outSR: 4326, spatialRel: "esriSpatialRelIntersects", outFields: "NAME,MTFCC,AREAWATER", geometryPrecision: 6, maxAllowableOffset: 0.00001, f: "geojson" },
  retrieved: "2026-10-04",
  sha256: createHash("sha256").update(input).digest("hex"),
  featureCount: source.features.length,
  attribution: "U.S. Census Bureau (public domain); OSM detail layers retain OpenStreetMap attribution."
}, null, 2) + "\n");
console.log(`Built park water: ${water.length} polygons, with interior rings preserved`);
