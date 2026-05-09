import { readFile, writeFile } from "node:fs/promises";

const inputFile = new URL("../private/harbor-overpass.json", import.meta.url);
const outputFile = new URL("../content/maps/ny-harbor-osm.json", import.meta.url);
const landFiles = [
  "bayonne.geojson",
  "brooklyn.geojson",
  "governors-island.geojson",
  "hoboken.geojson",
  "jersey-city.geojson",
  "manhattan.geojson",
  "queens.geojson",
  "staten-island.geojson"
];
const bounds = {
  minLat: 40.555,
  maxLat: 40.825,
  minLon: -74.12,
  maxLon: -73.925
};
const source = JSON.parse(await readFile(inputFile, "utf8"));
const nodes = new Map();
const features = await osmLandmasses();

for (const element of source.elements || []) {
  if (element.type === "node") {
    nodes.set(element.id, [element.lon, element.lat]);
  }
}

for (const element of source.elements || []) {
  if (element.type !== "way" || !Array.isArray(element.nodes)) continue;

  const points = element.nodes.map((id) => nodes.get(id)).filter(Boolean);
  if (points.length < 2) continue;

  const kind = featureKind(element.tags || {});
  if (!kind) continue;

  const length = featureLength(points);
  if (!keepFeature(kind, length)) continue;

  features.push({
    id: element.id,
    kind,
    name: element.tags?.name || "",
    closed: isClosed(points),
    points
  });
}

await writeFile(outputFile, `${JSON.stringify({
  source: "OpenStreetMap via Overpass API, fetched 2026-05-09",
  bounds,
  features
})}\n`);

function featureKind(tags) {
  if (tags.natural === "water" || tags.water || tags.waterway === "riverbank") return "water";
  if (tags.natural === "coastline") return "coastline";
  if (tags.man_made === "pier" || tags.man_made === "breakwater" || tags.man_made === "groyne") return "pier";
  if (tags.leisure === "park" || tags.landuse === "recreation_ground") return "land";
  if (tags.highway === "motorway" || tags.highway === "trunk" || tags.highway === "primary") {
    return "street";
  }
  if (tags.highway === "secondary") return "service";
  if (tags.railway === "rail" || tags.railway === "subway") return "path";
  return null;
}

async function osmLandmasses() {
  const landmasses = [];

  for (const file of landFiles) {
    const geojson = JSON.parse(await readFile(new URL(`../private/harbor-land/${file}`, import.meta.url), "utf8"));
    const feature = geojson.features?.[0];
    if (!feature?.geometry) continue;

    geometryRings(feature.geometry).forEach((ring, index) => {
      const points = simplifyRing(ring, 0.00035);
      if (points.length < 4) return;

      landmasses.push({
        id: `landmass-${file.replace(".geojson", "")}-${index}`,
        kind: "landmass",
        name: feature.properties?.display_name || file,
        closed: true,
        points
      });
    });
  }

  return landmasses;
}

function geometryRings(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function simplifyRing(points, tolerance) {
  const simplified = [points[0]];
  let previous = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= tolerance) {
      simplified.push(point);
      previous = point;
    }
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

function keepFeature(kind, length) {
  if (kind === "street") return length > 0.015;
  if (kind === "service") return length > 0.03;
  if (kind === "path") return length > 0.05;
  if (kind === "land") return length > 0.004;
  return true;
}

function featureLength(points) {
  return points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]);
  }, 0);
}

function isClosed(points) {
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}
