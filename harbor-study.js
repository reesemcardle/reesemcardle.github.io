const harborMapFile = "content/maps/ny-harbor-osm.json";
const sailFiles = [
  { id: "sail-1", label: "Sail Sample 1", file: "private/sampledata/SailSample1.gpx" },
  { id: "sail-2", label: "Sail Sample 2", file: "private/sampledata/SailSample2.gpx" },
  { id: "sail-3", label: "Sail Sample 3", file: "private/sampledata/SailSample3.gpx" }
];

const frame = {
  x: 70,
  y: 42,
  width: 1460,
  height: 930
};

const frames = {
  harbor: {
    minLat: 40.555,
    maxLat: 40.825,
    minLon: -74.12,
    maxLon: -73.925
  },
  upperBay: {
    minLat: 40.555,
    maxLat: 40.735,
    minLon: -74.12,
    maxLon: -73.925
  },
  hudson: {
    minLat: 40.66,
    maxLat: 40.835,
    minLon: -74.055,
    maxLon: -73.94
  },
  eastRiver: {
    minLat: 40.67,
    maxLat: 40.81,
    minLon: -74.02,
    maxLon: -73.92
  }
};

const sailAnimation = {
  minDuration: 14000,
  maxDuration: 44000,
  msPerTrackHour: 12000
};

const els = {
  land: document.getElementById("studyLand"),
  coast: document.getElementById("studyCoast"),
  piers: document.getElementById("studyPiers"),
  sailGhosts: document.getElementById("studySailGhosts"),
  sailReplayBase: document.getElementById("studySailReplayBase"),
  sailPath: document.getElementById("studySailPath"),
  sailPoint: document.getElementById("studySailPoint"),
  sailControl: document.getElementById("sailControl"),
  frameControl: document.getElementById("frameControl"),
  rotationControl: document.getElementById("rotationControl"),
  rotationValue: document.getElementById("rotationValue"),
  tiltControl: document.getElementById("tiltControl"),
  tiltValue: document.getElementById("tiltValue"),
  speedButtons: document.querySelectorAll("#speedControl button")
};

const state = {
  harborMap: null,
  sails: [],
  selectedSailIndex: 0,
  playbackSpeed: 2,
  animationFrame: null
};

init();

async function init() {
  const [harborMap, sails] = await Promise.all([
    loadJson(harborMapFile),
    loadSails()
  ]);

  state.harborMap = harborMap;
  state.sails = sails;
  populateSailControl();
  wireControls();
  render();
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

async function loadText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.text();
}

async function loadSails() {
  return Promise.all(sailFiles.map(async (sail) => {
    const points = withSyntheticTimes(parseGpx(await loadText(sail.file)));
    return {
      ...sail,
      points,
      bounds: boundsForPoints(points),
      stats: getTrackStats(points)
    };
  }));
}

function populateSailControl() {
  els.sailControl.textContent = "";

  state.sails.forEach((sail, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = sail.label;
    els.sailControl.append(option);
  });
}

function wireControls() {
  els.sailControl.addEventListener("change", () => {
    state.selectedSailIndex = Number(els.sailControl.value);
    render();
  });
  els.frameControl.addEventListener("change", render);
  els.rotationControl.addEventListener("input", () => {
    els.rotationValue.textContent = els.rotationControl.value;
    render();
  });
  els.tiltControl.addEventListener("input", () => {
    els.tiltValue.textContent = els.tiltControl.value;
    document.documentElement.style.setProperty("--study-tilt", `${els.tiltControl.value}deg`);
  });
  els.speedButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.playbackSpeed = Number(button.dataset.speed);
      els.speedButtons.forEach((speedButton) => {
        speedButton.classList.toggle("is-active", speedButton === button);
      });
      render();
    });
  });
  document.documentElement.style.setProperty("--study-tilt", `${els.tiltControl.value}deg`);
}

function render() {
  resetAnimation();

  const selectedSail = state.sails[state.selectedSailIndex];
  const bounds = selectedBounds(selectedSail);
  const projection = createProjection(bounds, frame, Number(els.rotationControl.value));
  renderBasemap(bounds, projection);
  renderSails(bounds, projection);
}

function selectedBounds(selectedSail) {
  if (els.frameControl.value !== "auto") return frames[els.frameControl.value];
  return cinematicBoundsForTrack(selectedSail?.bounds || frames.harbor);
}

function cinematicBoundsForTrack(bounds) {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lonSpan = bounds.maxLon - bounds.minLon;
  const isNorthSouth = latSpan > lonSpan * 1.28;
  const latPad = Math.max(latSpan * (isNorthSouth ? 0.42 : 0.62), 0.035);
  const lonPad = Math.max(lonSpan * (isNorthSouth ? 0.92 : 0.58), 0.035);

  return constrainBounds({
    minLat: bounds.minLat - latPad,
    maxLat: bounds.maxLat + latPad,
    minLon: bounds.minLon - lonPad,
    maxLon: bounds.maxLon + lonPad
  }, frames.harbor);
}

function constrainBounds(bounds, limit) {
  return {
    minLat: Math.max(bounds.minLat, limit.minLat),
    maxLat: Math.min(bounds.maxLat, limit.maxLat),
    minLon: Math.max(bounds.minLon, limit.minLon),
    maxLon: Math.min(bounds.maxLon, limit.maxLon)
  };
}

function renderBasemap(bounds, projection) {
  const layers = {
    landmass: els.land,
    land: els.land,
    coastline: els.coast,
    pier: els.piers
  };

  [els.land, els.coast, els.piers].forEach((layer) => {
    layer.textContent = "";
  });

  for (const feature of state.harborMap.features.filter((feature) => featureTouchesBounds(feature, bounds))) {
    const layer = layers[feature.kind];
    if (!layer) continue;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", geoPointsToPath(feature.points, feature.closed, projection));
    path.setAttribute("class", `is-${feature.kind}`);
    layer.append(path);
  }
}

function renderSails(bounds, projection) {
  els.sailGhosts.textContent = "";

  state.sails.forEach((sail, index) => {
    const segments = projectedSegmentsForTrack(sail.points, bounds, projection);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", projectedSegmentsToPath(segments, 0.72));
    if (index === state.selectedSailIndex) path.setAttribute("class", "is-selected");
    els.sailGhosts.append(path);
  });

  const selected = state.sails[state.selectedSailIndex];
  const selectedSegments = projectedSegmentsForTrack(selected.points, bounds, projection);
  animateSelectedSail(selected, selectedSegments);
}

function animateSelectedSail(sail, projectedSegments) {
  const timeline = createTrackTimeline(projectedSegments);
  const last = timeline[timeline.length - 1]?.point;

  if (timeline.length < 2 || !last) {
    setReplayPath(projectedSegmentsToPath(projectedSegments, 0.72));
    if (last) moveSailPoint(last);
    return;
  }

  showReplayElements(true);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setReplayPath(projectedSegmentsToPath(projectedSegments, 0.72));
    moveSailPoint(last);
    return;
  }

  const duration = Math.min(
    sailAnimation.maxDuration,
    Math.max(sailAnimation.minDuration, sail.stats.hours * sailAnimation.msPerTrackHour)
  ) / state.playbackSpeed;

  renderSailAnimationFrame(timeline, 0);

  const startedAt = performance.now();
  const step = (timestamp) => {
    const progress = Math.min((timestamp - startedAt) / duration, 1);
    renderSailAnimationFrame(timeline, progress);

    if (progress < 1) {
      state.animationFrame = requestAnimationFrame(step);
    } else {
      state.animationFrame = null;
    }
  };

  state.animationFrame = requestAnimationFrame(step);
}

function renderSailAnimationFrame(timeline, progress) {
  const first = timeline[0];
  const last = timeline[timeline.length - 1];

  if (progress >= 1) {
    setReplayPath(visibleTimelineToPath(timeline, timeline.length, last.point));
    moveSailPoint(last.point);
    return;
  }

  const target = first.time + (last.time - first.time) * progress;

  for (let index = 1; index < timeline.length; index += 1) {
    const current = timeline[index];
    if (current.time < target) continue;

    const previous = timeline[index - 1];
    const span = Math.max(current.time - previous.time, 1);
    const localProgress = (target - previous.time) / span;
    const marker = interpolatePoint(previous.point, current.point, localProgress);

    setReplayPath(visibleTimelineToPath(timeline, index, marker));
    moveSailPoint(marker);
    return;
  }

  setReplayPath(visibleTimelineToPath(timeline, timeline.length, last.point));
  moveSailPoint(last.point);
}

function resetAnimation() {
  if (state.animationFrame !== null) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  els.sailPath.setAttribute("d", "");
  els.sailReplayBase.setAttribute("d", "");
  showReplayElements(false);
}

function showReplayElements(isVisible) {
  [els.sailPath, els.sailReplayBase, els.sailPoint].forEach((element) => {
    if (isVisible) {
      element.removeAttribute("hidden");
    } else {
      element.setAttribute("hidden", "");
    }
  });
}

function setReplayPath(pathValue) {
  els.sailPath.setAttribute("d", pathValue);
  els.sailReplayBase.setAttribute("d", pathValue);
}

function moveSailPoint(point) {
  els.sailPoint.setAttribute("cx", point.x.toFixed(2));
  els.sailPoint.setAttribute("cy", point.y.toFixed(2));
}

function projectedSegmentsForTrack(points, bounds, projection) {
  return segmentPointsInBounds(points, bounds).map((segment) => {
    return segment.map((point) => ({
      ...projection(point.lon, point.lat),
      lat: point.lat,
      lon: point.lon,
      time: point.time
    }));
  });
}

function createTrackTimeline(projectedSegments) {
  const timeline = [];
  let cumulativeMeters = 0;

  projectedSegments.forEach((segment, segmentIndex) => {
    segment.forEach((point, index) => {
      const previous = index > 0 ? segment[index - 1] : null;
      if (previous) cumulativeMeters += haversineMeters(previous, point);

      timeline.push({
        cumulativeMeters,
        time: new Date(point.time).getTime(),
        point,
        pointIndex: index,
        segmentIndex
      });
    });
  });

  return timeline.filter((point) => Number.isFinite(point.time));
}

function visibleTimelineToPath(timeline, stopIndex, marker) {
  const segments = [];
  let currentSegment = [];
  let currentSegmentIndex = null;

  for (let index = 0; index < stopIndex; index += 1) {
    const item = timeline[index];
    if (item.segmentIndex !== currentSegmentIndex) {
      if (currentSegment.length) segments.push(currentSegment);
      currentSegment = [];
      currentSegmentIndex = item.segmentIndex;
    }

    currentSegment.push(item.point);
  }

  if (marker) {
    const markerSegmentIndex = timeline[Math.max(stopIndex - 1, 0)].segmentIndex;
    if (markerSegmentIndex !== currentSegmentIndex && currentSegment.length) {
      segments.push(currentSegment);
      currentSegment = [];
    }

    currentSegment.push(marker);
  }

  if (currentSegment.length) segments.push(currentSegment);
  return projectedSegmentsToPath(segments, 0);
}

function interpolatePoint(a, b, progress) {
  return {
    x: a.x + (b.x - a.x) * progress,
    y: a.y + (b.y - a.y) * progress
  };
}

function createProjection(bounds, targetFrame, rotationDegrees) {
  const min = mercator(bounds.minLon, bounds.maxLat);
  const max = mercator(bounds.maxLon, bounds.minLat);
  const scale = Math.min(
    targetFrame.width / (max.x - min.x),
    targetFrame.height / (max.y - min.y)
  );
  const projectedWidth = (max.x - min.x) * scale;
  const projectedHeight = (max.y - min.y) * scale;
  const offsetX = targetFrame.x + (targetFrame.width - projectedWidth) / 2;
  const offsetY = targetFrame.y + (targetFrame.height - projectedHeight) / 2;
  const centerX = targetFrame.x + targetFrame.width / 2;
  const centerY = targetFrame.y + targetFrame.height / 2;
  const rotation = rotationDegrees * Math.PI / 180;

  return (lon, lat) => {
    const point = mercator(lon, lat);
    const projected = {
      x: offsetX + (max.x - point.x) * scale,
      y: offsetY + (point.y - min.y) * scale
    };
    const dx = projected.x - centerX;
    const dy = projected.y - centerY;

    return {
      x: centerX + dx * Math.cos(rotation) - dy * Math.sin(rotation),
      y: centerY + dx * Math.sin(rotation) + dy * Math.cos(rotation)
    };
  };
}

function mercator(lon, lat) {
  const radians = Math.PI / 180;
  return {
    x: lon,
    y: Math.log(Math.tan(Math.PI / 4 + (lat * radians) / 2)) / radians
  };
}

function parseGpx(xml) {
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

function withSyntheticTimes(points) {
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

function geoPointsToPath(points, closed, projection) {
  const projected = points.map(([lon, lat]) => projection(lon, lat));
  return projectedPointsToPath(projected, closed);
}

function projectedSegmentsToPath(segments, tolerance) {
  return segments
    .map((segment) => projectedPointsToPath(simplifyPoints(segment, tolerance)))
    .filter(Boolean)
    .join(" ");
}

function projectedPointsToPath(points, closed = false) {
  if (!points.length) return "";

  const [first, ...rest] = points;
  const path = rest.reduce((value, point) => {
    return `${value} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`);

  return closed ? `${path} Z` : path;
}

function simplifyPoints(points, tolerance) {
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

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function segmentPointsInBounds(points, bounds) {
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

function pointInBounds(point, bounds) {
  return point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lon >= bounds.minLon &&
    point.lon <= bounds.maxLon;
}

function featureTouchesBounds(feature, bounds) {
  return feature.points.some(([lon, lat]) => {
    return lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lon >= bounds.minLon &&
      lon <= bounds.maxLon;
  });
}

function boundsForPoints(points) {
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

function getTrackStats(points) {
  const meters = points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + haversineMeters(points[index - 1], point);
  }, 0);
  const firstTime = new Date(points[0].time).getTime();
  const lastTime = new Date(points[points.length - 1].time).getTime();
  const hours = Math.max((lastTime - firstTime) / 3600000, 0.01);

  return {
    meters,
    hours
  };
}

function haversineMeters(a, b) {
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

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}
