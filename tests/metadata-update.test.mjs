import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichMetadata,metadataInput} from '../scripts/update-metadata.mjs';
import {lookupActivityTide,tideAt} from '../scripts/activity-tides.mjs';
const input={latitude:40.7,longitude:-74,startedAt:'2026-07-03T12:00:00Z',endedAt:'2026-07-03T13:00:00Z',regionId:'ny-harbor'};
const weather={status:'ok',temperatureF:70,wind:'N 5 mph',condition:'Clear'};
test('metadata report never calls providers or changes records',async()=>{
 const record={location:'My location',weather:{status:'unavailable'},notes:'Keep'};
 const result=await enrichMetadata(record,input,{report:true,tides:true,weatherLookup:()=>assert.fail(),tideLookup:()=>assert.fail()});
 assert.deepEqual(result.record,record);assert.equal(result.messages.length,2);
});
test('saved weather and start/end tide require no requests',async()=>{
 const record={weather,tide:{status:'ok',start:{label:'manual start'},end:{label:'manual end'}}};
 assert.deepEqual((await enrichMetadata(record,input,{tides:true,weatherLookup:()=>assert.fail(),tideLookup:()=>assert.fail()})).record,record);
});
test('missing temperature is filled while saved conditions and unrelated fields survive',async()=>{
 const record={location:'Custom',notes:'Keep',weather:{status:'ok',wind:'W 8 mph',condition:'Cloudy'}};
 const result=await enrichMetadata(record,input,{weatherLookup:async()=>weather});
 assert.equal(result.record.weather.temperatureF,70);assert.equal(result.record.weather.wind,'W 8 mph');assert.equal(result.record.weather.condition,'Cloudy');assert.equal(result.record.notes,'Keep');assert.equal(record.weather.temperatureF,undefined);
});
test('missing inputs and provider failures preserve records',async()=>{
 const record={weather:{status:'unavailable',reason:'Old'}};
 assert.deepEqual((await enrichMetadata(record,{}, {weatherLookup:()=>assert.fail()})).record,record);
 assert.deepEqual((await enrichMetadata(record,input,{weatherLookup:async()=>({status:'unavailable',reason:'Offline'})})).record,record);
 assert.equal(metadataInput({sourceDate:input.startedAt},{latitude:1},{latitude:2}).latitude,2);
});
test('tides interpolate UTC samples, distinguish rising water from current, and reject gaps',async()=>{
 const base=Date.parse(input.startedAt),samples=Array.from({length:100},(_,i)=>({time:base+(i-10)*60000,height:i/100}));
 assert.equal(tideAt(samples,input.startedAt).label,'0.10 m · rising');
 assert.equal(tideAt(samples.map(s=>({...s,height:2-s.height})),input.startedAt).phase,'Falling');
 assert.throws(()=>tideAt([],input.startedAt));
 let url;
 const response=await lookupActivityTide(input,{fetcher:async value=>{url=value;return {ok:true,json:async()=>({predictions:samples.map(s=>({t:new Date(s.time).toISOString().slice(0,16).replace('T',' '),v:String(s.height)}))})};}});
 assert.equal(response.status,'ok');assert.match(url,/time_zone=gmt/);assert.equal(response.source.station,'8518750');
 assert.deepEqual(await lookupActivityTide(input,{cached:response,fetcher:()=>assert.fail()}),response);
});
test('archery uses one capture instant while rides retain their end time',async()=>{
 const calls=[];
 const tideLookup=async value=>{calls.push(value);return {status:'ok',start:{label:'start'},end:{label:'end'}};};
 const photo=await enrichMetadata({weather},input,{tides:true,captureOnly:true,tideLookup});
 await enrichMetadata({weather},input,{tides:true,tideLookup});
 assert.equal(calls[0].endedAt,input.startedAt);assert.equal(photo.record.tide.captureOnly,true);
 assert.equal(calls[1].endedAt,input.endedAt);
});
