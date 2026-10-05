import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildSurface, surfaceFeatures } from "./harbor-geometry.mjs";
import { harborBounds, harborSvg } from "./harbor-map.mjs";

const sourceFile = new URL("../content/maps/harbor-source.json", import.meta.url);
// Routine builds use the committed regional extract, not private downloads.
if (process.argv.includes("--refresh-source")) {
  const detailText = await readFile(new URL("../private/harbor-overpass.json", import.meta.url), "utf8");
  const osm = JSON.parse(detailText);
  const nodes = new Map(osm.elements.filter((e) => e.type === "node").map((e) => [e.id, [e.lon, e.lat]]));
  const details = osm.elements.filter((e) => e.type === "way").flatMap((way) => {
    const tags = way.tags || {};
    const kind = tags.leisure === "park" || tags.landuse === "recreation_ground" ? "land"
      : ["motorway", "trunk", "primary"].includes(tags.highway) ? "street"
      : tags.man_made === "pier" && tags.name ? "pier" : null;
    if (!kind || way.nodes.some((id) => !nodes.has(id))) return [];
    const points = way.nodes.map((id) => nodes.get(id));
    const closed = way.nodes[0] === way.nodes.at(-1);
    if (points.length < 2 || (kind === "land" && !closed)) return [];
    return [{ id: way.id, name: tags.name || "", kind, closed, points }];
  });
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  await writeFile(sourceFile, JSON.stringify({
    provenance: {
      details: { source: "Local Overpass extract", license: "ODbL-1.0", attribution: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright", sha256: hash(detailText) }
    },
    details
  }) + "\n");
}

const source = JSON.parse(await readFile(sourceFile, "utf8"));
const hydrography = JSON.parse(await readFile(new URL("../content/maps/water-source.geojson", import.meta.url), "utf8"));
// Partition from measured water areas, not a generalized global land outline.
const { land: water, water: land } = buildSurface(hydrography.features, harborBounds);
const output = {
  source: "US Census TIGERweb areal hydrography (2026), with OpenStreetMap details; see water-sources.json",
  bounds: harborBounds,
  features: [...surfaceFeatures(land, "landmass"), ...surfaceFeatures(water, "water"), ...source.details]
};
await writeFile(new URL("../content/maps/ny-harbor-osm.json", import.meta.url), JSON.stringify(output) + "\n");
await mkdir(new URL("../content/svg/", import.meta.url), { recursive: true });
await writeFile(new URL("../content/svg/harbor-basemap.svg", import.meta.url), harborSvg(output));
console.log(`Built harbor: ${land.length} land polygons, ${water.length} water polygons`);
