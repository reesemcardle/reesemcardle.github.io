import test from "node:test";
import assert from "node:assert/strict";
import {lookupActivityWeather,weatherDisplay} from "../scripts/activity-weather.mjs";

const input={latitude:40.6892,longitude:-74.0445,startedAt:"2026-03-24T14:57:54-04:00"};
const hourly={time:["2026-03-24T18:00","2026-03-24T19:00","2026-03-24T20:00"],
  weather_code:[3,0,0],temperature_2m:[50,52,54],wind_speed_10m:[4,6,8],wind_direction_10m:[350,10,20]};
test("shared weather uses UTC instants and rounded coordinates, not the host timezone",async()=>{
  let calls=0;
  const fetcher=async url=>{
    calls++;
    const params=new URL(url).searchParams;
    assert.equal(params.get("timezone"),"UTC");assert.equal(params.get("longitude"),"-74.04");
    assert.equal(params.get("temperature_unit"),"fahrenheit");
    return {ok:true,json:async()=>({hourly})};
  };
  const weather=await lookupActivityWeather(input,{fetcher});
  assert.equal(weather.status,"ok");assert.equal(weather.condition,"Clear");
  assert.equal(weather.temperatureF,52);assert.equal(weather.wind,"N 6 mph");
  assert.equal(weatherDisplay(weather).condition,"Clear");
  assert.equal(weatherDisplay(weather).temperature,"52 F");
  assert.equal(await lookupActivityWeather(input,{fetcher,cached:weather}),weather);assert.equal(calls,1);
  const legacy={status:"ok",condition:"Clear",wind:"N 6 mph",source:{
    latitude:"40.69",longitude:"-74.04",sampledFrom:"2026-03-24T18:57:54Z",sampledTo:"2026-03-24T18:57:54Z"}};
  assert.equal((await lookupActivityWeather(input,{fetcher,cached:legacy})).condition,"Clear");
  assert.equal(calls,1);
  await lookupActivityWeather({...input,latitude:41},{fetcher,cached:weather});assert.equal(calls,2);
});
test("activity windows aggregate samples and wind direction across north",async()=>{
  const weather=await lookupActivityWeather({...input,startedAt:"2026-03-24T18:00:00Z",endedAt:"2026-03-24T19:00:00Z"},
    {fetcher:async()=>({ok:true,json:async()=>({hourly})})});
  assert.equal(weather.wind,"N 5 mph");assert.equal(weather.temperatureF,51);
});
test("missing time, date-only time, coordinates, errors and null samples never fabricate weather",async()=>{
  for(const value of [{},{...input,startedAt:"2026-03-24"},{...input,startedAt:"2026-03-24T14:57:54"},{...input,latitude:null}]){
    const weather=await lookupActivityWeather(value,{fetcher:()=>assert.fail("must not request unknown time/location")});
    assert.equal(weatherDisplay(weather).condition,"Weather unavailable");
  }
  const fetcher=async()=>{throw new Error("offline");};
  assert.equal((await lookupActivityWeather(input,{fetcher})).status,"unavailable");
  const missing=await lookupActivityWeather(input,{fetcher:async()=>({ok:true,json:async()=>({hourly:{...hourly,temperature_2m:[null,null,null]}})})});
  assert.equal(missing.status,"unavailable");
  const retried=await lookupActivityWeather(input,{cached:missing,fetcher:async()=>({ok:true,json:async()=>({hourly})})});
  assert.equal(retried.status,"ok");
});
