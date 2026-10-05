import { readFile, writeFile } from "node:fs/promises";
import { lookupActivityWeather } from "./activity-weather.mjs";
import { mapRegions } from "./map-regions.mjs";

const outputFile = new URL("../content/activity-metadata.json", import.meta.url);
const legacyRideOutputFile = new URL("../content/rides/ride-metadata.json", import.meta.url);
const rideIndexFile = new URL("../content/rides/ride-index.json", import.meta.url);
const sailIndexFile = new URL("../content/sails/sail-index.json", import.meta.url);
const archerySessionIndexFile = new URL("../content/archery/session-index.json", import.meta.url);
let existingMetadata={};
try{existingMetadata=JSON.parse(await readFile(outputFile,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}

const activityLocations = {
  cycling: {
    label: "Prospect Park",
    latitude: "40.6602",
    longitude: "-73.9690",
    tideStation: "8518750",
    timeZone: "America/New_York"
  },
  sailing: {
    label: "New York Harbor",
    latitude: "40.6892",
    longitude: "-74.0445",
    tideStation: "8518750",
    timeZone: "America/New_York"
  },
  archery: {
    label: "Brooklyn range",
    latitude: "40.6602",
    longitude: "-73.9690",
    tideStation: "8518750",
    timeZone: "America/New_York"
  }
};

const parkFocusBounds = {
  minLat: 40.649,
  maxLat: 40.6735,
  minLon: -73.981,
  maxLon: -73.954
};

const [rides, sails, archerySessions] = await Promise.all([
  buildRideMetadata(),
  buildSailMetadata(),
  buildArcheryMetadata()
]);

const metadata = {
  schema: "activity-metadata-v0.1",
  generatedAt: new Date().toISOString(),
  sources: {
    weather: {
      provider: "Open-Meteo Archive API",
      variables: ["weather_code", "wind_speed_10m", "wind_direction_10m"],
      method: "Hourly archive samples averaged over the activity window; nearest hour when no duration is available."
    },
    tide: {
      provider: "NOAA CO-OPS API",
      product: "predictions",
      method: "Next high/low prediction at or after the activity start."
    }
  },
  locations: activityLocations,
  rides,
  sails,
  archerySessions
};

await writeFile(outputFile, `${JSON.stringify(metadata, null, 2)}\n`);
await writeFile(legacyRideOutputFile, `${JSON.stringify({
  generatedAt: metadata.generatedAt,
  location: activityLocations.cycling,
  rides
}, null, 2)}\n`);

async function buildRideMetadata() {
  const rideIndex = JSON.parse(await readFile(rideIndexFile, "utf8"));
  const records = {};

  for (const ride of rideIndex) {
    const points = parseGpx(await readFile(new URL(`../content/rides/${ride.file}`, import.meta.url), "utf8"));
    const parkPoints = points.filter((point) => pointInBounds(point, parkFocusBounds));
    records[ride.id] = await buildActivityRecord({
      id: ride.id,
      label: ride.name,
      activity: "cycling",
      points: parkPoints.length ? parkPoints : points,
      location: activityLocations.cycling
    });
  }

  return records;
}

async function buildSailMetadata() {
  const sailIndex = JSON.parse(await readFile(sailIndexFile, "utf8"));
  const records = {};

  for (const sail of sailIndex) {
    const points = parseGpx(await readFile(new URL(`../content/sails/${sail.file}`, import.meta.url), "utf8"));
    const region=mapRegions.sailing.find(region=>region.id===sail.regionId);
    records[sail.id] = await buildActivityRecord({
      id: sail.id,
      label: sail.label,
      activity: "sailing",
      points,
      location: region ? {...activityLocations.sailing,label:region.label,timeZone:region.timeZone,
        tideStation:region.id==="ny-harbor"?activityLocations.sailing.tideStation:null} : activityLocations.sailing
    });
  }

  return records;
}

async function buildArcheryMetadata() {
  const sessionIndex = JSON.parse(await readFile(archerySessionIndexFile, "utf8"));
  const records = {};

  for (const sessionEntry of sessionIndex) {
    const session = JSON.parse(await readFile(new URL(`../content/archery/${sessionEntry.file}`, import.meta.url), "utf8"));
    if (session.source?.type === "target-photo") {
      records[sessionEntry.id] = existingMetadata.archerySessions?.[sessionEntry.id] || {
        id: sessionEntry.id, label: session.name, activity: "archery",
        sourceDate: session.capturedAt || null, sourceEndDate: null,
        localDate: session.recordedDate, location: "Not recorded",
        weather: { status: "unavailable" }, tide: { status: "unavailable" }
      };
      continue;
    }
    const startedAt = new Date(session.startedAt);
    records[sessionEntry.id] = await buildActivityRecord({
      id: sessionEntry.id,
      label: session.name || sessionEntry.name,
      activity: "archery",
      startDate: startedAt,
      endDate: new Date(startedAt.getTime() + 60 * 60 * 1000),
      location: activityLocations.archery
    });
  }

  return records;
}

async function buildActivityRecord({ id, label, activity, points, startDate, endDate, location }) {
  const windowStart = startDate || new Date(points[0].time);
  const windowEnd = endDate || new Date(points[points.length - 1].time);
  const group=activity==="cycling"?"rides":activity==="sailing"?"sails":"archerySessions";
  const cached=existingMetadata[group]?.[id]?.weather;
  const [weather, tide] = await Promise.all([
    safeMetadataLookup(() => getHistoricalWeather(windowStart, windowEnd, points?.length ? {...location,latitude:points[0].lat,longitude:points[0].lon} : location, cached)),
    safeMetadataLookup(() => getTideForDate(windowStart, location))
  ]);

  return {
    id,
    label,
    activity,
    sourceDate: windowStart.toISOString(),
    sourceEndDate: windowEnd.toISOString(),
    localDate: dateKey(windowStart, location),
    location: location.label,
    weather,
    tide
  };
}

async function safeMetadataLookup(loader) {
  try {
    return await loader();
  } catch (error) {
    return {
      status: "unavailable",
      error: error.message
    };
  }
}

function parseGpx(xml) {
  const matches = [...xml.matchAll(/<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>[\s\S]*?<time>([^<]+)<\/time>[\s\S]*?<\/trkpt>/g)];
  return matches.map((match) => ({
    lat: Number(match[1]),
    lon: Number(match[2]),
    time: match[3]
  })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon) && point.time);
}

function pointInBounds(point, bounds) {
  return point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lon >= bounds.minLon &&
    point.lon <= bounds.maxLon;
}

async function getHistoricalWeather(startDate, endDate, location, cached) {
  return lookupActivityWeather({latitude:Number(location.latitude),longitude:Number(location.longitude),startedAt:startDate.toISOString(),endedAt:endDate.toISOString()},{cached});
}

async function getTideForDate(date, location) {
  if(!location.tideStation)return {status:"unavailable"};
  const start = new Date(date.getTime() - 7 * 60 * 60 * 1000);
  const end = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    product: "predictions",
    application: "reesemcardle_site",
    begin_date: noaaDate(start, location),
    end_date: noaaDate(end, location),
    datum: "MLLW",
    station: location.tideStation,
    time_zone: "lst_ldt",
    units: "english",
    interval: "hilo",
    format: "json"
  });
  const response = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`);
  if (!response.ok) throw new Error(`Tide lookup failed for ${date.toISOString()}`);

  const predictions = ((await response.json()).predictions || [])
    .map((prediction) => ({
      type: prediction.type,
      date: new Date(prediction.t.replace(" ", "T"))
    }))
    .sort((a, b) => a.date - b.date);
  const next = predictions.find((prediction) => prediction.date >= date);
  if (!next) throw new Error(`No tide prediction near ${date.toISOString()}`);

  return {
    status: "ok",
    phase: next.type === "H" ? "Flood tide" : "Ebb tide",
    source: {
      provider: "NOAA CO-OPS API",
      station: location.tideStation,
      predictionTime: next.date.toISOString()
    }
  };
}


function dateKey(date, location) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: location.timeZone
  });
  return formatter.format(date);
}

function noaaDate(date, location) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: location.timeZone
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}${parts.month}${parts.day} ${parts.hour}:${parts.minute}`;
}
