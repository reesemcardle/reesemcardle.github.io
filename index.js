import { harborProjection, renderHarborMap } from "./scripts/harbor-map.mjs";
import { createVideoPlayer, captureLabels } from "./scripts/video-player.mjs";
import { weatherDisplay } from "./scripts/activity-weather.mjs";
import { mapRegions, createRegionPicker } from "./scripts/map-regions.mjs";
import { createSailingEventDetails } from "./scripts/sailing-event.mjs";
import { createEventMedia } from "./scripts/event-media.mjs";
import { createEditorialPages } from "./scripts/editorial-pages.mjs";
import { prepareSail } from "./scripts/sail-data.mjs";
import { setupResponsiveLayout } from "./scripts/responsive-layout.mjs";
import { createMapCamera, fitCamera, launchCenter } from "./scripts/map-camera.mjs";
import {
  createProjection,
  featureTouchesBounds,
  geoPointsToPath,
  getTrackStats as getRideStats,
  haversineMeters,
  loadJson,
  parseGpx,
  pointInBounds,
  projectedPointsToPath,
  projectedSegmentsToPath,
  segmentPointsInBounds
} from "./scripts/field-utils.mjs";

const rideIndexFile = "content/rides/ride-index.json";
const activityMetadataFile = "content/activity-metadata.json";
const basemapFile = "content/maps/prospect-park-osm.json";
const requestedRegion=new URLSearchParams(location.search).get("region");
let sailingRegion=mapRegions.sailing.find(region=>region.id===requestedRegion) || mapRegions.sailing[0];
const regionMaps=new Map();
const eventMedia=createEventMedia(document.getElementById("eventMedia"));
const editorialPages=createEditorialPages(document.getElementById("editorialReader"),document.getElementById("editorialSidebar"));
let activitiesPromise=null,modeRequest=0;
let mediaIndex={};
const sailEventDetails=createSailingEventDetails(document.getElementById("sailEventDetails"));
const regionSails=new Map();
const sailIndexFile = "content/sails/sail-index.json";
const archerySessionIndexFile = "content/archery/session-index.json";
const archeryTargetFile = "content/archery/targets/fita-40-single-10-ring.json";
const archeryArrowsFile = "content/archery/equipment/arrows.json";

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

const activitySettings = {
  cycling: {
    cameraPreset: "half",
    playbackSpeed: 1.5
  },
  sailing: {
    cameraPreset: "soft",
    playbackSpeed: 2
  },
  archery: {
    cameraPreset: "flat",
    playbackSpeed: 1.25
  }
};

const els = {
  contact: document.querySelector(".contact-link"),
  cyclingVisual: document.getElementById("cyclingVisual"),
  sailingVisual: document.getElementById("sailingVisual"),
  archeryVisual: document.getElementById("archeryVisual"),
  modePlaceholder: document.getElementById("modePlaceholder"),
  placeholderTitle: document.getElementById("placeholderTitle"),
  placeholderText: document.getElementById("placeholderText"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  cameraButtons: document.querySelectorAll(".camera-button"),
  speedButtons: document.querySelectorAll(".speed-button"),
  mapLand: document.getElementById("mapLand"),
  mapWater: document.getElementById("mapWater"),
  mapStreets: document.getElementById("mapStreets"),
  mapPaths: document.getElementById("mapPaths"),
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
  archeryTicker: document.getElementById("archeryTicker"),
  archeryTickerShot: document.getElementById("archeryTickerShot"),
  archeryTickerScore: document.getElementById("archeryTickerScore"),
  archeryTickerGroup: document.getElementById("archeryTickerGroup"),
  archeryTickerXCount: document.getElementById("archeryTickerXCount"),
  metaLocation: document.getElementById("metaLocation"),
  metaDate: document.getElementById("metaDate"),
  metaTime: document.getElementById("metaTime"),
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
  equipmentValue: document.getElementById("equipmentValue"),
  activityIndex: document.getElementById("activityIndex"),
  activityTitle: document.getElementById("activityTitle"),
  activityPlace: document.getElementById("activityPlace"),
  activityDek: document.getElementById("activityDek"),
  activityMetaTitle: document.getElementById("activityMetaTitle"),
  figureLabel: document.getElementById("figureLabel"),
  figureDescription: document.getElementById("figureDescription"),
  detailEyebrow: document.getElementById("detailEyebrow"),
  detailTitle: document.getElementById("detailTitle"),
  detailText: document.getElementById("detailText")
};

const state = {
  mode: "cycling",
  cameraPreset: activitySettings.cycling.cameraPreset,
  cameraByMode: {
    cycling: activitySettings.cycling.cameraPreset,
    sailing: activitySettings.sailing.cameraPreset,
    archery: activitySettings.archery.cameraPreset
  },
  playbackSpeed: activitySettings.cycling.playbackSpeed,
  rides: [],
  sails: [],
  archerySessions: [],
  archeryTarget: null,
  archeryArrows: [],
  harborBasemap: null,
  speedRange: { min: 0, max: 0 },
  activityMetadata: {
    rides: {},
    sails: {},
    archerySessions: {}
  },
  selectedRideIndex: null,
  selectedSailIndex: null,
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

const activityCopy = {
  labs:{index:"05 / 06",title:"Labs",place:"Writing & experiments",dek:"",metaTitle:"",figure:"",detailEyebrow:"",detailTitle:"",detailText:""},
  about:{index:"06 / 06",title:"About",place:"",dek:"",metaTitle:"",figure:"",detailEyebrow:"",detailTitle:"",detailText:""},
  video: {
    index: "01 / 06", title: "Scenes", place: "", dek: "", metaTitle: "Capture",
    figure: "", detailEyebrow: "Selected video", detailTitle: "No video yet", detailText: ""
  },
  cycling: {
    index: "02 / 06",
    title: "Cycling",
    place: "Prospect Park, Brooklyn",
    dek: "Accumulated ride traces, 2024-2026",
    metaTitle: "Ride Set Overview",
    figure: "All recorded rides in and around Prospect Park. Daily loops, longer explorations, and everything in between.",
    detailEyebrow: "Latest ride",
    detailTitle: "Prospect Park Loop",
    detailText: "Step through park traces, recent rides, and aggregate movement."
  },
  sailing: {
    index: "03 / 06",
    title: "Sailing",
    place: "New York Harbor",
    dek: "Recorded sails",
    metaTitle: "Sail Set Overview",
    figure: "Sailing traces over the harbor basemap. Coastline, parks, and major roads are retained for orientation.",
    detailEyebrow: "Selected sail",
    detailTitle: "Recorded sails",
    detailText: "Step through sail traces or return to the aggregate harbor view."
  },
  archery: {
    index: "04 / 06",
    title: "Archery",
    place: "Brooklyn range",
    dek: "FITA 40cm target sessions",
    metaTitle: "Session Overview",
    figure: "Recorded arrow locations on a single-spot target. Session playback updates score, group size, and X count.",
    detailEyebrow: "Selected session",
    detailTitle: "Target session",
    detailText: "Step through sessions to inspect score, shot count, and equipment."
  }
};

const formatDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York"
});

const sailingCamera = createMapCamera(els.sailingVisual, {
  allowRotation: true,
  worldId: "sailingWorld", markerId: "sailPoint",
  layers: "#harborWater, #harborLand, #harborParks, #harborRoads, #harborPaths, .sail-layer"
});
const cyclingCamera = createMapCamera(els.cyclingVisual, {
  allowRotation: true,
  worldId: "cyclingWorld", markerId: "ridePoint",
  layers: "#mapLand, #mapWater, #mapStreets, #mapPaths, .ride-layer"
});
const archeryCamera = createMapCamera(els.archeryVisual, {
  worldId: "archeryWorld", layers: ".archery-face"
});
const videoPlayer = createVideoPlayer({
  player:document.getElementById("videoPlayer"),empty:document.getElementById("videoEmpty"),
  controls:document.getElementById("videoControls"),playButton:document.getElementById("videoPlay"),
  soundButton:document.getElementById("videoSound"),onSelect:renderVideoMetadata
});

function renderVideoMetadata(video,index,count) {
  const labels=captureLabels(video?.date ? `${video.date}T12:00:00Z` : video?.capturedAt);
  renderConditions({location:video?.location,localDate:video?.date || video?.capturedAt?.slice(0,10),sourceDate:video?.capturedAt || video?.weather?.source?.sampledFrom,weather:video?.weather});
  els.activityPlace.textContent=video?.location || "";
  els.activityDek.textContent=labels.date==="Not recorded"?"":labels.date;
  els.detailTitle.textContent=video?.name || "No scenes yet";
  els.detailText.textContent="";
  els.figureDescription.textContent="";
  document.querySelectorAll(".trace-controls button").forEach(button=>{button.disabled=count<2;});
}
let sailingView = "home";
let harborRendered = false;
let sailProjection = harborProjection(sailingRegion.bounds,sailingRegion.rotation);
const regionPicker=createRegionPicker(els.activityPlace,{regions:mapRegions.sailing,onSelect:selectSailingRegion});
let regionRequest=0;
async function selectSailingRegion(region) {
  if(region.id===sailingRegion.id)return;
  const request=++regionRequest;
  els.activityPlace.setAttribute("aria-busy","true");
  try{
    if(!regionMaps.has(region.id))regionMaps.set(region.id,loadJson(region.file));
    const [map,sails]=await Promise.all([regionMaps.get(region.id),loadSails(region.id)]);
    if(request!==regionRequest)return;
    sailingRegion=region;
    state.harborBasemap=map;
    state.sails=sails;
    state.selectedSailIndex=null;
    sailingView="home";
    sailProjection=harborProjection(region.bounds,region.rotation);
    harborRendered=false;
    if(state.mode==="sailing"){
      regionPicker.render(region.id);
      renderSailingState();
      const url=new URL(location.href);url.searchParams.set("mode","sailing");url.searchParams.set("region",region.id);
      history.replaceState(null,"",url);
    }
  }catch(error){
    regionMaps.delete(region.id);
    if(request===regionRequest && state.mode==="sailing")els.figureDescription.textContent="Unable to load "+region.label+". Please try again.";
  }finally{if(request===regionRequest)els.activityPlace.removeAttribute("aria-busy");}
}
new ResizeObserver(() => {
  if (state.mode === "sailing" && state.sails.length) updateSailingCamera(false);
  if (state.mode === "cycling" && state.rides.length) updateCyclingCamera(false);
  if (state.mode === "archery") updateArcheryCamera(false);
}).observe(document.querySelector(".visual-frame"));
document.getElementById("sailingHome").addEventListener("click", () => {
  sailingView = "home";
  state.selectedSailIndex = null;
  renderSailingState();
});
document.getElementById("cyclingHome").addEventListener("click", () => {
  state.selectedRideIndex = null;
  renderRideState();
});
document.getElementById("archeryHome").addEventListener("click", () => updateArcheryCamera());
setupResponsiveLayout();
window.addEventListener("popstate",()=>{
  document.dispatchEvent(new Event("close-page-details"));
  navigateMode(initialMode());
});
init();

async function init() {
  wireContactLink();
  wireControls();
  renderConditions(null);
  await navigateMode(initialMode());
}

async function navigateMode(mode){
  const request=++modeRequest;
  try{
    if(!["labs","about"].includes(mode)){
      activitiesPromise ||= loadActivityContent().catch(error=>{activitiesPromise=null;throw error;});
      await activitiesPromise;
    }
    if(request===modeRequest)setMode(mode);
  }catch(error){
    if(request===modeRequest){els.activityDek.hidden=false;els.activityDek.textContent="Unable to load this section. Please try again.";}
    console.error(error);
  }
}

async function loadActivityContent(){
  const [basemap, harborBasemap, activityMetadata, sails, archery, parkWater, videos] = await Promise.all([
    loadJson(basemapFile),
    loadJson(sailingRegion.file),
    loadActivityMetadata(),
    loadSails(),
    loadArchery(),
    loadJson("content/maps/prospect-park-water.json"),
    loadJson("content/videos/video-index.json")
  ]);
  setCameraPreset(state.cameraPreset);
  state.activityMetadata = activityMetadata;
  mediaIndex=await loadJson("content/media/event-index.json").catch(()=>({}));
  state.harborBasemap = harborBasemap;
  regionMaps.set(sailingRegion.id,Promise.resolve(harborBasemap));
  state.archeryTarget = archery.target;
  state.archeryArrows = archery.arrows;
  state.projection = createProjection(parkFocusBounds, mapFrame);
  const rides = await loadRides();
  state.rides = rides;
  state.sails = sails;
  state.archerySessions = archery.sessions;
  videoPlayer.setItems(videos);
  state.speedRange = getSpeedRange(rides);

  renderBasemap({ ...basemap, features: [...basemap.features.filter((feature) => feature.kind !== "water"), ...parkWater.features] }, {
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
}

function initialMode() {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  return ["cycling", "sailing", "archery", "video", "labs", "about"].includes(requestedMode) ? requestedMode : "cycling";
}

async function loadActivityMetadata() {
  try {
    return await loadJson(activityMetadataFile);
  } catch (error) {
    return { rides: {}, sails: {}, archerySessions: {} };
  }
}

async function loadSails(regionId=sailingRegion.id) {
  if(regionSails.has(regionId))return regionSails.get(regionId);
  const pending=loadRegionSails(regionId).catch(error=>{regionSails.delete(regionId);throw error;});
  regionSails.set(regionId,pending);
  return pending;
}

async function loadRegionSails(regionId) {
  const sailIndex = await loadJson(sailIndexFile);
  return Promise.all(sailIndex.filter(sail=>sail.regionId===regionId).map(async (sail) => {
    const file = `content/sails/${sail.file}`;
    const response = await fetch(file, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${file}`);

    return {
      ...sail,
      file,
      ...prepareSail(parseGpx(await response.text()))
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
    startedAt: new Date(session.startedAt || session.capturedAt || `${session.recordedDate}T12:00:00`),
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
      const url=new URL(location.href);url.searchParams.set("mode",button.dataset.mode);url.searchParams.delete("entry");url.hash="";
      history.pushState(null,"",url);
      navigateMode(button.dataset.mode);
    });
  });

  document.querySelectorAll(".trace-controls button").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.mode === "video") {
        if (button.dataset.action === "all") videoPlayer.restart();
        else videoPlayer.next(button.dataset.action === "previous" ? -1 : 1);
      } else if (state.mode === "sailing") {
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
    if(["labs","about"].includes(state.mode))return;
    if (event.target.closest("video, input, select, textarea, button")) return;
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
  if (state.mode === "video") {
    videoPlayer.next(direction);
  } else if (state.mode === "sailing") {
    selectAdjacentSail(direction);
  } else if (state.mode === "archery") {
    selectAdjacentArcherySession(direction);
  } else {
    selectAdjacentRide(direction);
  }
}

function selectAllTraces() {
  if (state.mode === "video") {
    videoPlayer.restart();
  } else if (state.mode === "sailing") {
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

function setPlaybackSpeed(speed, { render = true } = {}) {
  if (!Number.isFinite(speed) || speed <= 0) return;

  state.playbackSpeed = speed;
  els.speedButtons.forEach((button) => {
    const isActive = Number(button.dataset.playbackSpeed) === speed;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (!render) return;

  if (state.mode === "sailing") {
    renderSailingState();
  } else if (state.mode === "archery") {
    renderArcheryState();
  } else if (state.selectedRideIndex !== null) {
    renderRideState();
  }
}


function setMode(mode) {
  state.mode = mode;
  document.querySelector(".visual-wrap").dataset.mode = mode;
  document.getElementById("sailingHome").hidden = mode !== "sailing";
  document.getElementById("cyclingHome").hidden = mode !== "cycling";
  document.getElementById("archeryHome").hidden = mode !== "archery";
  const settings = activitySettings[mode];
  updateActivityChrome(mode);
  setCameraPreset(settings?.cameraPreset || state.cameraByMode[mode] || state.cameraPreset);
  setPlaybackSpeed(settings?.playbackSpeed || state.playbackSpeed, { render: false });

  els.modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const isCycling = mode === "cycling";
  const isSailing = mode === "sailing";
  document.body.classList.toggle("sailing-mode",isSailing);
  document.getElementById("sailEventDetails").hidden=!isSailing;
  const isArchery = mode === "archery";
  const isVideo = mode === "video";
  const isEditorial=["labs","about"].includes(mode);
  document.body.classList.toggle("editorial-mode",isEditorial);
  document.querySelector(".metadata").setAttribute("aria-label",isEditorial?"Page details":"Activity metadata");
  if(isEditorial)editorialPages.show(mode);else editorialPages.hide();
  eventMedia.setActive(!isVideo && !isEditorial);
  document.body.classList.toggle("scene-mode", isVideo);
  document.getElementById("videoVisual").hidden = !isVideo;
  videoPlayer.setActive(isVideo);
  document.querySelector(".global-meta").setAttribute("aria-label", isVideo ? "Video capture conditions" : "Current conditions");
  document.querySelector(".activity-meta").setAttribute("aria-label", isVideo ? "Video metadata" : "Activity metadata");
  document.querySelector(".trace-controls").setAttribute("aria-label", isVideo ? "Video navigation" : "Trace navigation");
  document.querySelectorAll(".trace-controls button").forEach(button=>{
    const action=button.dataset.action;
    button.setAttribute("aria-label", isVideo ? (action==="all"?"Restart video":`${action==="previous"?"Previous":"Next"} video`) : (action==="all"?"Show all traces":`${action==="previous"?"Previous":"Next"} trace`));
    button.title=button.getAttribute("aria-label");
    if(action==="all")button.textContent=isVideo?"↻":"•";
    if(!isVideo)button.disabled=false;
  });
  setSvgHidden(els.cyclingVisual, !isCycling);
  els.cyclingVisual.style.display = isCycling ? "" : "none";
  setSvgHidden(els.sailingVisual, !isSailing);
  els.sailingVisual.style.display = isSailing ? "" : "none";
  setSvgHidden(els.archeryVisual, !isArchery);
  els.archeryVisual.style.display = isArchery ? "" : "none";
  els.modePlaceholder.hidden = isCycling || isSailing || isArchery || isVideo || isEditorial;
  els.modePlaceholder.style.display = els.modePlaceholder.hidden ? "none" : "";
  setLiveMetricsVisible(isCycling && state.selectedRideIndex !== null);
  if (isSailing) renderSailingState();
  if (!isSailing) {
    resetSailAnimation();
    sailingCamera.stop();
  }
  if (!isCycling) {
    resetRideAnimation();
    cyclingCamera.stop();
  }
  if (isCycling) renderRideState();

  if (isArchery) renderArcheryState();
  if (!isArchery) {
    resetArcheryAnimation();
    archeryCamera.stop();
  }

  if (!isCycling && !isSailing && !isArchery && !isVideo && !isEditorial) {
    els.placeholderTitle.textContent = placeholderCopy[mode].title;
    els.placeholderText.textContent = placeholderCopy[mode].text;
  }
}

function updateActivityChrome(mode) {
  const copy = activityCopy[mode];
  if (!copy) return;

  els.activityIndex.textContent = copy.index;
  els.activityTitle.textContent = copy.title;
  els.activityPlace.textContent = copy.place;
  els.activityPlace.hidden=!copy.place;
  if(mode==="sailing")regionPicker.render(sailingRegion.id);
  els.activityDek.textContent = copy.dek;
  els.activityDek.hidden=!copy.dek;
  els.activityMetaTitle.textContent = copy.metaTitle;
  els.figureLabel.textContent = `Figure ${copy.index.slice(0, 2)}`;
  els.figureDescription.textContent = copy.figure;
  els.detailEyebrow.textContent = copy.detailEyebrow;
  els.detailTitle.textContent = copy.detailTitle;
  els.detailText.textContent = copy.detailText;
}

function updateArcheryCamera(animate = true) {
  const frame = document.querySelector(".visual-frame").getBoundingClientRect();
  if (!frame.width || !frame.height) return;
  const radius = archeryAnimation.targetRadius;
  archeryCamera.move(fitCamera([
    { x: 800 - radius, y: 500 - radius },
    { x: 800 + radius, y: 500 + radius }
  ], frame.width / frame.height, 0.1), animate);
  els.archeryVisual.dataset.camera = "home";
}

function renderArcheryState() {
  renderSelectedConditions("archery");
  updateArcheryCamera();
  resetArcheryAnimation();
  if (!state.archerySessions.length || !state.archeryTarget) {
    setArcheryTickerVisible(false);
    renderArcheryStats(null);
    return;
  }

  if (state.selectedArcherySessionIndex === null) {
    if (state.archerySessions.some(session => session.source?.type === "target-photo")) {
      document.getElementById("figureDescription").textContent = "Completed target photos. Approximate impact locations; uncertain marks shown in pink.";
    }
    const allShots = state.archerySessions.flatMap((session) => {
      return session.shots.map((shot) => ({ ...shot, sessionId: session.sessionId }));
    });
    plotArcheryShots(allShots, "all");
    setArcheryTickerVisible(false);
    renderArcheryStats(null);
    return;
  }

  const session = state.archerySessions[state.selectedArcherySessionIndex];
  if (session.source?.type === "target-photo") {
    const date = new Date(`${session.recordedDate}T12:00:00`);
    const flagged = session.shots.filter(shot => shot.uncertain).length;
    document.getElementById("figureDescription").textContent = `${formatDate.format(date)}: ${session.shots.length} visible impact sites. Approximate positions; shot order unknown.${flagged ? ` ${flagged} uncertain locations shown in pink.` : ""}`;
  }
  els.archeryShots.textContent = "";
  setArcheryTickerVisible(true);
  updateArcheryTicker(session, -1);
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
  if (session.shotOrder === "unknown") {
    plotArcheryShots(session.shots, "photo");
    updateArcheryTicker(session, session.shots.length - 1);
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    plotArcheryShots(session.shots, "session");
    updateArcheryTicker(session, session.shots.length - 1);
    return;
  }

  session.shots.forEach((shot, index) => {
    const timeout = window.setTimeout(() => {
      els.archeryShots.append(createArcheryShotCircle(shot, index, "session"));
      updateArcheryTicker(session, index);
    }, index * archeryAnimation.shotIntervalMs / state.playbackSpeed);
    state.archeryAnimationTimeouts.push(timeout);
  });
}

function resetArcheryAnimation() {
  state.archeryAnimationTimeouts.forEach((timeout) => window.clearTimeout(timeout));
  state.archeryAnimationTimeouts = [];
  if (els.archeryShots) els.archeryShots.textContent = "";
  setArcheryTickerVisible(false);
}

function setArcheryTickerVisible(isVisible) {
  if (!els.archeryTicker) return;

  if (isVisible) {
    els.archeryTicker.removeAttribute("hidden");
  } else {
    els.archeryTicker.setAttribute("hidden", "");
  }
}

function updateArcheryTicker(session, shotIndex) {
  if (!els.archeryTicker) return;
  const isPhoto = session.shotOrder === "unknown";
  document.getElementById("archeryTickerShotLabel").textContent = isPhoto ? "Impacts" : "Shot";
  document.getElementById("archeryTickerScoreLabel").textContent = isPhoto ? "Est. total" : "Score";

  if (shotIndex < 0) {
    els.archeryTickerShot.textContent = "--";
    els.archeryTickerScore.textContent = "--";
    els.archeryTickerGroup.textContent = "--";
    els.archeryTickerXCount.textContent = "--";
    return;
  }

  const shots = session.shots.slice(0, shotIndex + 1);
  const shot = session.shots[shotIndex];
  const score = scoreArcheryShot(shot);
  const xCount = shots.filter(isArcheryX).length;

  els.archeryTickerShot.textContent = String(isPhoto ? session.shots.length : shot.shotNumber || shotIndex + 1);
  els.archeryTickerScore.textContent = String(isPhoto ? scoreArcherySession(session) : score);
  els.archeryTickerGroup.textContent = formatArcheryGroupSize(shots);
  els.archeryTickerXCount.textContent = String(xCount);
}

function createArcheryShotCircle(shot, index, variant) {
  const point = archeryPointToSvg(shot);
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("class", `archery-shot is-${variant}`);
  if (shot.uncertain) circle.classList.add("is-uncertain");
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
  if (selected?.source?.type === "target-photo" && !selected.equipment?.arrowId) return null;
  return state.archeryArrows.find((arrow) => arrow.id === selected?.equipment?.arrowId) || state.archeryArrows[0];
}

function renderArcheryStats(session) {
  const arrow = currentArcheryArrow();

  if (!session) {
    const shotCount = state.archerySessions.reduce((total, item) => total + item.shots.length, 0);
    els.rideMilesLabel.textContent = state.archerySessions.some(item => item.source?.type === "target-photo") ? "Visible impacts" : "All shots";
    els.rideSpeedLabel.textContent = "Sessions";
    els.rideMiles.textContent = String(shotCount || "--");
    els.rideSpeed.textContent = String(state.archerySessions.length || "--");
    els.equipmentLabel.textContent = "Arrow";
    els.equipmentValue.textContent = arrow ? `${arrow.brand} ${arrow.model}` : "Not recorded";
    return;
  }

  els.rideMilesLabel.textContent = session.source?.type === "target-photo" ? "Estimated score" : "Session score";
  els.rideSpeedLabel.textContent = session.source?.type === "target-photo" ? "Visible impacts" : "Shots";
  els.rideMiles.textContent = String(scoreArcherySession(session));
  els.rideSpeed.textContent = String(session.shots.length);
  els.equipmentLabel.textContent = "Arrow";
  els.equipmentValue.textContent = arrow ? `${arrow.brand} ${arrow.model}` : session.equipment?.arrowId || "Not recorded";
}

function scoreArcherySession(session) {
  return session.shots.reduce((total, shot) => total + scoreArcheryShot(shot), 0);
}

function scoreArcheryShot(shot) {
  const radius = Math.hypot(shot.x, shot.y);
  const ring = state.archeryTarget.rings.find((targetRing) => radius <= targetRing.outerRadius);
  return ring?.score || state.archeryTarget.missScore || 0;
}

function isArcheryX(shot) {
  const radius = Math.hypot(shot.x, shot.y);
  return state.archeryTarget.tieBreakRings?.some((ring) => radius <= ring.outerRadius) || false;
}

function formatArcheryGroupSize(shots) {
  if (shots.length < 2) return "0.0 cm";

  const outerRadiusCm = state.archeryTarget?.geometry?.outerScoringRadiusCm || 20;
  const maxDistance = shots.reduce((largest, shot, index) => {
    const nextLargest = shots.slice(index + 1).reduce((innerLargest, otherShot) => {
      return Math.max(innerLargest, Math.hypot(shot.x - otherShot.x, shot.y - otherShot.y));
    }, 0);

    return Math.max(largest, nextLargest);
  }, 0);

  return `${(maxDistance * outerRadiusCm).toFixed(1)} cm`;
}

function renderBasemap(basemap, config) {
  const batches = new Map();
  for (const layer of new Set(Object.values(config.layers))) {
    layer.textContent = "";
  }

  for (const feature of basemap.features.filter((feature) => {
    return featureTouchesBounds(feature, config.bounds) &&
      (!config.featureFilter || config.featureFilter(feature));
  })) {
    const layer = config.layers[feature.kind];
    if (!layer) continue;

    const className = getBasemapClass(feature);
    if (["street", "service", "path"].includes(feature.kind)) {
      const key = `${layer.id}:${className}`;
      if (!batches.has(key)) batches.set(key, { layer, className, paths: [] });
      batches.get(key).paths.push(featurePath(feature, config));
      continue;
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featurePath(feature, config));
    path.setAttribute("class", getBasemapClass(feature));
    path.setAttribute("fill-rule", "evenodd");
    if (!feature.closed) path.style.fill = "none";
    layer.append(path);
  }
  for (const { layer, className, paths } of batches.values()) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", paths.join(" "));
    path.setAttribute("class", className);
    layer.append(path);
  }
}

function featurePath(feature, config) {
  if (feature.rings) return feature.rings.map((ring) => geoPointsToPath(ring, true, config.projection)).join(" ");
  if (!config.simplifyTolerance) {
    return geoPointsToPath(feature.points, feature.closed, config.projection);
  }

  const projected = feature.points.map(([lon, lat]) => config.projection(lon, lat));
  return projectedPointsToPath(simplifyProjectedPoints(projected, config.simplifyTolerance), feature.closed);
}

function simplifyProjectedPoints(points, tolerance) {
  if (points.length <= 2) return points;

  const simplified = [points[0]];
  let previous = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= tolerance) {
      simplified.push(point);
      previous = point;
    }
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

function getBasemapClass(feature) {
  const classes = ["map-feature", `is-${feature.kind}`];
  if (feature.name) classes.push("is-named");
  if (feature.kind === "street" && feature.name) classes.push("is-major");
  if (feature.kind === "service") classes.push("is-service");
  return classes.join(" ");
}

function renderRideState() {
  renderSelectedConditions("cycling");
  resetRideAnimation();
  updateCyclingCamera();
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

function updateCyclingCamera(animate = true) {
  if (!state.projection || !state.rides.length) return;
  const frame = document.querySelector(".visual-frame").getBoundingClientRect();
  if (!frame.width || !frame.height) return;
  const selected = state.rides[state.selectedRideIndex];
  const points = selected ? selected.projectedSegments.flat() : state.rides.flatMap((ride) => ride.projectedSegments.flat());
  if (!points.length) return;
  cyclingCamera.move(fitCamera(points, frame.width / frame.height, 0.18), animate);
  els.cyclingVisual.dataset.camera = selected ? "ride" : "home";
}

function renderSailingState() {
  renderSelectedConditions("sailing");
  resetSailAnimation();
  if (!state.harborBasemap) return;

  const selectedSail = state.selectedSailIndex === null
    ? null
    : state.sails[state.selectedSailIndex];
  sailEventDetails.render(state.sails,selectedSail);
  const projection = sailProjection;
  if (!harborRendered) {
    renderHarborMap(state.harborBasemap, projection, els.sailingVisual);
    harborRendered = true;
  }
  els.sailingVisual.dataset.region=sailingRegion.id;
  els.sailingVisual.querySelector("title").textContent=sailingRegion.label+": drag to pan, scroll to zoom, Shift-drag horizontally to rotate and vertically to tilt 0-68 degrees";
  els.sailingVisual.querySelector("desc").textContent="Recorded sails in "+sailingRegion.label+".";
  els.figureDescription.textContent=sailingRegion.label+" / "+state.sails.length+" recorded sails";
  els.detailTitle.textContent=selectedSail?.label || sailingRegion.label;
  updateSailingCamera();

  els.sailGhosts.textContent = "";

  if (!selectedSail) {
    state.sails.forEach((sail) => {
      const segments = [sail.points.map((point) => ({ ...point, ...projection(point.lon, point.lat) }))];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", projectedSegmentsToPath(segments, 0.72));
      path.setAttribute("class", "sail-ghost");
      els.sailGhosts.append(path);
    });
    renderAllSailStats();
    return;
  }

  const selectedSegments = [selectedSail.points.map((point) => ({ ...point, ...projection(point.lon, point.lat) }))];
  animateSelectedSail(selectedSail, selectedSegments);
  els.rideMilesLabel.textContent = "Sail distance";
  els.rideSpeedLabel.textContent = "Sail avg. speed";
  els.rideMiles.textContent = `${(selectedSail.stats.miles * 0.868976).toFixed(2)} nm`;
  els.rideSpeed.textContent = selectedSail.hasRecordedTiming
    ? `${(selectedSail.stats.avgMph * 0.868976).toFixed(1)} kn` : "Not recorded";
  els.equipmentLabel.textContent = "Trace";
  els.equipmentValue.textContent = selectedSail.label;
}

function updateSailingCamera(animate = true) {
  const frame = document.querySelector(".visual-frame").getBoundingClientRect();
  if (!frame.width || !frame.height) return;
  const selected = state.sails[state.selectedSailIndex];
  let points;
  if(!state.sails.length){
    const b=sailingRegion.bounds;
    points=[[b.minLon,b.minLat],[b.minLon,b.maxLat],[b.maxLon,b.minLat],[b.maxLon,b.maxLat]].map(([lon,lat])=>sailProjection(lon,lat));
  } else if (selected) {
    points = selected.points.map((p) => sailProjection(p.lon, p.lat));
  } else if (sailingView === "home") {
    const center = launchCenter(state.sails);
    const origin = sailProjection(center.lon, center.lat);
    const nearby = sailProjection(center.lon, center.lat + 0.028);
    const radius = Math.hypot(nearby.x - origin.x, nearby.y - origin.y);
    points = [{ x: origin.x - radius, y: origin.y - radius }, { x: origin.x + radius, y: origin.y + radius }];
  } else {
    points = state.sails.flatMap((sail) => sail.points.map((p) => sailProjection(p.lon, p.lat)));
  }
  sailingCamera.move(fitCamera(points, frame.width / frame.height, selected ? 0.18 : 0.28), animate);
  els.sailingVisual.dataset.camera = selected ? "sail" : sailingView;
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
  els.rideSpeed.textContent = state.sails.length && state.sails.every((sail) => sail.hasRecordedTiming)
    ? `${((totals.miles / Math.max(totals.hours, 0.01)) * 0.868976).toFixed(1)} kn` : "Not recorded";
  els.equipmentLabel.textContent = "Traces";
  els.equipmentValue.textContent = `${state.sails.length} recorded sails`;
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
    Math.max(sailAnimation.minDuration, sail.playbackHours * sailAnimation.msPerTrackHour)
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
    element.style.display = "none";
  } else {
    element.removeAttribute("hidden");
    element.style.display = "";
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
  const mix = Math.round(progress * 100);
  return `color-mix(in srgb, var(--deep-park-green) ${100 - mix}%, var(--target-gold) ${mix}%)`;
}

function selectAdjacentRide(direction) {
  if (!state.rides.length) return;

  const current = state.selectedRideIndex === null
    ? (direction > 0 ? -1 : 0)
    : state.selectedRideIndex;

  state.selectedRideIndex = (current + direction + state.rides.length) % state.rides.length;
  renderRideState();
}

function selectAdjacentSail(direction) {
  if (!state.sails.length) return;

  const current = state.selectedSailIndex === null
    ? (direction > 0 ? -1 : 0)
    : state.selectedSailIndex;

  state.selectedSailIndex = (current + direction + state.sails.length) % state.sails.length;
  renderSailingState();
}

function selectAdjacentArcherySession(direction) {
  if (!state.archerySessions.length) return;

  const current = state.selectedArcherySessionIndex === null
    ? (direction > 0 ? -1 : 0)
    : state.selectedArcherySessionIndex;

  state.selectedArcherySessionIndex = (current + direction + state.archerySessions.length) % state.archerySessions.length;
  renderArcheryState();
}

function selectAllRides() {
  state.selectedRideIndex = null;
  renderRideState();
}

function selectAllSails() {
  sailingView = "all";
  state.selectedSailIndex = null;
  renderSailingState();
}

function selectAllArcherySessions() {
  state.selectedArcherySessionIndex = null;
  renderArcheryState();
}

function renderConditions(record, latest=false) {
  const weather=weatherDisplay(record?.weather);
  els.metaLocation.textContent=record?.location || "Not recorded";
  els.metaDate.textContent=record?.localDate ? captureLabels(record.localDate+"T12:00:00Z").date : "Not recorded";
  els.metaTime.textContent=record?.timeZone && Number.isFinite(Date.parse(record?.sourceDate))
    ? new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone:record.timeZone,timeZoneName:"short"}).format(new Date(record.sourceDate))
    : captureLabels(record?.sourceDate).time;
  els.metaWeatherLabel.textContent="Weather";
  els.metaWeather.textContent=weather.condition;
  els.metaWeather.title=(latest?"Latest activity. ":"")+weather.title;
  document.getElementById("metaTemperature").textContent=weather.temperature;
  document.getElementById("metaTemperature").title=weather.title;
  els.metaWindLabel.textContent="Avg wind";
  els.metaWind.textContent=weather.wind;
  els.metaTideLabel.textContent="Starting tide";
  els.metaTide.textContent=record?.tide?.status==="ok"?(record.tide.start?.label || record.tide.phase || "Not recorded"):"Not recorded";
  els.metaTide.title="Tide at the recorded activity start";
  document.getElementById("metaTideEnd").textContent=record?.tide?.status==="ok"?(record.tide.end?.label || "Not recorded"):"Not recorded";
  document.querySelector(".global-meta").setAttribute("aria-label",latest?"Latest activity conditions":"Activity conditions");
}

function renderSelectedConditions(mode) {
  const [items,selected,records]=mode==="cycling"
    ? [state.rides,state.selectedRideIndex,state.activityMetadata.rides]
    : mode==="sailing" ? [state.sails,state.selectedSailIndex,state.activityMetadata.sails]
    : [state.archerySessions,state.selectedArcherySessionIndex,state.activityMetadata.archerySessions];
  const recordFor=item=>records?.[item.id || item.sessionId] || {
    localDate:item.recordedDate || item.recordedAt?.slice(0,10),
    sourceDate:item.capturedAt || item.recordedAt
  };
  const record=selected===null
    ? items.map(recordFor).sort((a,b)=>(b.sourceDate || b.localDate || "").localeCompare(a.sourceDate || a.localDate || ""))[0]
    : items[selected] && recordFor(items[selected]);
  const mediaEvent=items[selected ?? 0];
  const mediaKey=mode+":"+(mediaEvent?.id || mediaEvent?.sessionId || "");
  eventMedia.setEvent(mediaKey,mediaEvent?.label || mediaEvent?.name,mediaIndex[mediaKey] || []);
  renderConditions(record && {...record,timeZone:mode==="sailing"?sailingRegion.timeZone:record.timeZone},selected===null && items.length>1);
}
