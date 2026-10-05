import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import polygonClipping from "polygon-clipping";
import { buildSurface, coveragePolygon } from "../scripts/harbor-geometry.mjs";
import { harborBounds, harborPaths, harborProjection, harborSvg } from "../scripts/harbor-map.mjs";

test("land holes and disconnected islands survive clipping", () => {
  const bounds = { minLon: 0, maxLon: 10, minLat: 0, maxLat: 10 };
  const features = [{ geometry: { type: "MultiPolygon", coordinates: [
    [[[1, 1], [8, 1], [8, 8], [1, 8], [1, 1]], [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
    [[[9, 9], [12, 9], [12, 12], [9, 12], [9, 9]]]
  ] } }];
  const { land, water } = buildSurface(features, bounds);
  assert.equal(land.length, 2);
  assert.ok(land.some((polygon) => polygon.length === 2));
  assert.equal(water.length, 2, "the lake must remain water");
  assert.deepEqual(polygonClipping.intersection(land, water), []);
  assert.deepEqual(polygonClipping.xor(polygonClipping.union(land, water), coveragePolygon(bounds)), []);
});

test("harbor surfaces partition only the declared geographic coverage", async () => {
  const data = JSON.parse(await readFile(new URL("../content/maps/ny-harbor-osm.json", import.meta.url)));
  const land = data.features.filter((f) => f.kind === "landmass").map((f) => f.rings);
  const water = data.features.filter((f) => f.kind === "water").map((f) => f.rings);
  assert.deepEqual(polygonClipping.intersection(land, water), []);
  assert.deepEqual(polygonClipping.xor(polygonClipping.union(land, water), coveragePolygon(harborBounds)), []);
  for (const [name, x, y, expected] of [
    ["Central Park", -73.9654, 40.7829, land],
    ["Brooklyn", -73.99, 40.665, land],
    ["Hudson River", -74.018, 40.735, water],
    ["Upper Bay", -74.045, 40.66, water],
    ["Lower Bay", -74.04, 40.51, water],
    ["Governors Island", -74.016, 40.689, land],
    ["Liberty Island", -74.0445, 40.6892, land],
    ["Ellis Island", -74.0396, 40.6995, land]
  ]) {
    const probe = [[[x, y], [x + 0.00001, y], [x + 0.00001, y + 0.00001], [x, y + 0.00001], [x, y]]];
    assert.ok(polygonClipping.intersection(expected, probe).length, `${name} must lie on the expected surface`);
  }
  const svg = harborSvg(data);
  for (const group of harborPaths(data, harborProjection())) {
    for (const path of group.paths) assert.ok(svg.includes(path.d), "export and runtime must use identical geometry");
  }
  assert.ok(!svg.includes("NaN"));
});

test("park water is closed polygon geometry and preserves lake islands", async () => {
  const data = JSON.parse(await readFile(new URL("../content/maps/prospect-park-water.json", import.meta.url)));
  assert.ok(data.features.length > 0);
  assert.ok(data.features.some((feature) => feature.rings.length > 1), "lake islands must remain holes");
  const water = data.features.map((feature) => feature.rings);
  for (const feature of data.features) {
    assert.equal(feature.closed, true);
    for (const ring of feature.rings) assert.deepEqual(ring[0], ring.at(-1));
    for (const hole of feature.rings.slice(1)) {
      assert.deepEqual(polygonClipping.intersection(water, [hole]), [], "island interiors must not be filled with water");
    }
  }
});
