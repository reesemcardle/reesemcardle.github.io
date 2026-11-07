import {weatherRequest} from './activity-weather.mjs';
export const tideStations={
  'ny-harbor':{provider:'NOAA',id:'8518750',name:'The Battery',datum:'MLLW'},
  newport:{provider:'NOAA',id:'8452660',name:'Newport',datum:'MLLW'},
  'mahone-bay':{provider:'CHS',id:'5dd3064de0fdc4b9b4be6674',code:'00460',name:'Mahone Harbour',datum:'Chart datum'}
};
export function tideAt(samples,instant){
  const time=Date.parse(instant),i=samples.findIndex(s=>s.time>=time);
  if(i<0)throw new Error('No tide samples around activity');
  const left=samples[Math.max(0,i-1)],right=samples[i];
  if(Math.abs(time-left.time)>360000 || Math.abs(right.time-time)>360000)throw new Error('Gap in tide predictions');
  const height=left.time===right.time?right.height:left.height+(right.height-left.height)*(time-left.time)/(right.time-left.time);
  const before=samples.findLast(s=>s.time<=time-300000),after=samples.find(s=>s.time>=time+300000);
  if(!before || !after)throw new Error('Insufficient tide context');
  const delta=after.height-before.height;
  const phase=Math.abs(delta)<.005?'Turning':delta>0?'Rising':'Falling';
  return {at:instant,heightMeters:+height.toFixed(3),phase,label:`${height.toFixed(2)} m · ${phase.toLowerCase()}`};
}
export async function lookupActivityTide({regionId,startedAt,endedAt},{fetcher=globalThis.fetch,cached}={}){
  const station=tideStations[regionId];
  const valid=weatherRequest({latitude:0,longitude:0,startedAt,endedAt});
  if(!station || !valid)return {status:'unavailable',reason:'Supported sailing region and start/end times with timezone required'};
  const requestKey=JSON.stringify({station:station.id,startedAt:valid.startedAt,endedAt:valid.endedAt});
  if(cached?.status==='ok' && cached.start && cached.end && cached.requestKey===requestKey)return cached;
  if(Date.parse(valid.endedAt)-Date.parse(valid.startedAt)>7*86400000)return {status:'unavailable',reason:'Activity exceeds seven days'};
  try{
    // Allow a full sample interval beyond the five-minute trend window.
    const from=new Date(Date.parse(valid.startedAt)-1200000).toISOString(),to=new Date(Date.parse(valid.endedAt)+1200000).toISOString();
    let url;
    if(station.provider==='NOAA'){
      const date=s=>s.slice(0,10).replaceAll('-','')+' '+s.slice(11,16);
      url='https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?'+new URLSearchParams({product:'predictions',application:'reesemcardle_site',station:station.id,begin_date:date(from),end_date:date(to),datum:'MLLW',units:'metric',time_zone:'gmt',interval:'6',format:'json'});
    }else url=`https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/${station.id}/data?`+new URLSearchParams({'time-series-code':'wlp',from,to});
    const response=await fetcher(url,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Tide service unavailable');
    const data=await response.json();
    const samples=(station.provider==='NOAA'?data.predictions || []:Array.isArray(data)?data:[]).map(s=>({time:Date.parse(s.eventDate || s.t?.replace(' ','T')+'Z'),height:s.value ?? (s.v!=null && s.v!==''?Number(s.v):NaN)})).filter(s=>Number.isFinite(s.time)&&Number.isFinite(s.height)).sort((a,b)=>a.time-b.time);
    return {status:'ok',requestKey,start:tideAt(samples,valid.startedAt),end:tideAt(samples,valid.endedAt),source:{provider:station.provider,station:station.code || station.id,stationName:station.name,datum:station.datum,method:'Predicted station water level; interpolated at activity start/end',retrievedAt:new Date().toISOString()}};
  }catch(error){return {status:'unavailable',reason:error.message};}
}
