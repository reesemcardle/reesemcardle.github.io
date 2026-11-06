import test from 'node:test';
import assert from 'node:assert/strict';
import {newestFirst} from '../scripts/content-order.mjs';
test('navigation orders actual dates newest first without mutating content or promoting undated items', () => {
  const items=[{id:'old',date:'2026-01-01'},{id:'missing'},{id:'recent',date:new Date('2026-11-06')},{id:'invalid',date:'bad'},{id:'middle',date:'2026-06-05'}];
  assert.deepEqual(newestFirst(items,x=>x.date).map(x=>x.id),['recent','middle','old','missing','invalid']);
  assert.equal(items[0].id,'old');
  assert.deepEqual(newestFirst([],x=>x.date),[]);
  const tied=[{date:'2026-01-01T01:00:00Z'},{date:'2025-12-31T20:00:00-05:00'}];
  assert.deepEqual(newestFirst(tied,x=>x.date),tied);
});
