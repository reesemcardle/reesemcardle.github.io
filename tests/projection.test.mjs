import test from "node:test";
import assert from "node:assert/strict";
import { createProjection } from "../scripts/field-utils.mjs";

const bounds = { minLon: -74.12, maxLon: -73.925, minLat: 40.555, maxLat: 40.825 };
const frame = { x: 125, y: 58, width: 1350, height: 900 };

test("north-up projection fits geographic corners inside the frame", () => {
  const project = createProjection(bounds, frame);
  const nw = project(bounds.minLon, bounds.maxLat);
  const se = project(bounds.maxLon, bounds.minLat);
  assert.ok(nw.x < se.x, "east must move right");
  assert.ok(nw.y < se.y, "south must move down");
  for (const point of [nw, se]) {
    assert.ok(point.x >= frame.x - 1e-8 && point.x <= frame.x + frame.width + 1e-8);
    assert.ok(point.y >= frame.y - 1e-8 && point.y <= frame.y + frame.height + 1e-8);
  }
  assert.ok(Math.abs((nw.x + se.x) / 2 - (frame.x + frame.width / 2)) < 1e-8);
  assert.ok(Math.abs((nw.y + se.y) / 2 - (frame.y + frame.height / 2)) < 1e-8);
});

test("rotation preserves distance from the frame center", () => {
  const flat = createProjection(bounds, frame)(-74.04, 40.7);
  const rotated = createProjection(bounds, frame, -29)(-74.04, 40.7);
  const radius = (p) => Math.hypot(p.x - frame.x - frame.width / 2, p.y - frame.y - frame.height / 2);
  assert.ok(Math.abs(radius(flat) - radius(rotated)) < 1e-8);
});
