// One provider contract for every content type. Inputs require an actual instant,
// not a date-only value or the machine's local timezone.
export function weatherRequest({latitude, longitude, startedAt, endedAt = startedAt} = {}) {
  const instant = value => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || !instant(startedAt) || !instant(endedAt)) return null;
  if (Date.parse(endedAt)<Date.parse(startedAt)) return null;
  return {latitude:+latitude.toFixed(2),longitude:+longitude.toFixed(2),startedAt:new Date(startedAt).toISOString(),endedAt:new Date(endedAt).toISOString()};
}

export function weatherCodeLabel(code) {
  return ({0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Cloudy",45:"Fog",48:"Rime fog",
    51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",56:"Freezing drizzle",57:"Freezing drizzle",
    61:"Light rain",63:"Rain",65:"Heavy rain",66:"Freezing rain",67:"Freezing rain",
    71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",80:"Light showers",
    81:"Showers",82:"Heavy showers",85:"Snow showers",86:"Heavy snow showers",
    95:"Thunderstorm",96:"Thunderstorm with hail",99:"Thunderstorm with hail"})[code] || "Unknown conditions";
}

export async function lookupActivityWeather(input, {fetcher=globalThis.fetch, cached} = {}) {
  const request=weatherRequest(input);
  if(!request)return {status:"unavailable",reason:"Capture time with timezone and coordinates required"};
  const key=JSON.stringify(request);
  if(cached?.status==="ok" && cached.requestKey===key)return cached;
  // Reuse older saved records when their recorded lookup inputs still match.
  if(cached?.status==="ok" && !cached.requestKey && cached.source){
    const legacy=weatherRequest({latitude:Number(cached.source.latitude),longitude:Number(cached.source.longitude),
      startedAt:cached.source.sampledFrom,endedAt:cached.source.sampledTo});
    if(legacy && JSON.stringify(legacy)===key)return {...cached,requestKey:key};
  }
  try {
    const params=new URLSearchParams({
      latitude:request.latitude,longitude:request.longitude,
      start_date:request.startedAt.slice(0,10),end_date:request.endedAt.slice(0,10),
      hourly:"weather_code,temperature_2m,wind_speed_10m,wind_direction_10m",
      timezone:"UTC",wind_speed_unit:"mph",temperature_unit:"fahrenheit"
    });
    const response=await fetcher("https://archive-api.open-meteo.com/v1/archive?"+params,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error("Historical weather request failed");
    const {hourly}=await response.json();
    const start=Date.parse(request.startedAt),end=Date.parse(request.endedAt);
    const samples=(hourly?.time || []).map((time,i)=>({
      time:Date.parse(time+"Z"),code:hourly.weather_code?.[i],temperature:hourly.temperature_2m?.[i],
      speed:hourly.wind_speed_10m?.[i],direction:hourly.wind_direction_10m?.[i]
    })).filter(s=>[s.time,s.code,s.temperature,s.speed,s.direction].every(Number.isFinite));
    let selected=samples.filter(s=>s.time>=start && s.time<=end);
    if(!selected.length){
      const nearest=samples.reduce((best,s)=>!best || Math.abs(s.time-start)<Math.abs(best.time-start)?s:best,null);
      if(!nearest || Math.abs(nearest.time-start)>3600000)throw new Error("No weather samples near the activity");
      selected=[nearest];
    }
    const average=key=>selected.reduce((sum,s)=>sum+s[key],0)/selected.length;
    const codes=new Map();
    for(const s of selected)codes.set(s.code,(codes.get(s.code)||0)+1);
    const code=[...codes].sort((a,b)=>b[1]-a[1])[0][0];
    const x=selected.reduce((sum,s)=>sum+Math.sin(s.direction*Math.PI/180),0);
    const y=selected.reduce((sum,s)=>sum+Math.cos(s.direction*Math.PI/180),0);
    const direction=(Math.atan2(x,y)*180/Math.PI+360)%360;
    const cardinal=["N","NE","E","SE","S","SW","W","NW"][Math.round(direction/45)%8];
    return {status:"ok",requestKey:key,condition:weatherCodeLabel(code),temperatureF:Math.round(average("temperature")),
      wind:cardinal+" "+Math.round(average("speed"))+" mph",
      source:{provider:"Open-Meteo Archive API",method:"Hourly historical estimate",sampledFrom:request.startedAt,sampledTo:request.endedAt}};
  }catch{
    return {status:"unavailable",reason:"Historical weather unavailable; retry on the next content update"};
  }
}

export function weatherDisplay(weather) {
  if(weather?.status!=="ok")return {condition:"Weather unavailable",wind:"Wind unavailable",temperature:"Not recorded",title:weather?.reason || "Recorded time or location is unavailable"};
  return {condition:weather.condition,temperature:Number.isFinite(weather.temperatureF)?weather.temperatureF+" F":"Not recorded",
    wind:weather.wind || "Wind unavailable",title:"Open-Meteo historical hourly estimate"};
}
