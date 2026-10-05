import test from "node:test";
import assert from "node:assert/strict";
import { fitCamera, launchCenter } from "../scripts/map-camera.mjs";

test("camera contains the full route with padding at portrait and landscape sizes", () => {
  const points = [{ x: 200, y: 100 }, { x: 850, y: 600 }, { x: 300, y: 400 }];
  for (const aspect of [0.65, 1.25, 2]) {
    const box = fitCamera(points, aspect);
    assert.ok(Math.abs(box.width / box.height - aspect) < 1e-9);
    for (const point of points) {
      assert.ok(point.x > box.x && point.x < box.x + box.width);
      assert.ok(point.y > box.y && point.y < box.y + box.height);
    }
  }
});

test("launch center uses the common endpoint cluster instead of a distant finish", () => {
  const home = { lon: -74.01, lat: 40.753 };
  const center = launchCenter([
    { points: [home, home] },
    { points: [home, { lon: -74.1, lat: 40.6 }] }
  ]);
  assert.ok(Math.abs(center.lon - home.lon) < 1e-8);
  assert.ok(Math.abs(center.lat - home.lat) < 1e-8);
});
