import test from 'node:test';
import assert from 'node:assert/strict';
import {densityField} from '../scripts/archery-density.mjs';
test('density includes outliers, uses image Y orientation, and accumulates nearby impacts', () => {
  const points = [{x:0, y:.3}, {x:0, y:.3}, {x:1.4, y:-.4}];
  const field = densityField(points, 128);
  assert.ok(field.extent > 1.4);
  const at = (x,y) => field.values[Math.round((field.extent-y)/(2*field.extent)*127)*128 + Math.round((x+field.extent)/(2*field.extent)*127)];
  assert.ok(at(0,.3) > at(1.4,-.4));
  assert.ok(at(1.4,-.4) > .8);
  assert.equal(at(0,-.3),0);
  const double = densityField([...points,...points],128);
  assert.ok(Math.abs(double.peak / field.peak - 2) < 1e-6);
  assert.equal(densityField([]).peak,0);
});
