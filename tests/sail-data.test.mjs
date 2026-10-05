import test from "node:test";
import assert from "node:assert/strict";
import { prepareSail } from "../scripts/sail-data.mjs";

const points = [{ lon: -74.04, lat: 40.7 }, { lon: -74.02, lat: 40.71 }];
test("untimed sails retain distance and replay without inventing measured speed", () => {
  const sail = prepareSail(points);
  assert.equal(sail.hasRecordedTiming, false);
  assert.equal(sail.stats.avgMph, null);
  assert.equal(sail.stats.hours, null);
  assert.ok(sail.stats.miles > 0);
  assert.ok(sail.playbackHours > 0);
  assert.ok(sail.points.every((point) => Number.isFinite(Date.parse(point.time))));
  assert.ok(points.every((point) => !point.time));
});
test("complete increasing timestamps produce measured speed", () => {
  const sail = prepareSail(points.map((point, i) => ({ ...point, time: `2026-05-09T1${i}:00:00Z` })));
  assert.equal(sail.hasRecordedTiming, true);
  assert.equal(sail.stats.hours, 1);
  assert.equal(sail.stats.avgMph, sail.stats.miles);
});
test("partial or invalid timestamps are replay-only", () => {
  for (const time of [undefined, "invalid", "2026-05-09T09:00:00Z"]) {
    assert.equal(prepareSail([{ ...points[0], time: "2026-05-09T10:00:00Z" }, { ...points[1], time }]).stats.avgMph, null);
  }
});
