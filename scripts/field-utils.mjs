export async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

export async function loadText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.text();
}

export function parseGpx(xml) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  return [...documentXml.getElementsByTagNameNS("*", "trkpt")]
    .map((point) => {
      const time = point.getElementsByTagNameNS("*", "time")[0]?.textContent || null;
      return {
        lat: Number(point.getAttribute("lat")),
        lon: Number(point.getAttribute("lon")),
        time
      };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

export function withSyntheticTimes(points) {
  if (!points.length || points.every((point) => point.time)) return points;

  const baseTime = Date.UTC(2026, 4, 9, 12, 0, 0);
  const totalDuration = 90 * 60 * 1000;
  const cumulative = [0];

  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + haversineMeters(points[index - 1], points[index]);
  }

  const totalMeters = Math.max(cumulative[cumulative.length - 1], 1);
  return points.map((point, index) => ({
    ...point,
    time: point.time || new Date(baseTime + totalDuration * (cumulative[index] / totalMeters)).toISOString()
  }));
}

export function createProjection(bounds, frame, rotationDegrees = 0) {
  const min = mercator(bounds.minLon, bounds.maxLat);
  const max = mercator(bounds.maxLon, bounds.minLat);
  const scale = Math.min(
    frame.width / (max.x - min.x),
    frame.height / (min.y - max.y)
  );
  const projectedWidth = (max.x - min.x) * scale;
  const projectedHeight = (min.y - max.y) * scale;
  const offsetX = frame.x + (frame.width - projectedWidth) / 2;
  const offsetY = frame.y + (frame.height - projectedHeight) / 2;
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const rotation = rotationDegrees * Math.PI / 180;

  return (lon, lat) => {
    const point = mercator(lon, lat);
    const projected = {
      x: offsetX + (point.x - min.x) * scale,
      y: offsetY + (min.y - point.y) * scale
    };

    if (!rotationDegrees) return projected;

    const dx = projected.x - centerX;
    const dy = projected.y - centerY;
    return {
      x: centerX + dx * Math.cos(rotation) - dy * Math.sin(rotation),
      y: centerY + dx * Math.sin(rotation) + dy * Math.cos(rotation)
    };
  };
}

export function geoPointsToPath(points, closed, projection) {
  return projectedPointsToPath(points.map(([lon, lat]) => projection(lon, lat)), closed);
}

export function projectedSegmentsToPath(segments, tolerance) {
  return segments
    .map((segment) => projectedPointsToPath(simplifyPoints(segment, tolerance)))
    .filter(Boolean)
    .join(" ");
}

export function projectedPointsToPath(points, closed = false) {
  if (!points.length) return "";

  const [first, ...rest] = points;
  const path = rest.reduce((value, point) => {
    return `${value} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`);

  return closed ? `${path} Z` : path;
}

export function simplifyPoints(points, tolerance) {
  if (points.length <= 2) return points;

  const simplified = [points[0]];
  let previous = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (distanceBetween(previous, point) >= tolerance) {
      simplified.push(point);
      previous = point;
    }
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

export function segmentPointsInBounds(points, bounds) {
  const segments = [];
  let current = [];

  points.forEach((point) => {
    if (pointInBounds(point, bounds)) {
      current.push(point);
    } else if (current.length) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
  });

  if (current.length > 1) segments.push(current);
  return segments;
}

export function projectedSegmentsForTrack(points, bounds, projection) {
  return segmentPointsInBounds(points, bounds).map((segment) => {
    return segment.map((point) => ({
      ...projection(point.lon, point.lat),
      lat: point.lat,
      lon: point.lon,
      time: point.time
    }));
  });
}

export function pointInBounds(point, bounds) {
  return point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lon >= bounds.minLon &&
    point.lon <= bounds.maxLon;
}

export function featureTouchesBounds(feature, bounds) {
  return feature.points.some(([lon, lat]) => {
    return lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lon >= bounds.minLon &&
      lon <= bounds.maxLon;
  });
}

export function boundsForPoints(points) {
  return points.reduce((acc, point) => ({
    minLat: Math.min(acc.minLat, point.lat),
    maxLat: Math.max(acc.maxLat, point.lat),
    minLon: Math.min(acc.minLon, point.lon),
    maxLon: Math.max(acc.maxLon, point.lon)
  }), {
    minLat: Infinity,
    maxLat: -Infinity,
    minLon: Infinity,
    maxLon: -Infinity
  });
}

export function getTrackStats(points) {
  const meters = points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + haversineMeters(points[index - 1], point);
  }, 0);
  const firstTime = new Date(points[0].time).getTime();
  const lastTime = new Date(points[points.length - 1].time).getTime();
  const hours = Math.max((lastTime - firstTime) / 3600000, 0.01);
  const miles = meters / 1609.344;

  return {
    meters,
    miles,
    hours,
    avgMph: miles / hours
  };
}

export function haversineMeters(a, b) {
  const earthRadius = 6371000;
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat +
    Math.cos(latA) * Math.cos(latB) * sinLon * sinLon;

  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function mercator(lon, lat) {
  const radians = Math.PI / 180;
  return {
    x: lon,
    y: Math.log(Math.tan(Math.PI / 4 + (lat * radians) / 2)) / radians
  };
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}
