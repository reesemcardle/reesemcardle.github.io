import test from 'node:test';
import assert from 'node:assert/strict';
import {photoPlaybackOrder, photoPlaybackDelays} from '../scripts/archery-playback.mjs';

test('photo reveal is repeatable, preserves every mark, and leaves source order untouched', () => {
  const shots = Array.from({length: 60}, (_, i) => ({shotId:`impact-${i}`, x:i % 5 / 10, y:i / 100}));
  const original = structuredClone(shots);
  const ordered = photoPlaybackOrder(shots, 'target-a');
  assert.deepEqual(shots, original);
  assert.deepEqual(photoPlaybackOrder([...shots].reverse(), 'target-a'), ordered);
  assert.notDeepEqual(ordered, shots);
  assert.notDeepEqual(photoPlaybackOrder(shots, 'target-b'), ordered);
  assert.equal(new Set(ordered).size, shots.length);
  assert.ok(ordered.every(shot => shots.includes(shot)));
  assert.deepEqual(photoPlaybackOrder([], 'empty'), []);
});

test('photo reveal timing is bounded, pauses between ends, and follows speed controls', () => {
  for (const count of [2, 16, 54, 82, 200]) {
    const delays = photoPlaybackDelays(count);
    assert.equal(delays.length, count);
    assert.equal(delays[0], 0);
    assert.ok(delays.at(-1) >= 8000 && delays.at(-1) <= 12000);
    assert.ok(delays.every((delay, i) => i === 0 || delay > delays[i - 1]));
    assert.deepEqual(photoPlaybackDelays(count, 2), delays.map(delay => delay / 2));
    if (count > 3) assert.ok(delays[3] - delays[2] > delays[2] - delays[1]);
  }
  assert.deepEqual(photoPlaybackDelays(0), []);
  assert.deepEqual(photoPlaybackDelays(1), [0]);
  assert.throws(() => photoPlaybackDelays(5, 0));
});
