import test from "node:test";
import assert from "node:assert/strict";
import {stampUpdatedDate} from "../scripts/deploy.mjs";

test("publication date uses New York time and stays unchanged on same-day deploys", () => {
  const html = '<footer><small id="lastUpdated">Last updated May 25, 2026</small></footer>';
  const date = new Date("2026-10-06T01:00:00Z");
  const updated = stampUpdatedDate(html, date);
  assert.equal(updated, '<footer><small id="lastUpdated">Last updated October 5, 2026</small></footer>');
  assert.equal(stampUpdatedDate(updated, date), updated);
  assert.throws(() => stampUpdatedDate("", date));
  assert.throws(() => stampUpdatedDate(html + html, date));
});
