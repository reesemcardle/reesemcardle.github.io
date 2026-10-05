import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { importPhoto, saveDetection, atomicJson, storeRoot } from "./target-store.mjs";
import { publicSession, dateIsValid } from "./target-records.mjs";
import { detectImpacts, DEFAULT_VISION_MODEL } from "./target-vision.mjs";
import { inspectGpx } from "./content-gpx.mjs";
import { writeTargetReview } from "./content-review.mjs";
import { importVideo } from "./content-video.mjs";
import exifr from "exifr";
import { lookupActivityWeather } from "./activity-weather.mjs";
import { regionForPoints } from "./map-regions.mjs";
import { sailingEvent } from "./sailing-event.mjs";
import {importEventAttachments,importMediaManifest} from "./content-media.mjs";
import {importPages} from "./content-pages.mjs";

const project=resolve(fileURLToPath(new URL("../",import.meta.url)));
try { process.loadEnvFile(join(project,"private/content.env")); } catch(error) { if(error.code!=="ENOENT")throw error; }
const args=process.argv.slice(2);
const onlyIndex=args.indexOf("--only"),only=onlyIndex>=0?args[onlyIndex+1]:null;
if(onlyIndex>=0 && !["cycling","sailing","targets","videos","media","labs","about"].includes(only))throw new Error("--only needs cycling, sailing, targets, videos, media, labs, or about.");
if(args.includes("--help")) {
  console.log("Usage: npm run update-content [-- --dry-run] [-- --folder '/path/to/Website Content']\nFolders: targets/ (JPEG, PNG, WebP), cycling/ (GPX), sailing/ (GPX), videos/ (MP4, MOV, M4V, WebM; up to 4 min).\nSet OPENAI_API_KEY in private/content.env for new target detection. Existing detections are cached.\nNo commit, push, or deployment is performed.");
  process.exit(0);
}
const folderIndex=args.indexOf("--folder");
if(folderIndex>=0 && (!args[folderIndex+1] || args[folderIndex+1].startsWith("--")))throw new Error("--folder needs a path.");
const folder=resolve(folderIndex>=0?args[folderIndex+1]:process.env.WEBSITE_CONTENT_DIR || join(homedir(),"Website Content"));
const dry=args.includes("--dry-run");
const content=resolve(process.env.CONTENT_OUTPUT_DIR || join(project,"content"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
let added=0, skipped=0, failed=0, flagged=0;
const reports=[];
async function json(path,fallback) {try{return JSON.parse(await readFile(path,"utf8"));}catch(error){if(error.code==="ENOENT")return fallback;throw error;}}
async function files(directory) {
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==="ENOENT")return [];throw error;}
  const results=[];
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    if(entry.name.startsWith("."))continue;
    const path=join(directory,entry.name);
    if(entry.isDirectory())results.push(...await files(path));
    else if(entry.isFile())results.push(path);
  }
  return results;
}
async function saveIfChanged(path,value) {
  const text=JSON.stringify(value,null,2)+"\n";
  try{if(await readFile(path,"utf8")===text)return false;}catch(error){if(error.code!=="ENOENT")throw error;}
  await atomicJson(path,value);return true;
}
async function overrides(path) {
  const values=await json(path+".json",{});
  if(values.name!==undefined && (typeof values.name!=="string" || !values.name.trim() || values.name.length>160))throw new Error("Invalid sidecar name.");
  if(values.date!==undefined && !dateIsValid(values.date))throw new Error("Invalid sidecar date (use YYYY-MM-DD).");
  if(values.excludeImpacts!==undefined && (!Array.isArray(values.excludeImpacts) || !values.excludeImpacts.every(id=>typeof id==="string")))throw new Error("excludeImpacts must contain impact IDs.");
  return values;
}

async function saveActivityConditions(group, entry, {startedAt, endedAt, date, coordinates, location}) {
  if(dry)return;
  const path=join(content,"activity-metadata.json");
  const metadata=await json(path,{schema:"activity-metadata-v0.1"});
  metadata[group] ||= {};
  const prior=metadata[group][entry.id];
  const input={...coordinates,startedAt,endedAt:endedAt || startedAt};
  const weather=process.env.CONTENT_WEATHER_OFFLINE==="1"
    ? prior?.weather || {status:"unavailable",reason:"Offline import"}
    : await lookupActivityWeather(input,{cached:prior?.weather});
  metadata[group][entry.id]={...prior,id:entry.id,label:entry.name || entry.label,
    sourceDate:startedAt || null,sourceEndDate:endedAt || null,
    localDate:date || startedAt?.slice(0,10) || null,location:location || "Not recorded",
    weather,tide:prior?.tide || {status:"unavailable"}};
  if(group==="archerySessions")metadata[group]=Object.fromEntries(Object.entries(metadata[group]).filter(([id])=>!id.startsWith("sample-")));
  await saveIfChanged(path,metadata);
}

console.log(`${dry?"Previewing":"Updating from"}: ${folder}`);
if(!dry)for(const kind of ["targets","cycling","sailing","videos","labs","about"])await mkdir(join(folder,kind),{recursive:true});
for(const kind of ["cycling","sailing"]) {
  if(only && only!==kind)continue;
  const directory=join(content,kind==="cycling"?"rides":"sails");
  const indexPath=join(directory,kind==="cycling"?"ride-index.json":"sail-index.json");
  const index=await json(indexPath,[]);
  const known=new Map();
  for(const entry of index) {
    const bytes=await readFile(join(directory,entry.file));
    known.set(entry.sourceHash || hash(bytes),entry);
    try{known.set(hash(inspectGpx(bytes.toString("utf8"),kind).xml),entry);}catch{ /* Preserve older published records as-is. */ }
  }
  for(const path of await files(join(folder,kind))) {
    if(extname(path).toLowerCase()!==".gpx")continue;
    try {
      if((await stat(path)).size>50*1024*1024)throw new Error("GPX exceeds 50 MB.");
      const bytes=await readFile(path),digest=hash(bytes);
      const track=inspectGpx(bytes.toString("utf8"),kind);
      const sidecar=await overrides(path);
      const eventDetails=kind==="sailing"?sailingEvent(sidecar,track):null;
      const region=regionForPoints(track.points,kind);
      if(kind==="sailing" && !region)throw new Error("Track falls outside the configured sailing maps.");
      const conditionInput={startedAt:track.date,endedAt:track.hasTiming?track.points.at(-1).time:null,
        coordinates:{latitude:track.points[0].lat,longitude:track.points[0].lon},location:sidecar.location || region?.label};
      const knownEntry=known.get(digest) || known.get(hash(track.xml));
      if(knownEntry){
        if(sidecar.media!==undefined)await importEventAttachments(kind+":"+knownEntry.id,sidecar.media,folder,content,{dry});
        const updated={...knownEntry,...(region?{regionId:region.id}:{}),
          ...(sidecar.name?{[kind==="sailing"?"label":"name"]:sidecar.name}:{}),
          ...(eventDetails?{eventDetails}:{})};
        const changed=JSON.stringify(updated)!==JSON.stringify(knownEntry);
        if(changed && !dry){Object.assign(knownEntry,updated);await atomicJson(indexPath,index);}
        await saveActivityConditions(kind==="cycling"?"rides":"sails",knownEntry,conditionInput);
        if(changed)added++;else skipped++;
        console.log(`  ${changed?(dry?"would update":"updated"):"unchanged"} ${kind}/${basename(path)}`);continue;
      }
      const id=`${kind}-${digest.slice(0,20)}`,file=kind==="sailing"?`${region.id}/${id}.gpx`:`${id}.gpx`;
      const name=sidecar.name || track.name || basename(path,extname(path));
      const entry={id,...(kind==="cycling"?{name}:{label:name}),file,sourceHash:digest,...(region?{regionId:region.id}:{}),...(track.date?{recordedAt:track.date}:{}),...(eventDetails?{eventDetails}:{})};
      if(!dry){await mkdir(kind==="sailing"?join(directory,region.id):directory,{recursive:true});await writeFile(join(directory,file),track.xml);index.push(entry);index.sort((a,b)=>(a.recordedAt||"").localeCompare(b.recordedAt||""));await atomicJson(indexPath,index);}
      await saveActivityConditions(kind==="cycling"?"rides":"sails",entry,conditionInput);
      if(sidecar.media!==undefined)await importEventAttachments(kind+":"+entry.id,sidecar.media,folder,content,{dry});
      known.set(digest,entry);known.set(hash(track.xml),entry);added++;
      console.log(`  ${dry?"would add":"added"} ${kind}/${basename(path)} (${track.points.length} positions)`);
    } catch(error){failed++;console.error(`  skipped ${basename(path)}: ${error.message}`);}
  }
}

const sessionIndexPath=join(content,"archery/session-index.json");
let sessions=await json(sessionIndexPath,[]);
for(const path of only && only!=="targets"?[]:await files(join(folder,"targets"))) {
  if(basename(path).endsWith(".json"))continue;
  if(![".jpg",".jpeg",".png",".webp"].includes(extname(path).toLowerCase())){failed++;console.error(`  skipped ${basename(path)}: export target photos as JPEG, PNG or WebP.`);continue;}
  try {
    if((await stat(path)).size>30*1024*1024)throw new Error("Photo exceeds 30 MB.");
    const sidecar=await overrides(path);
    if(dry){
      const id=`photo-${hash(await readFile(path)).slice(0,24)}`;
      const cached=await json(join(storeRoot,`${id}.json`),null);
      console.log(`  ${cached?.calibration?"cached extraction":"would request vision for"} target ${basename(path)}`);
      continue;
    }
    let {record}=await importPhoto(await readFile(path),{name:basename(path)});
    if(!record.calibration) {
      if(!process.env.OPENAI_API_KEY)throw new Error("Detection pending: set OPENAI_API_KEY in private/content.env, then rerun.");
      console.log(`  detecting ${basename(path)} with ${process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL}...`);
      const bytes=await readFile(join(storeRoot,`${record.id}.image`));
      const result=await detectImpacts(record,bytes,{apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL});
      record=await saveDetection(record.id,result,record.revision,process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL);
    }
    record={...record,date:sidecar.date || record.date,name:sidecar.name || (record.reviewState ? record.name : `Target ${sidecar.date || record.date || "undated"}`)};
    const exclude=new Set(sidecar.excludeImpacts || []);
    for(const id of exclude)if(![...record.marks,...record.excluded].some(mark=>mark.id===id))throw new Error(`Unknown excluded impact: ${id}`);
    record={...record,marks:record.marks.filter(mark=>!exclude.has(mark.id))};
    const session=publicSession(record);
    const sessionPath=join(content,"archery/sessions",`${record.id}.json`);
    const changed=await saveIfChanged(sessionPath,session);
    const entry={id:record.id,name:record.name,file:`sessions/${record.id}.json`,targetId:session.targetId,shotCount:record.marks.length};
    if(sidecar.media!==undefined)await importEventAttachments("archery:"+record.id,sidecar.media,folder,content,{dry});
    sessions=sessions.filter(s=>!s.id.startsWith("sample-")&&s.id!==record.id);
    sessions.push(entry);sessions.sort((a,b)=>a.id.localeCompare(b.id));
    await saveIfChanged(sessionIndexPath,sessions);
    let coordinates=sidecar.coordinates;
    if(!coordinates)try{coordinates=await exifr.gps(await readFile(path));}catch{}
    const capturedAt=sidecar.capturedAt || record.capturedAt;
    await saveActivityConditions("archerySessions",entry,{
      startedAt:capturedAt?.slice(0,10)===record.date?capturedAt:null,
      date:record.date,coordinates,location:sidecar.location
    });
    const count=record.marks.filter(mark=>mark.uncertain).length;flagged+=count;
    const review=await writeTargetReview(record,join(folder,"review"));
    reports.push({file:basename(path),review,impacts:record.marks.length,flagged:count});
    if(changed)added++;else skipped++;
    console.log(`  ${changed?"added":"unchanged"} target ${record.date}: ${record.marks.length} impact sites, ${count} flagged`);
  } catch(error){failed++;console.error(`  skipped ${basename(path)}: ${error.message}`);}
}
if(!dry && reports.length)await atomicJson(join(folder,"review/summary.json"),reports);
let videos=await json(join(content,"videos/video-index.json"),[]);
for(const path of only && only!=="videos"?[]:await files(join(folder,"videos"))) {
  if(path.endsWith(".json"))continue;
  if(![".mp4",".mov",".m4v",".webm"].includes(extname(path).toLowerCase())){failed++;console.error(`  skipped ${basename(path)}: use MP4, MOV, M4V, or WebM.`);continue;}
  try {
    console.log(`  inspecting video ${basename(path)}...`);
    const result=await importVideo(path,join(content,"videos"),videos,{dry,...(process.env.CONTENT_WEATHER_OFFLINE==="1"?{weatherLookup:null}:{})});
    videos=result.index || videos;
    if(result.changed)added++;else skipped++;
    console.log(`  ${result.changed?(dry?"would add":"added"):"unchanged"} video ${basename(path)}`);
  }catch(error){failed++;console.error(`  skipped ${basename(path)}: ${error.message}`);}
}
if(!only || only==="media"){
  try{const count=await importMediaManifest(folder,content,{dry});added+=count;console.log("Event media: "+count+" galleries updated");}
  catch(error){failed++;console.error("Event media: "+error.message);}
}
if(!only || ["labs","about"].includes(only)){
  try{added+=await importPages(folder,content,{only,dry});}
  catch(error){failed++;console.error("Pages: "+error.message);}
}
console.log(`\n${added} ${dry?"new":"added/updated"}, ${skipped} unchanged, ${failed} need attention; ${flagged} flagged impacts.`);
if(reports.length)console.log(`Photo reviews: ${join(folder,"review")}`);
console.log("No commit or deployment performed.");
if(failed)process.exitCode=1;
