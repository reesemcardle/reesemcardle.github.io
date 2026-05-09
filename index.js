const rideIndexFile = "content/rides/ride-index.json";
const rideMetadataFile = "content/rides/ride-metadata.json";
const basemapFile = "content/maps/prospect-park-osm.json";
const harborBasemapFile = "content/maps/ny-harbor-osm.json";
const archerySessionIndexFile = "content/archery/session-index.json";
const archeryTargetFile = "content/archery/targets/fita-40-single-10-ring.json";
const archeryArrowsFile = "content/archery/equipment/arrows.json";
const sailFiles = [
  { id: "sail-1", label: "Sail Sample 1", file: "private/sampledata/SailSample1.gpx" },
  { id: "sail-2", label: "Sail Sample 2", file: "private/sampledata/SailSample2.gpx" },
  { id: "sail-3", label: "Sail Sample 3", file: "private/sampledata/SailSample3.gpx" }
];

const mapFrame = {
  x: 125,
  y: 58,
  width: 1350,
  height: 900
};

const parkFocusBounds = {
  minLat: 40.649,
  maxLat: 40.6735,
  minLon: -73.981,
  maxLon: -73.954
};

const harborFocusBounds = {
  minLat: 40.555,
  maxLat: 40.825,
  minLon: -74.12,
  maxLon: -73.925
};

const sailingFrames = {
  harbor: harborFocusBounds,
  hudson: {
    minLat: 40.66,
    maxLat: 40.835,
    minLon: -74.045,
    maxLon: -73.94
  },
  upperBay: {
    minLat: 40.555,
    maxLat: 40.735,
    minLon: -74.12,
    maxLon: -73.925
  },
  eastRiver: {
    minLat: 40.67,
    maxLat: 40.805,
    minLon: -74.02,
    maxLon: -73.925
  }
};

const rideAnimation = {
  minDuration: 16000,
  maxDuration: 41600,
  msPerRideHour: 17600,
  speedSampleWindowMs: 24000,
  metricUpdateIntervalMs: 300
};

const sailAnimation = {
  minDuration: 14000,
  maxDuration: 44000,
  msPerTrackHour: 12000
};

const archeryAnimation = {
  shotIntervalMs: 260,
  targetRadius: 360
};

const metadataCache = {
  prefix: "reese-field-metadata:v1",
  currentTtl: 10 * 60 * 1000,
  historicalTtl: 365 * 24 * 60 * 60 * 1000
};

const metadataRequests = new Map();

const els = {
  contact: document.querySelector(".contact-link"),
  cyclingVisual: document.getElementById("cyclingVisual"),
  sailingVisual: document.getElementById("sailingVisual"),
  archeryVisual: document.getElementById("archeryVisual"),
  modePlaceholder: document.getElementById("modePlaceholder"),
  placeholderTitle: document.getElementById("placeholderTitle"),
  placeholderText: document.getElementById("placeholderText"),
  modeButtons: document.querySelectorAll(".mode-button"),
  cameraButtons: document.querySelectorAll(".camera-button"),
  speedButtons: document.querySelectorAll(".speed-button"),
  mapLand: document.getElementById("mapLand"),
  mapWater: document.getElementById("mapWater"),
  mapStreets: document.getElementById("mapStreets"),
  mapPaths: document.getElementById("mapPaths"),
  harborLand: document.getElementById("harborLand"),
  harborCoast: document.getElementById("harborCoast"),
  harborPaths: document.getElementById("harborPaths"),
  sailGhosts: document.getElementById("sailGhosts"),
  sailReplayBase: document.getElementById("sailReplayBase"),
  sailPath: document.getElementById("sailPath"),
  sailPoint: document.getElementById("sailPoint"),
  archeryShots: document.getElementById("archeryShots"),
  rideGhosts: document.getElementById("rideGhosts"),
  rideReplayBase: document.getElementById("rideReplayBase"),
  ridePath: document.getElementById("ridePath"),
  ridePoint: document.getElementById("ridePoint"),
  rideLiveMetrics: document.getElementById("rideLiveMetrics"),
  liveMiles: document.getElementById("liveMiles"),
  liveSpeed: document.getElementById("liveSpeed"),
  metaStatusLabel: document.getElementById("metaStatusLabel"),
  metaDate: document.getElementById("metaDate"),
  metaWindLabel: document.getElementById("metaWindLabel"),
  metaTideLabel: document.getElementById("metaTideLabel"),
  metaWeatherLabel: document.getElementById("metaWeatherLabel"),
  metaWind: document.getElementById("metaWind"),
  metaTide: document.getElementById("metaTide"),
  metaWeather: document.getElementById("metaWeather"),
  rideMilesLabel: document.getElementById("rideMilesLabel"),
  rideSpeedLabel: document.getElementById("rideSpeedLabel"),
  rideMiles: document.getElementById("rideMiles"),
  rideSpeed: document.getElementById("rideSpeed"),
  equipmentLabel: document.getElementById("equipmentLabel"),
  equipmentValue: document.getElementById("equipmentValue")
};

const state = {
  mode: "cycling",
  cameraPreset: "steep",
  cameraByMode: {
    cycling: "steep",
    sailing: "steep",
    archery: "flat"
  },
  playbackSpeed: 1,
  rides: [],
  sails: [],
  archerySessions: [],
  archeryTarget: null,
  archeryArrows: [],
  harborBasemap: null,
  speedRange: { min: 0, max: 0 },
  rideMetadata: { rides: {} },
  selectedRideIndex: null,
  selectedSailIndex: 0,
  selectedArcherySessionIndex: null,
  projection: null,
  harborProjection: null,
  rideAnimationFrame: null,
  sailAnimationFrame: null,
  archeryAnimationTimeouts: [],
  liveMetricsUpdatedAt: 0
};

const placeholderCopy = {
  sailing: {
    title: "Sailing",
    text: "New York Harbor traces will render here"
  },
  archery: {
    title: "Archery",
    text: "Reconstructed target sessions will render here"
  }
};

const formatDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York"
});

init();

async function init() {
  wireContactLink();
  wireControls();

  const [basemap, harborBasemap, rideMetadata, sails, archery] = await Promise.all([
    loadJson(basemapFile),
    loadJson(harborBasemapFile),
    loadRideMetadata(),
    loadSails(),
    loadArchery()
  ]);
  setCameraPreset(state.cameraPreset);
  state.rideMetadata = rideMetadata;
  state.harborBasemap = harborBasemap;
  state.archeryTarget = archery.target;
  state.archeryArrows = archery.arrows;
  state.projection = createProjection(parkFocusBounds, mapFrame);
  const rides = await loadRides();
  state.rides = rides;
  state.sails = sails;
  state.archerySessions = archery.sessions;
  state.speedRange = getSpeedRange(rides);

  renderBasemap(basemap, {
    bounds: parkFocusBounds,
    projection: state.projection,
    layers: {
      land: els.mapLand,
      water: els.mapWater,
      street: els.mapStreets,
      service: els.mapStreets,
      path: els.mapPaths
    }
  });
  renderRideState();
  renderSailingState();
  setMode(initialMode());
  await updateMetadata();
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

function initialMode() {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  return ["cycling", "sailing", "archery"].includes(requestedMode) ? requestedMode : state.mode;
}

async function loadRideMetadata() {
  try {
    return await loadJson(rideMetadataFile);
  } catch (error) {
    return { rides: {} };
  }
}

async function loadSails() {
  return Promise.all(sailFiles.map(async (sail) => {
    const response = await fetch(sail.file, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${sail.file}`);

    const points = withSyntheticTimes(parseGpx(await response.text()));
    return {
      ...sail,
      points,
      bounds: boundsForPoints(points),
      stats: getRideStats(points)
    };
  }));
}

async function loadArchery() {
  const [sessionIndex, target, arrows] = await Promise.all([
    loadJson(archerySessionIndexFile),
    loadJson(archeryTargetFile),
    loadJson(archeryArrowsFile)
  ]);
  const sessions = await Promise.all(sessionIndex.map(async (sessionEntry) => {
    const session = await loadJson(`content/archery/${sessionEntry.file}`);
    return normalizeArcherySession(session, sessionEntry);
  }));

  return {
    target,
    arrows,
    sessions: sessions.sort((a, b) => a.startedAt - b.startedAt)
  };
}

function normalizeArcherySession(session, sessionEntry) {
  const shots = session.ends.flatMap((end) => {
    return end.shots.map((shot) => ({
      ...shot,
      endNumber: end.endNumber
    }));
  });

  return {
    ...sessionEntry,
    ...session,
    startedAt: new Date(session.startedAt),
    shots
  };
}

async function loadRides() {
  const rideIndex = await loadJson(rideIndexFile);
  const rides = await Promise.all(rideIndex.map(async (ride) => {
    const file = `content/rides/${ride.file}`;
    const response = await fetch(file, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${file}`);

    const points = parseGpx(await response.text());
    const visibleSegments = segmentPointsInBounds(points, parkFocusBounds);
    const visiblePoints = visibleSegments.flat();
    const projectedSegments = visibleSegments.map((segment) => segment.map((point) => ({
      ...(state.projection ? state.projection(point.lon, point.lat) : point),
      lat: point.lat,
      lon: point.lon,
      time: point.time
    })));

    return {
      ...ride,
      file,
      points,
      visiblePoints,
      projectedSegments,
      stats: getRideStats(visiblePoints.length > 1 ? visiblePoints : points),
      startDate: new Date((visiblePoints[0] || points[0]).time),
      endDate: new Date((visiblePoints[visiblePoints.length - 1] || points[points.length - 1]).time)
    };
  }));

  return rides.sort((a, b) => a.startDate - b.startDate);
}

function wireContactLink() {
  if (!els.contact) return;

  const address = `${els.contact.dataset.emailUser}@${els.contact.dataset.emailDomain}`;
  els.contact.href = `mailto:${address}`;
  els.contact.addEventListener("mouseenter", () => {
    els.contact.textContent = address;
  }, { once: true });
  els.contact.addEventListener("focus", () => {
    els.contact.textContent = address;
  }, { once: true });
}

function wireControls() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.mode);
    });
  });

  document.querySelectorAll(".trace-controls button").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.mode === "sailing") {
        if (button.dataset.action === "all") {
          selectAllSails();
        } else if (button.dataset.action === "previous") {
          selectAdjacentSail(-1);
        } else {
          selectAdjacentSail(1);
        }
      } else if (state.mode === "archery") {
        if (button.dataset.action === "all") {
          selectAllArcherySessions();
        } else if (button.dataset.action === "previous") {
          selectAdjacentArcherySession(-1);
        } else {
          selectAdjacentArcherySession(1);
        }
      } else if (button.dataset.action === "all") {
        selectAllRides();
      } else if (button.dataset.action === "previous") {
        selectAdjacentRide(-1);
      } else {
        selectAdjacentRide(1);
      }
    });
  });

  els.cameraButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCameraPreset(button.dataset.cameraPreset);
    });
  });

  els.speedButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setPlaybackSpeed(Number(button.dataset.playbackSpeed));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      selectAdjacentTrace(-1);
    }
    if (event.key === "ArrowRight") {
      selectAdjacentTrace(1);
    }
    if (event.key === "Escape") {
      selectAllTraces();
    }
  });
}

function selectAdjacentTrace(direction) {
  if (state.mode === "sailing") {
    selectAdjacentSail(direction);
  } else if (state.mode === "archery") {
    selectAdjacentArcherySession(direction);
  } else {
    selectAdjacentRide(direction);
  }
}

function selectAllTraces() {
  if (state.mode === "sailing") {
    selectAllSails();
  } else if (state.mode === "archery") {
    selectAllArcherySessions();
  } else {
    selectAllRides();
  }
}

function setCameraPreset(preset) {
  state.cameraPreset = preset;
  state.cameraByMode[state.mode] = preset;
  document.documentElement.dataset.cameraPreset = preset;

  els.cameraButtons.forEach((button) => {
    const isActive = button.dataset.cameraPreset === preset;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setPlaybackSpeed(speed) {
  if (!Number.isFinite(speed) || speed <= 0) return;

  state.playbackSpeed = speed;
  els.speedButtons.forEach((button) => {
    const isActive = Number(button.dataset.playbackSpeed) === speed;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (state.mode === "sailing") {
    renderSailingState();
  } else if (state.mode === "archery") {
    renderArcheryState();
  } else if (state.selectedRideIndex !== null) {
    renderRideState();
  }
}

function createSailingProjection(bounds) {
  return createProjection(bounds, mapFrame, -29);
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
  }, harborFocusBounds);
}

function constrainBounds(bounds, limit) {
  return {
    minLat: Math.max(bounds.minLat, limit.minLat),
    maxLat: Math.min(bounds.maxLat, limit.maxLat),
    minLon: Math.max(bounds.minLon, limit.minLon),
    maxLon: Math.min(bounds.maxLon, limit.maxLon)
  };
}

function sailingFrameForTrack(points) {
  if (!points?.length) return sailingFrames.harbor;

  const bounds = points.reduce((acc, point) => ({
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
  const latSpan = bounds.maxLat - bounds.minLat;
  const lonSpan = bounds.maxLon - bounds.minLon;

  if (latSpan > lonSpan * 1.45 && bounds.minLon < -74.04) return sailingFrames.hudson;
  if (bounds.maxLon > -73.96 && latSpan > lonSpan) return sailingFrames.eastRiver;
  return sailingFrames.upperBay;
}

function setMode(mode) {
  state.mode = mode;
  setCameraPreset(state.cameraByMode[mode] || state.cameraPreset);

  els.modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const isCycling = mode === "cycling";
  const isSailing = mode === "sailing";
  const isArchery = mode === "archery";
  setSvgHidden(els.cyclingVisual, !isCycling);
  els.cyclingVisual.style.display = isCycling ? "" : "none";
  setSvgHidden(els.sailingVisual, !isSailing);
  els.sailingVisual.style.display = isSailing ? "" : "none";
  setSvgHidden(els.archeryVisual, !isArchery);
  els.archeryVisual.style.display = isArchery ? "" : "none";
  els.modePlaceholder.hidden = isCycling || isSailing || isArchery;
  els.modePlaceholder.style.display = isCycling || isSailing || isArchery ? "none" : "";
  setLiveMetricsVisible(isCycling && state.selectedRideIndex !== null);
  if (isSailing) renderSailingState();
  if (!isSailing) resetSailAnimation();
  if (isCycling) renderRideState();

  if (isArchery) renderArcheryState();
  if (!isArchery) resetArcheryAnimation();

  if (!isCycling && !isSailing && !isArchery) {
    els.placeholderTitle.textContent = placeholderCopy[mode].title;
    els.placeholderText.textContent = placeholderCopy[mode].text;
  }
}

function renderArcheryState() {
  resetArcheryAnimation();
  if (!state.archerySessions.length || !state.archeryTarget) {
    renderArcheryStats(null);
    return;
  }

  if (state.selectedArcherySessionIndex === null) {
    const allShots = state.archerySessions.flatMap((session) => {
      return session.shots.map((shot) => ({ ...shot, sessionId: session.sessionId }));
    });
    plotArcheryShots(allShots, "all");
    renderArcheryStats(null);
    return;
  }

  const session = state.archerySessions[state.selectedArcherySessionIndex];
  els.archeryShots.textContent = "";
  animateArcherySession(session);
  renderArcheryStats(session);
}

function plotArcheryShots(shots, variant = "session") {
  els.archeryShots.textContent = "";
  shots.forEach((shot, index) => {
    els.archeryShots.append(createArcheryShotCircle(shot, index, variant));
  });
}

function animateArcherySession(session) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    plotArcheryShots(session.shots, "session");
    return;
  }

  session.shots.forEach((shot, index) => {
    const timeout = window.setTimeout(() => {
      els.archeryShots.append(createArcheryShotCircle(shot, index, "session"));
    }, index * archeryAnimation.shotIntervalMs / state.playbackSpeed);
    state.archeryAnimationTimeouts.push(timeout);
  });
}

function resetArcheryAnimation() {
  state.archeryAnimationTimeouts.forEach((timeout) => window.clearTimeout(timeout));
  state.archeryAnimationTimeouts = [];
  if (els.archeryShots) els.archeryShots.textContent = "";
}

function createArcheryShotCircle(shot, index, variant) {
  const point = archeryPointToSvg(shot);
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("class", `archery-shot is-${variant}`);
  circle.setAttribute("cx", point.x.toFixed(2));
  circle.setAttribute("cy", point.y.toFixed(2));
  circle.setAttribute("r", archeryArrowRadius().toFixed(2));
  circle.style.setProperty("--shot-index", index);
  return circle;
}

function archeryPointToSvg(shot) {
  return {
    x: shot.x * archeryAnimation.targetRadius,
    y: -shot.y * archeryAnimation.targetRadius
  };
}

function archeryArrowRadius() {
  const arrow = currentArcheryArrow();
  const outerRadiusCm = state.archeryTarget?.geometry?.outerScoringRadiusCm || 20;
  const diameterCm = (arrow?.outerDiameterMm || 5.46) / 10;
  return (diameterCm / outerRadiusCm) * archeryAnimation.targetRadius / 2;
}

function currentArcheryArrow() {
  const selected = state.selectedArcherySessionIndex === null
    ? state.archerySessions[0]
    : state.archerySessions[state.selectedArcherySessionIndex];
  return state.archeryArrows.find((arrow) => arrow.id === selected?.equipment?.arrowId) || state.archeryArrows[0];
}

function renderArcheryStats(session) {
  const arrow = currentArcheryArrow();

  if (!session) {
    const shotCount = state.archerySessions.reduce((total, item) => total + item.shots.length, 0);
    els.rideMilesLabel.textContent = "All shots";
    els.rideSpeedLabel.textContent = "Sessions";
    els.rideMiles.textContent = String(shotCount || "--");
    els.rideSpeed.textContent = String(state.archerySessions.length || "--");
    els.equipmentLabel.textContent = "Arrow";
    els.equipmentValue.textContent = arrow ? `${arrow.brand} ${arrow.model}` : "Easton 660";
    return;
  }

  els.rideMilesLabel.textContent = "Session score";
  els.rideSpeedLabel.textContent = "Shots";
  els.rideMiles.textContent = String(scoreArcherySession(session));
  els.rideSpeed.textContent = String(session.shots.length);
  els.equipmentLabel.textContent = "Arrow";
  els.equipmentValue.textContent = arrow ? `${arrow.brand} ${arrow.model}` : session.equipment.arrowId;
}

function scoreArcherySession(session) {
  return session.shots.reduce((total, shot) => total + scoreArcheryShot(shot), 0);
}

function scoreArcheryShot(shot) {
  const radius = Math.hypot(shot.x, shot.y);
  const ring = state.archeryTarget.rings.find((targetRing) => radius <= targetRing.outerRadius);
  return ring?.score || state.archeryTarget.missScore || 0;
}

function renderBasemap(basemap, config) {
  for (const layer of new Set(Object.values(config.layers))) {
    layer.textContent = "";
  }

  for (const feature of basemap.features.filter((feature) => featureTouchesBounds(feature, config.bounds))) {
    const layer = config.layers[feature.kind];
    if (!layer) continue;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", geoPointsToPath(feature.points, feature.closed, config.projection));
    path.setAttribute("class", getBasemapClass(feature));
    layer.append(path);
  }
}

function getBasemapClass(feature) {
  const classes = ["map-feature", `is-${feature.kind}`];
  if (feature.name) classes.push("is-named");
  if (feature.kind === "street" && feature.name) classes.push("is-major");
  if (feature.kind === "service") classes.push("is-service");
  return classes.join(" ");
}

function renderRideState() {
  resetRideAnimation();
  els.rideGhosts.textContent = "";

  if (state.selectedRideIndex === null) {
    state.rides.forEach((ride) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", projectedSegmentsToPath(ride.projectedSegments, 1.1));
      path.setAttribute("class", "ride-ghost");
      path.style.setProperty("--ride-color", speedColorForRide(ride));
      els.rideGhosts.append(path);
    });

    setSvgHidden(els.ridePath, true);
    setSvgHidden(els.rideReplayBase, true);
    setSvgHidden(els.ridePoint, true);
    els.ridePoint.style.display = "none";
    setLiveMetricsVisible(false);
    renderAllRideStats();
    return;
  }

  const ride = state.rides[state.selectedRideIndex];
  const lastSegment = ride.projectedSegments[ride.projectedSegments.length - 1] || [];
  const last = lastSegment[lastSegment.length - 1];

  setSvgHidden(els.ridePath, false);
  setSvgHidden(els.rideReplayBase, false);
  setSvgHidden(els.ridePoint, !last);
  els.ridePoint.style.display = last ? "" : "none";
  els.ridePath.setAttribute("d", "");
  els.rideReplayBase.setAttribute("d", "");
  els.ridePath.style.setProperty("--ride-color", speedColorForRide(ride));
  els.ridePoint.style.setProperty("--ride-color", speedColorForRide(ride));
  els.ridePath.classList.add("is-replaying");
  setLiveMetricsVisible(Boolean(last));
  updateLiveMetrics(0, 0, true);
  if (last) animateSelectedRide(ride, last);
  els.rideMilesLabel.textContent = "Ride miles";
  els.rideSpeedLabel.textContent = "Ride avg. speed";
  els.rideMiles.textContent = ride.stats.miles.toFixed(2);
  els.rideSpeed.textContent = `${ride.stats.avgMph.toFixed(1)} mph`;
  els.equipmentLabel.textContent = "Bike";
  els.equipmentValue.textContent = "1986 Eddy Merckx Corsa";
}

function renderSailingState() {
  resetSailAnimation();
  if (!state.harborBasemap || !state.sails.length) return;

  const selectedSail = state.selectedSailIndex === null
    ? null
    : state.sails[state.selectedSailIndex];
  const bounds = selectedSail ? cinematicBoundsForTrack(selectedSail.bounds) : harborFocusBounds;
  const projection = createSailingProjection(bounds);

  renderBasemap(state.harborBasemap, {
    bounds,
    projection,
    layers: {
      landmass: els.harborLand,
      land: els.harborLand,
      coastline: els.harborCoast,
      pier: els.harborPaths
    }
  });

  els.sailGhosts.textContent = "";
  state.sails.forEach((sail, index) => {
    const segments = projectedSegmentsForTrack(sail.points, bounds, projection);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", projectedSegmentsToPath(segments, 0.72));
    path.setAttribute("class", `sail-ghost${index === state.selectedSailIndex ? " is-selected" : ""}`);
    els.sailGhosts.append(path);
  });

  if (!selectedSail) {
    renderAllSailStats();
    return;
  }

  const selectedSegments = projectedSegmentsForTrack(selectedSail.points, bounds, projection);
  animateSelectedSail(selectedSail, selectedSegments);
  els.rideMilesLabel.textContent = "Sail distance";
  els.rideSpeedLabel.textContent = "Sail avg. speed";
  els.rideMiles.textContent = `${(selectedSail.stats.miles * 0.868976).toFixed(2)} nm`;
  els.rideSpeed.textContent = `${(selectedSail.stats.avgMph * 0.868976).toFixed(1)} kn`;
  els.equipmentLabel.textContent = "Trace";
  els.equipmentValue.textContent = selectedSail.label;
}

function renderAllSailStats() {
  const totals = state.sails.reduce((acc, sail) => {
    acc.miles += sail.stats.miles;
    acc.hours += sail.stats.hours;
    return acc;
  }, { miles: 0, hours: 0 });

  els.rideMilesLabel.textContent = "All sail distance";
  els.rideSpeedLabel.textContent = "Aggregate avg. speed";
  els.rideMiles.textContent = `${(totals.miles * 0.868976).toFixed(2)} nm`;
  els.rideSpeed.textContent = `${((totals.miles / Math.max(totals.hours, 0.01)) * 0.868976).toFixed(1)} kn`;
  els.equipmentLabel.textContent = "Traces";
  els.equipmentValue.textContent = `${state.sails.length} sail samples`;
}

function animateSelectedSail(sail, projectedSegments) {
  const timeline = createRideTimeline(projectedSegments);
  const last = timeline[timeline.length - 1]?.point;

  if (timeline.length < 2 || !last) {
    setSailReplayPath(projectedSegmentsToPath(projectedSegments, 0.72));
    if (last) moveSailPoint(last);
    return;
  }

  setSvgHidden(els.sailPath, false);
  setSvgHidden(els.sailReplayBase, false);
  setSvgHidden(els.sailPoint, false);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setSailReplayPath(projectedSegmentsToPath(projectedSegments, 0.72));
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
      state.sailAnimationFrame = requestAnimationFrame(step);
    } else {
      state.sailAnimationFrame = null;
    }
  };

  state.sailAnimationFrame = requestAnimationFrame(step);
}

function renderSailAnimationFrame(timeline, progress) {
  const first = timeline[0];
  const last = timeline[timeline.length - 1];

  if (progress >= 1) {
    setSailReplayPath(visibleTimelineToPath(timeline, timeline.length, last.point));
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

    setSailReplayPath(visibleTimelineToPath(timeline, index, marker));
    moveSailPoint(marker);
    return;
  }

  setSailReplayPath(visibleTimelineToPath(timeline, timeline.length, last.point));
  moveSailPoint(last.point);
}

function resetSailAnimation() {
  if (state.sailAnimationFrame !== null) {
    cancelAnimationFrame(state.sailAnimationFrame);
    state.sailAnimationFrame = null;
  }

  els.sailPath.setAttribute("d", "");
  els.sailReplayBase.setAttribute("d", "");
  setSvgHidden(els.sailPath, true);
  setSvgHidden(els.sailReplayBase, true);
  setSvgHidden(els.sailPoint, true);
}

function setSailReplayPath(pathValue) {
  els.sailPath.setAttribute("d", pathValue);
  els.sailReplayBase.setAttribute("d", pathValue);
}

function moveSailPoint(point) {
  els.sailPoint.setAttribute("cx", point.x.toFixed(2));
  els.sailPoint.setAttribute("cy", point.y.toFixed(2));
}

function animateSelectedRide(ride, fallbackPoint) {
  const timeline = createRideTimeline(ride.projectedSegments);
  if (timeline.length < 2) {
    setReplayPath(projectedSegmentsToPath(ride.projectedSegments, 1.1));
    moveRidePoint(fallbackPoint);
    updateLiveMetrics(0, 0, true);
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setReplayPath(projectedSegmentsToPath(ride.projectedSegments, 1.1));
    moveRidePoint(fallbackPoint);
    updateLiveMetrics(timeline[timeline.length - 1].cumulativeMeters, 0, true);
    return;
  }

  const duration = Math.min(
    rideAnimation.maxDuration,
    Math.max(rideAnimation.minDuration, ride.stats.hours * rideAnimation.msPerRideHour)
  ) / state.playbackSpeed;

  renderRideAnimationFrame(timeline, 0);

  const startedAt = performance.now();
  const step = (timestamp) => {
    const progress = Math.min((timestamp - startedAt) / duration, 1);
    renderRideAnimationFrame(timeline, progress);

    if (progress < 1) {
      state.rideAnimationFrame = requestAnimationFrame(step);
    } else {
      state.rideAnimationFrame = null;
    }
  };

  state.rideAnimationFrame = requestAnimationFrame(step);
}

function resetRideAnimation() {
  if (state.rideAnimationFrame !== null) {
    cancelAnimationFrame(state.rideAnimationFrame);
    state.rideAnimationFrame = null;
  }

  els.ridePath.setAttribute("d", "");
  els.rideReplayBase.setAttribute("d", "");
  setSvgHidden(els.rideReplayBase, true);
  els.ridePath.classList.remove("is-replaying");
}

function setSvgHidden(element, isHidden) {
  if (isHidden) {
    element.setAttribute("hidden", "");
  } else {
    element.removeAttribute("hidden");
  }
}

function setReplayPath(pathValue) {
  els.ridePath.setAttribute("d", pathValue);
  els.rideReplayBase.setAttribute("d", pathValue);
}

function moveRidePoint(point) {
  els.ridePoint.setAttribute("cx", point.x.toFixed(2));
  els.ridePoint.setAttribute("cy", point.y.toFixed(2));
}

function createRideTimeline(projectedSegments) {
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

function renderRideAnimationFrame(timeline, progress) {
  const first = timeline[0];
  const last = timeline[timeline.length - 1];

  if (progress >= 1) {
    setReplayPath(visibleTimelineToPath(timeline, timeline.length, last.point));
    moveRidePoint(last.point);
    updateLiveMetrics(last.cumulativeMeters, 0, true);
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
    const cumulativeMeters = previous.cumulativeMeters +
      (current.cumulativeMeters - previous.cumulativeMeters) * localProgress;
    const currentMph = sampledSpeedMph(timeline, index, cumulativeMeters, target);

    setReplayPath(visibleTimelineToPath(timeline, index, marker));
    moveRidePoint(marker);
    updateLiveMetrics(cumulativeMeters, currentMph);
    return;
  }

  setReplayPath(visibleTimelineToPath(timeline, timeline.length, last.point));
  moveRidePoint(last.point);
  updateLiveMetrics(last.cumulativeMeters, 0, true);
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

function sampledSpeedMph(timeline, currentIndex, cumulativeMeters, targetTime) {
  const sampleStartTime = targetTime - rideAnimation.speedSampleWindowMs;
  let start = timeline[Math.max(currentIndex - 1, 0)];

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (timeline[index].time <= sampleStartTime) {
      start = timeline[index];
      break;
    }

    start = timeline[index];
  }

  const elapsedHours = Math.max((targetTime - start.time) / 3600000, 1 / 3600000);
  const meters = Math.max(cumulativeMeters - start.cumulativeMeters, 0);
  return meters / 1609.344 / elapsedHours;
}

function setLiveMetricsVisible(isVisible) {
  if (isVisible) {
    els.rideLiveMetrics.removeAttribute("hidden");
  } else {
    els.rideLiveMetrics.setAttribute("hidden", "");
  }
  state.liveMetricsUpdatedAt = 0;
}

function updateLiveMetrics(cumulativeMeters, speedMph, force = false) {
  const now = performance.now();
  if (!force && now - state.liveMetricsUpdatedAt < rideAnimation.metricUpdateIntervalMs) return;

  state.liveMetricsUpdatedAt = now;
  els.liveMiles.textContent = (cumulativeMeters / 1609.344).toFixed(2);
  els.liveSpeed.textContent = `${Math.max(speedMph, 0).toFixed(1)} mph`;
}

function renderAllRideStats() {
  const totals = state.rides.reduce((acc, ride) => {
    acc.miles += ride.stats.miles;
    acc.hours += ride.stats.hours;
    return acc;
  }, { miles: 0, hours: 0 });

  els.rideMilesLabel.textContent = "All park miles";
  els.rideSpeedLabel.textContent = "Aggregate avg. speed";
  els.rideMiles.textContent = totals.miles.toFixed(2);
  els.rideSpeed.textContent = `${(totals.miles / Math.max(totals.hours, 0.01)).toFixed(1)} mph`;
  els.equipmentLabel.textContent = "Bike";
  els.equipmentValue.textContent = "1986 Eddy Merckx Corsa";
}

function getSpeedRange(rides) {
  const speeds = rides.map((ride) => ride.stats.avgMph);
  if (!speeds.length) return { min: 0, max: 0 };

  return {
    min: Math.min(...speeds),
    max: Math.max(...speeds)
  };
}

function speedColorForRide(ride) {
  const { min, max } = state.speedRange;
  const progress = max === min ? 0.5 : (ride.stats.avgMph - min) / (max - min);
  const hue = 132 - progress * 78;
  const lightness = 36 + progress * 13;
  return `hsl(${hue.toFixed(1)} 66% ${lightness.toFixed(1)}%)`;
}

function selectAdjacentRide(direction) {
  if (!state.rides.length) return;

  const current = state.selectedRideIndex === null
    ? (direction > 0 ? -1 : 0)
    : state.selectedRideIndex;

  state.selectedRideIndex = (current + direction + state.rides.length) % state.rides.length;
  renderRideState();
  updateMetadata();
}

function selectAdjacentSail(direction) {
  if (!state.sails.length) return;

  const current = state.selectedSailIndex === null
    ? (direction > 0 ? -1 : 0)
    : state.selectedSailIndex;

  state.selectedSailIndex = (current + direction + state.sails.length) % state.sails.length;
  renderSailingState();
  updateMetadata();
}

function selectAdjacentArcherySession(direction) {
  if (!state.archerySessions.length) return;

  const current = state.selectedArcherySessionIndex === null
    ? (direction > 0 ? -1 : 0)
    : state.selectedArcherySessionIndex;

  state.selectedArcherySessionIndex = (current + direction + state.archerySessions.length) % state.archerySessions.length;
  renderArcheryState();
  updateMetadata();
}

function selectAllRides() {
  state.selectedRideIndex = null;
  renderRideState();
  updateMetadata();
}

function selectAllSails() {
  state.selectedSailIndex = null;
  renderSailingState();
  updateMetadata();
}

function selectAllArcherySessions() {
  state.selectedArcherySessionIndex = null;
  renderArcheryState();
  updateMetadata();
}

async function updateMetadata() {
  const selectedRide = state.selectedRideIndex === null
    ? null
    : state.rides[state.selectedRideIndex];
  const selectedArcherySession = state.selectedArcherySessionIndex === null
    ? null
    : state.archerySessions[state.selectedArcherySessionIndex];
  const date = selectedArcherySession?.startedAt || (selectedRide ? selectedRide.startDate : new Date());
  const isNow = !selectedRide && !selectedArcherySession;

  els.metaStatusLabel.textContent = selectedArcherySession ? "Session" : (isNow ? "Now" : "Ride");
  els.metaDate.textContent = formatDate.format(date);
  els.metaWindLabel.textContent = selectedArcherySession ? "Range wind" : (isNow ? "Current wind" : "Avg. wind");
  els.metaTideLabel.textContent = selectedArcherySession ? "Tide" : (isNow ? "Current tide" : "Ride tide");
  els.metaWeatherLabel.textContent = selectedArcherySession ? "Range weather" : (isNow ? "Current weather" : "Ride weather");
  els.metaWind.textContent = "Wind loading";
  els.metaTide.textContent = "Tide loading";
  els.metaWeather.textContent = "Weather loading";

  const precomputed = selectedRide ? getPrecomputedRideMetadata(selectedRide) : null;
  if (precomputed) {
    setMetadataValues(precomputed.weather, precomputed.tide);
    return;
  }

  const [weather, tide] = await Promise.allSettled([
    getWeatherForDate(date),
    getTideForDate(date)
  ]);

  if (weather.status === "fulfilled") {
    setWeatherValues(weather.value);
  } else {
    els.metaWind.textContent = "Wind unavailable";
    els.metaWeather.textContent = "Weather unavailable";
  }

  els.metaTide.textContent = tide.status === "fulfilled"
    ? tide.value
    : "Tide unavailable";
}

function getPrecomputedRideMetadata(ride) {
  return state.rideMetadata.rides?.[ride.id] || null;
}

function setMetadataValues(weather, tide) {
  setWeatherValues(weather);
  els.metaTide.textContent = tide;
}

function setWeatherValues(weather) {
  els.metaWind.textContent = weather.wind;
  els.metaWeather.textContent = weather.condition;
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

function createProjection(bounds, frame, rotationDegrees = 0) {
  const min = mercator(bounds.minLon, bounds.maxLat);
  const max = mercator(bounds.maxLon, bounds.minLat);
  const scale = Math.min(
    frame.width / (max.x - min.x),
    frame.height / (max.y - min.y)
  );
  const projectedWidth = (max.x - min.x) * scale;
  const projectedHeight = (max.y - min.y) * scale;
  const offsetX = frame.x + (frame.width - projectedWidth) / 2;
  const offsetY = frame.y + (frame.height - projectedHeight) / 2;
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const rotation = rotationDegrees * Math.PI / 180;

  return (lon, lat) => {
    const point = mercator(lon, lat);
    const projected = {
      x: offsetX + (max.x - point.x) * scale,
      y: offsetY + (point.y - min.y) * scale
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

function mercator(lon, lat) {
  const radians = Math.PI / 180;
  return {
    x: lon,
    y: Math.log(Math.tan(Math.PI / 4 + (lat * radians) / 2)) / radians
  };
}

function geoPointsToPath(points, closed, projection = state.projection) {
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

function getRideStats(points) {
  const meters = points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + haversineMeters(points[index - 1], point);
  }, 0);
  const firstTime = new Date(points[0].time).getTime();
  const lastTime = new Date(points[points.length - 1].time).getTime();
  const hours = Math.max((lastTime - firstTime) / 3600000, 0.01);
  const miles = meters / 1609.344;

  return {
    miles,
    hours,
    avgMph: miles / hours
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

async function getWeatherForDate(date) {
  const current = isToday(date);
  const key = metadataCacheKey("weather", current ? "current" : dateTimeKey(date));

  return cachedMetadata(
    key,
    () => current ? getCurrentWeather() : getHistoricalWeather(date),
    current ? metadataCache.currentTtl : metadataCache.historicalTtl
  );
}

async function getCurrentWeather() {
  const params = new URLSearchParams({
    latitude: "40.6602",
    longitude: "-73.9690",
    current: "weather_code,wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "mph",
    timezone: "America/New_York"
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Current weather lookup failed");

  const current = (await response.json()).current;
  return formatWeather(current.weather_code, current.wind_speed_10m, current.wind_direction_10m);
}

async function getHistoricalWeather(date) {
  const localDate = dateKey(date);
  const params = new URLSearchParams({
    latitude: "40.6602",
    longitude: "-73.9690",
    start_date: localDate,
    end_date: localDate,
    hourly: "weather_code,wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "mph",
    timezone: "America/New_York"
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!response.ok) throw new Error("Historical weather lookup failed");

  const hourly = (await response.json()).hourly;
  const index = nearestHourlyIndex(hourly.time, date);
  return formatWeather(
    hourly.weather_code[index],
    hourly.wind_speed_10m[index],
    hourly.wind_direction_10m[index]
  );
}

function formatWeather(code, windSpeed, windDirection) {
  return {
    wind: `${degreesToCardinal(windDirection)} ${Math.round(windSpeed)} mph`,
    condition: weatherCodeLabel(code)
  };
}

async function getTideForDate(date) {
  const current = isToday(date);
  const key = metadataCacheKey("tide", current ? "current" : dateTimeKey(date));

  return cachedMetadata(
    key,
    () => fetchTideForDate(date),
    current ? metadataCache.currentTtl : metadataCache.historicalTtl
  );
}

async function fetchTideForDate(date) {
  const start = new Date(date.getTime() - 7 * 60 * 60 * 1000);
  const end = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    product: "predictions",
    application: "reesemcardle_site",
    begin_date: noaaDate(start),
    end_date: noaaDate(end),
    datum: "MLLW",
    station: "8518750",
    time_zone: "lst_ldt",
    units: "english",
    interval: "hilo",
    format: "json"
  });
  const response = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`);
  if (!response.ok) throw new Error("Tide lookup failed");

  const predictions = ((await response.json()).predictions || [])
    .map((prediction) => ({
      type: prediction.type,
      date: new Date(prediction.t.replace(" ", "T"))
    }))
    .sort((a, b) => a.date - b.date);
  const next = predictions.find((prediction) => prediction.date >= date);
  if (!next) throw new Error("No tide prediction near requested time");

  return next.type === "H" ? "Flood tide" : "Ebb tide";
}

async function cachedMetadata(key, loader, ttl) {
  const cached = readMetadataCache(key, ttl);
  if (cached !== null) return cached;
  if (metadataRequests.has(key)) return metadataRequests.get(key);

  const request = loader()
    .then((value) => {
      writeMetadataCache(key, value);
      return value;
    })
    .finally(() => {
      metadataRequests.delete(key);
    });

  metadataRequests.set(key, request);
  return request;
}

function metadataCacheKey(type, variant) {
  return `${metadataCache.prefix}:${type}:${variant}`;
}

function readMetadataCache(key, ttl) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached || Date.now() - cached.savedAt > ttl) return null;
    return cached.value;
  } catch (error) {
    return null;
  }
}

function writeMetadataCache(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      value
    }));
  } catch (error) {
    // Metadata is a nice-to-have speedup; the page should still work without storage.
  }
}

function nearestHourlyIndex(times, date) {
  const target = date.getTime();
  let bestIndex = 0;
  let bestDistance = Infinity;

  times.forEach((time, index) => {
    const distance = Math.abs(new Date(time).getTime() - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function weatherCodeLabel(code) {
  const labels = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorm"
  };
  return labels[code] || "Weather recorded";
}

function degreesToCardinal(degrees) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % directions.length];
}

function isToday(date) {
  return dateKey(date) === dateKey(new Date());
}

function dateKey(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York"
  });
  return formatter.format(date);
}

function dateTimeKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/New_York"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function noaaDate(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/New_York"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}${parts.month}${parts.day} ${parts.hour}:${parts.minute}`;
}
