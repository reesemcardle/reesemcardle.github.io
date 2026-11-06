// A fixed-width Gaussian kernel keeps individual impacts comparable across targets.
export function densityField(shots, size = 640, bandwidth = .035) {
  const points = shots.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const extent = points.reduce((max, p) => Math.max(max, Math.abs(p.x) + bandwidth * 3, Math.abs(p.y) + bandwidth * 3), 1.15);
  const values = new Float32Array(size * size);
  const scale = (size - 1) / (extent * 2), sigma = bandwidth * scale, reach = Math.ceil(sigma * 3);
  for (const p of points) {
    const cx = (p.x + extent) * scale, cy = (extent - p.y) * scale;
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(size - 1, Math.ceil(cy + reach)); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(size - 1, Math.ceil(cx + reach)); x++) {
        const distance = ((x - cx) ** 2 + (y - cy) ** 2) / (sigma * sigma);
        if (distance <= 9) values[y * size + x] += Math.exp(-distance / 2);
      }
    }
  }
  let peak = 0;
  for (const value of values) peak = Math.max(peak, value);
  return {values, peak, extent, size};
}

export function renderArcheryDensity(root, shots, radius) {
  root.replaceChildren();
  if (!shots.length) return;
  const {values, peak, extent, size} = densityField(shots);
  if (!peak) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(size, size);
  for (let i = 0; i < values.length; i++) {
    pixels.data[i * 4] = 32;
    pixels.data[i * 4 + 1] = 83;
    pixels.data[i * 4 + 2] = 83;
    // Normalize to the peak so the overlay doesn't become solid as history grows.
    pixels.data[i * 4 + 3] = Math.round(245 * Math.pow(values[i] / peak, 1.05));
  }
  context.putImageData(pixels, 0, 0);
  const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  image.setAttribute('x', -extent * radius);
  image.setAttribute('y', -extent * radius);
  image.setAttribute('width', extent * radius * 2);
  image.setAttribute('height', extent * radius * 2);
  image.setAttribute('href', canvas.toDataURL());
  root.append(image);
}
