import { readFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { atomicJson } from "./target-store.mjs";
import { lookupActivityWeather } from "./activity-weather.mjs";

const exec = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const version = 2;
async function probe(file) {
  try {
    const { stdout } = await exec(ffprobe,["-v","error","-show_format","-show_streams","-of","json",file],{maxBuffer:4*1024*1024});
    return JSON.parse(stdout);
  } catch(error) { throw new Error(error.code === "ENOENT" ? "Install FFmpeg (ffmpeg and ffprobe) to import videos." : "Unable to read this video."); }
}
export function videoMetadata(info, sidecar = {}) {
  const stream = info.streams?.find(item=>item.codec_type === "video" && !item.disposition?.attached_pic);
  const duration = Number(info.format?.duration || stream?.duration);
  if (!stream || !Number.isFinite(duration) || duration <= 0 || duration > 240.1) throw new Error("Videos must have a video track and be no longer than four minutes.");
  const tags = {...stream.tags,...info.format?.tags};
  const capturedAt = sidecar.capturedAt ?? tags["com.apple.quicktime.creationdate"] ?? tags.creation_time ?? null;
  if (capturedAt && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(capturedAt) || !Number.isFinite(Date.parse(capturedAt)))) throw new Error("Capture time needs an ISO timestamp with a timezone, e.g. 2026-03-24T14:57:54-04:00.");
  const date = sidecar.date ?? capturedAt?.slice(0,10) ?? null;
  if (date != null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)) throw new Error("Scene date must be a valid YYYY-MM-DD date.");
  const gps=(tags["com.apple.quicktime.location.ISO6709"] || tags.location || "").match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  const coordinates=sidecar.coordinates ?? (gps ? {latitude:Number(gps[1]),longitude:Number(gps[2])} : {});
  // A date correction alone must not retain weather from the original date.
  const weatherInput={...coordinates,startedAt:date===capturedAt?.slice(0,10)?capturedAt:null};
  for (const key of ["name","location","weather","wind","description"]) if (sidecar[key] != null && (typeof sidecar[key] !== "string" || sidecar[key].length>500)) throw new Error(`Invalid video ${key}.`);
  return {duration,capturedAt,date,weatherInput,videoStream:stream.index || 0,location:sidecar.location || null,hasAudio:info.streams.some(item=>item.codec_type === "audio"),hdr:["smpte2084","arib-std-b67"].includes(stream.color_transfer)};
}
export async function importVideo(path, directory, index, {dry=false,weatherLookup=lookupActivityWeather} = {}) {
  const size=(await stat(path)).size;
  if(size>2*1024*1024*1024)throw new Error("Video source exceeds 2 GB.");
  const hash=createHash("sha256");
  // Stream originals rather than keeping potentially large videos in memory.
  const {createReadStream}=await import("node:fs");
  for await(const chunk of createReadStream(path))hash.update(chunk);
  const digest=hash.digest("hex"),id=`video-${digest.slice(0,24)}`;
  let sidecar={};try{sidecar=JSON.parse(await readFile(path+".json","utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
  if(!sidecar || Array.isArray(sidecar) || typeof sidecar!=="object")throw new Error("Video sidecar must be a JSON object.");
  const settingsHash=createHash("sha256").update(JSON.stringify(sidecar)).digest("hex");
  const existing=index.find(item=>item.id===id);
  if(existing?.importVersion===version && existing.settingsHash===settingsHash) {
    try{
      await stat(join(directory,existing.file));await stat(join(directory,existing.poster));
      if(dry || weatherLookup===null || existing.weather?.status==="ok")return {entry:existing,changed:false};
      const metadata=videoMetadata(await probe(path),sidecar);
      const weather=await weatherLookup(metadata.weatherInput,{cached:existing.weather});
      if(JSON.stringify(weather)===JSON.stringify(existing.weather))return {entry:existing,changed:false};
      const entry={...existing,weather},next=index.map(item=>item.id===id?entry:item);
      await atomicJson(join(directory,"video-index.json"),next);
      return {entry,index:next,changed:true};
    }catch(error){if(error.code!=="ENOENT")throw error;}
  }
  const info=await probe(path), metadata=videoMetadata(info,sidecar);
  if(dry)return {changed:true,entry:{id}};
  if(metadata.hdr){
    const filters=await exec(ffmpeg,["-hide_banner","-filters"]);
    if(!filters.stdout.includes("zscale"))throw new Error("This is HDR video. Export an SDR copy, or install an FFmpeg build with zscale for HDR conversion.");
  }
  await mkdir(directory,{recursive:true});
  const file=`${id}.mp4`,poster=`${id}.jpg`;
  const temporary=join(directory,`.${id}-${randomUUID()}.mp4`),temporaryPoster=temporary+".jpg";
  const tone=metadata.hdr?"zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,":"";
  try {
    await exec(ffmpeg,["-hide_banner","-loglevel","error","-nostdin","-y","-i",path,"-map",`0:${metadata.videoStream}`,"-map","0:a:0?","-map_metadata","-1","-map_chapters","-1","-vf",`${tone}scale=w='if(gte(iw,ih),min(1280,iw),min(720,iw))':h='if(gte(iw,ih),min(720,ih),min(1280,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=yuv420p`,"-r","30","-c:v","libx264","-preset","medium","-crf","24","-maxrate","2400k","-bufsize","4800k","-c:a","aac","-b:a","96k","-ac","2","-movflags","+faststart",temporary],{timeout:15*60*1000,maxBuffer:2*1024*1024});
    const output=await probe(temporary),stream=output.streams.find(item=>item.codec_type==="video");
    const outputSize=(await stat(temporary)).size;
    if(outputSize>90*1024*1024)throw new Error("Web copy exceeds 90 MB. Trim or reduce the source clip.");
    await exec(ffmpeg,["-hide_banner","-loglevel","error","-nostdin","-y","-ss",String(Math.min(.3,metadata.duration/2)),"-i",temporary,"-frames:v","1","-q:v","3",temporaryPoster],{timeout:60000,maxBuffer:1024*1024});
    await rename(temporary,join(directory,file));await rename(temporaryPoster,join(directory,poster));
    const weather=weatherLookup===null?existing?.weather || {status:"unavailable",reason:"Weather lookup not requested"}:await weatherLookup(metadata.weatherInput,{cached:existing?.weather});
    const entry={id,name:sidecar.name || basename(path,extname(path)),file,poster,sourceHash:digest,settingsHash,importVersion:version,
      duration:metadata.duration,width:stream.width,height:stream.height,bytes:outputSize,hasAudio:metadata.hasAudio,date:metadata.date,capturedAt:metadata.capturedAt,location:metadata.location,weather};
    const next=index.filter(item=>item.id!==id);next.push(entry);next.sort((a,b)=>(b.date||b.capturedAt||"").localeCompare(a.date||a.capturedAt||""));
    await atomicJson(join(directory,"video-index.json"),next);
    return {entry,changed:true,index:next};
  }catch(error){throw new Error(error.code==="ENOENT"?"Install FFmpeg to import videos.":`Video conversion failed: ${error.message.slice(0,250)}`);}
  finally{await rm(temporary,{force:true});await rm(temporaryPoster,{force:true});}
}
