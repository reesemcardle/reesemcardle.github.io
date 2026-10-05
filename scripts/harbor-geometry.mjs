import polygonClipping from "polygon-clipping";

export function coveragePolygon(bounds) {
  const { minLon: w, maxLon: e, minLat: s, maxLat: n } = bounds;
  return [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
}

export function buildSurface(features, bounds) {
  const coverage = coveragePolygon(bounds);
  const polygons = features.flatMap(({ geometry }) => {
    if (geometry?.type === "Polygon") return [geometry.coordinates];
    if (geometry?.type === "MultiPolygon") return geometry.coordinates;
    return [];
  }).filter(([outer]) => {
    const extent = outer.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    return extent[2] >= bounds.minLon && extent[0] <= bounds.maxLon && extent[3] >= bounds.minLat && extent[1] <= bounds.maxLat;
  });
  const land = polygons.length ? polygonClipping.intersection(polygons, coverage) : [];
  const water = land.length ? polygonClipping.difference(coverage, land) : [coverage];
  return { land, water };
}

export function surfaceFeatures(polygons, kind) {
  return polygons.map((rings, index) => ({
    id: `${kind}-${index}`, kind, closed: true, points: rings[0], rings
  }));
}
