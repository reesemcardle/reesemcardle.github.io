// Illustrative order for completed target photos, never a claim about shot history.
function randomFor(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function photoPlaybackOrder(shots, seed) {
  const random = randomFor(seed);
  const remaining = [...shots].sort((a, b) => String(a.shotId).localeCompare(String(b.shotId), 'en'));
  const ordered = [];
  while (remaining.length) {
    // Each loose end starts anywhere, so distant impacts aren't saved for last.
    const anchor = remaining.splice(Math.floor(random() * remaining.length), 1)[0];
    ordered.push(anchor);
    for (let i = 1; i < 3 && remaining.length; i++) {
      let index;
      if (random() < .28) {
        index = Math.floor(random() * remaining.length);
      } else {
        const nearby = remaining.map((shot, index) => ({index, distance: Math.hypot(shot.x - anchor.x, shot.y - anchor.y)}))
          .sort((a, b) => a.distance - b.distance).slice(0, 4);
        index = nearby[Math.floor(random() * nearby.length)].index;
      }
      ordered.push(remaining.splice(index, 1)[0]);
    }
  }
  return ordered;
}

export function photoPlaybackDelays(count, speed = 1) {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error('Playback speed must be positive.');
  if (count <= 0) return [];
  if (count === 1) return [0];
  const duration = Math.max(8000, Math.min(12000, count * 130)) / speed;
  const weights = [0];
  for (let i = 1; i < count; i++) weights.push(weights.at(-1) + (i % 3 === 0 ? 2.2 : 1));
  return weights.map(weight => weight / weights.at(-1) * duration);
}
