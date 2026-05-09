import { readFile, writeFile } from "node:fs/promises";

const rideIndexFile = new URL("../content/rides/ride-index.json", import.meta.url);
const outputFile = new URL("../content/rides/ride-metadata.json", import.meta.url);
const parkFocusBounds = {
  minLat: 40.649,
  maxLat: 40.6735,
  minLon: -73.981,
  maxLon: -73.954
};

const location = {
  latitude: "40.6602",
  longitude: "-73.9690",
  tideStation: "8518750",
  timeZone: "America/New_York"
};

const rideIndex = JSON.parse(await readFile(rideIndexFile, "utf8"));
const rides = {};

for (const ride of rideIndex) {
  const gpxFile = new URL(`../content/rides/${ride.file}`, import.meta.url);
  const points = parseGpx(await readFile(gpxFile, "utf8"));
  const parkPoints = points.filter((point) => pointInBounds(point, parkFocusBounds));
  const metadataPoints = parkPoints.length ? parkPoints : points;
  const startDate = new Date(metadataPoints[0].time);
  const endDate = new Date(metadataPoints[metadataPoints.length - 1].time);
  const [weather, tide] = await Promise.all([
    getHistoricalWeather(startDate, endDate),
    getTideForDate(startDate)
  ]);

  rides[ride.id] = {
    rideId: ride.id,
    sourceDate: startDate.toISOString(),
    sourceEndDate: endDate.toISOString(),
    localDate: dateKey(startDate),
    weather,
    tide
  };
}

await writeFile(outputFile, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  location,
  rides
}, null, 2)}\n`);

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

async function getHistoricalWeather(startDate, endDate) {
  const localDate = dateKey(startDate);
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    start_date: localDate,
    end_date: localDate,
    hourly: "weather_code,wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "mph",
    timezone: location.timeZone
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!response.ok) throw new Error(`Historical weather lookup failed for ${localDate}`);

  const hourly = (await response.json()).hourly;
  const indexes = hourly.time
    .map((time, index) => ({ index, time: new Date(time).getTime() }))
    .filter((item) => item.time >= startDate.getTime() && item.time <= endDate.getTime())
    .map((item) => item.index);

  return formatWeatherSamples(
    hourly.weather_code,
    hourly.wind_speed_10m,
    hourly.wind_direction_10m,
    indexes.length ? indexes : [nearestHourlyIndex(hourly.time, startDate)]
  );
}

async function getTideForDate(date) {
  const start = new Date(date.getTime() - 7 * 60 * 60 * 1000);
  const end = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    product: "predictions",
    application: "reesemcardle_site",
    begin_date: noaaDate(start),
    end_date: noaaDate(end),
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

  return next.type === "H" ? "Flood tide" : "Ebb tide";
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

function formatWeather(code, windSpeed, windDirection) {
  return {
    wind: `${degreesToCardinal(windDirection)} ${Math.round(windSpeed)} mph`,
    condition: weatherCodeLabel(code)
  };
}

function formatWeatherSamples(codes, windSpeeds, windDirections, indexes) {
  const avgWind = indexes.reduce((total, index) => total + windSpeeds[index], 0) / indexes.length;
  const avgDirection = averageDirection(indexes.map((index) => windDirections[index]));
  return formatWeather(dominantWeatherCode(indexes.map((index) => codes[index])), avgWind, avgDirection);
}

function averageDirection(directions) {
  const vector = directions.reduce((acc, degrees) => {
    const radians = degrees * Math.PI / 180;
    acc.x += Math.sin(radians);
    acc.y += Math.cos(radians);
    return acc;
  }, { x: 0, y: 0 });
  return (Math.atan2(vector.x, vector.y) * 180 / Math.PI + 360) % 360;
}

function dominantWeatherCode(codes) {
  const counts = new Map();
  codes.forEach((code) => counts.set(code, (counts.get(code) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function degreesToCardinal(degrees) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % directions.length];
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

function dateKey(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: location.timeZone
  });
  return formatter.format(date);
}

function noaaDate(date) {
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
