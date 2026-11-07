import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DOMParser} from '@xmldom/xmldom';
import {contentFolder} from './content-paths.mjs';
import {atomicJson} from './target-store.mjs';
import {lookupActivityWeather,weatherRequest} from './activity-weather.mjs';
import {lookupActivityTide} from './activity-tides.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export const completeWeather=w=>w?.status==='ok' && Number.isFinite(w.temperatureF) && Boolean(w.wind && w.condition);
export const completeTide=t=>t?.status==='ok' && Boolean(t.start?.label && t.end?.label);
export function metadataInput(record,derived={},override={}){
  let cached={};try{cached=JSON.parse(record.weather?.requestKey || '{}');}catch{}
  const source=record.weather?.source || {};
  return {...derived,latitude:cached.latitude ?? (source.latitude!=null?Number(source.latitude):derived.latitude),longitude:cached.longitude ?? (source.longitude!=null?Number(source.longitude):derived.longitude),startedAt:record.sourceDate || record.capturedAt || derived.startedAt,endedAt:record.sourceEndDate || derived.endedAt || record.sourceDate || record.capturedAt || derived.startedAt,...override};
}
export async function enrichMetadata(record,input,{tides=false,captureOnly=false,report=false,weatherLookup=lookupActivityWeather,tideLookup=lookupActivityTide}={}){
  const result=structuredClone(record),messages=[];
  if(completeWeather(record.weather))messages.push('weather saved');
  else if(!weatherRequest(input))messages.push('weather needs coordinates and time with timezone');
  else if(report)messages.push('weather lookup needed');
  else{
    const weather=await weatherLookup(input);
    if(weather.status==='ok'){
      // Fill fields without changing existing conditions, user text, or other metadata.
      result.weather={...weather,...record.weather,status:'ok',temperatureF:record.weather?.temperatureF ?? weather.temperatureF,wind:record.weather?.wind || weather.wind,condition:record.weather?.condition || weather.condition};
      delete result.weather.reason;delete result.weather.error;
      messages.push('weather filled');
    }else messages.push('weather unavailable: '+weather.reason);
  }
  if(tides){
    if(completeTide(record.tide))messages.push('tides saved');
    else if(!weatherRequest({latitude:0,longitude:0,startedAt:input.startedAt,endedAt:input.endedAt}))messages.push('tides need start/end times with timezone');
    else if(report)messages.push('tide lookup needed');
    else{
      const tide=await tideLookup(captureOnly?{...input,endedAt:input.startedAt}:input);
      if(tide.status==='ok'){
        result.tide={...record.tide,...tide,start:record.tide?.start?.label?record.tide.start:tide.start,end:record.tide?.end?.label?record.tide.end:tide.end};
        if(captureOnly)result.tide.captureOnly=true;
        messages.push('tides filled');
      }else messages.push('tides unavailable: '+tide.reason);
    }
  }
  return {record:result,messages};
}
export async function updateMetadata({content=join(project,'content'),folder=contentFolder(),report=false,only=null,log=console.log}={}){
  const overrides=await read(join(folder,'metadata.json'),{events:{}});
  const path=join(content,'activity-metadata.json'),metadata=await read(path,{});
  let changed=0;
  const sections=[['cycling','rides','ride-index.json'],['sailing','sails','sail-index.json'],['archery','archery','session-index.json'],['video','videos','video-index.json']];
  for(const [mode,dir,indexName] of sections){
    if(only && only!==mode)continue;
    const indexPath=join(content,dir,indexName),index=await read(indexPath,[]);
    for(const entry of index){
      const group=mode==='cycling'?'rides':mode==='sailing'?'sails':'archerySessions';
      const original=mode==='video'?entry:metadata[group]?.[entry.id] || {id:entry.id,label:entry.label || entry.name};
      let derived={};
      if(mode==='cycling'){
        const xml=new DOMParser().parseFromString(await readFile(join(content,dir,entry.file),'utf8'),'application/xml');
        const points=Array.from(xml.getElementsByTagNameNS('*','trkpt'));
        if(points.length)derived={latitude:Number(points[0].getAttribute('lat')),longitude:Number(points[0].getAttribute('lon')),startedAt:points[0].getElementsByTagNameNS('*','time')[0]?.textContent,endedAt:points.at(-1).getElementsByTagNameNS('*','time')[0]?.textContent};
      }else if(mode==='sailing'){
        const track=await read(join(content,dir,entry.webFile),{}),points=track.points || [];
        if(points.length)derived={latitude:points[0][0],longitude:points[0][1],startedAt:points[0][2],endedAt:points.at(-1)[2],regionId:entry.regionId};
      }else if(mode==='archery'){
        const session=await read(join(content,dir,entry.file),{});
        derived={startedAt:session.capturedAt || session.startedAt};
      }
      const input=metadataInput(original,derived,overrides.events?.[`${mode}:${entry.id}`]);
      if(mode==='cycling' || mode==='archery')input.regionId='ny-harbor';
      const enriched=await enrichMetadata(original,input,{tides:mode!=='video',captureOnly:mode==='archery',report});
      log(`${mode} / ${entry.label || entry.name || entry.id}: ${enriched.messages.join('; ')}`);
      if(JSON.stringify(original)!==JSON.stringify(enriched.record)){
        if(mode==='video')Object.assign(entry,enriched.record);
        else{metadata[group] ||= {};metadata[group][entry.id]=enriched.record;}
        changed++;
      }
    }
    if(!report && mode==='video' && JSON.stringify(index)!==JSON.stringify(await read(indexPath,[])))await atomicJson(indexPath,index);
  }
  if(!report && JSON.stringify(metadata)!==JSON.stringify(await read(path,{})))await atomicJson(path,metadata);
  log(`${report?'Report only; no lookups or writes.':changed+' records updated. Saved values retained.'}`);
  return changed;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.includes('--help'))console.log('Usage: ./update-metadata [--report] [--only cycling|sailing|archery|video]\nFills missing weather and activity tides. Never processes media or deploys.\nOptional private inputs: private/Website Content/metadata.json');
  else{
    for(let i=0;i<args.length;i++)if(args[i]==='--only')i++;else if(!['--report','--dry-run'].includes(args[i]))throw new Error('Unknown option: '+args[i]);
    const only=args.includes('--only')?args[args.indexOf('--only')+1]:null;
    if(args.includes('--only') && !['cycling','sailing','archery','video'].includes(only))throw new Error('Invalid --only mode');
    await updateMetadata({report:args.includes('--report') || args.includes('--dry-run'),only});
  }
}
