import {readFile,realpath,stat,mkdir,access} from "node:fs/promises";
import {resolve,relative,join,extname,sep} from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {importVideo} from "./content-video.mjs";
import {atomicJson} from "./target-store.mjs";

async function json(path,fallback){try{return JSON.parse(await readFile(path,"utf8"));}catch(error){if(error.code==="ENOENT")return fallback;throw error;}}
export async function resolveMediaSource(folder,file){
  if(typeof file!=="string" || !file.trim())throw new Error("Media needs a source filename.");
  const root=await realpath(folder),path=await realpath(resolve(root,file));
  const local=relative(root,path);
  if(local===".." || local.startsWith(".."+sep) || resolve(root,local)!==path)throw new Error("Media must stay inside Website Content.");
  return path;
}
export async function importEventAttachments(key,items,folder,content,{dry=false}={}){
  if(!Array.isArray(items) || items.length>30)throw new Error("Event media must be an array of up to 30 items.");
  const directory=join(content,"media"),indexPath=join(directory,"event-index.json");
  const index=await json(indexPath,{}),attachments=[];
  let videos=await json(join(directory,"video-index.json"),[]);
  for(const item of items){
    if(!item || typeof item!=="object" || typeof item.alt!=="string" || item.alt.length>500)throw new Error("Media needs a file and short alt description.");
    // Older manifests listed a video's poster separately; prefer the actual video entry.
    if(item.posterOnly && items.some(other=>other?.file===item.file && !other.posterOnly))continue;
    const path=await resolveMediaSource(folder,item.file),extension=extname(path).toLowerCase();
    const video=[".mov",".mp4",".m4v",".webm"].includes(extension);
    if(!video && ![".jpg",".jpeg",".png",".webp"].includes(extension))throw new Error("Use JPEG, PNG, WebP, MOV, or MP4 for event media.");
    if(dry)continue;
    if(video){
      const imported=await importVideo(path,directory,videos,{weatherLookup:null});
      videos=imported.index || videos;
      const v=imported.entry;
      if(attachments.some(attachment=>attachment.type==="video" && attachment.id===v.id))continue;
      attachments.push({id:v.id,type:"video",src:"content/media/"+v.file,
        poster:"content/media/"+v.poster,width:v.width,height:v.height,hasAudio:v.hasAudio,
        alt:item.alt,placeholder:Boolean(item.placeholder)});
    }else{
      if((await stat(path)).size>50*1024*1024)throw new Error("Photo exceeds 50 MB.");
      const bytes=await readFile(path),id="image-"+createHash("sha256").update(bytes).digest("hex").slice(0,24);
      const file=id+".jpg",destination=join(directory,file);
      await mkdir(directory,{recursive:true});
      try{await access(destination);}catch{
        // Orientation is baked in; the public image contains no EXIF/GPS.
        await sharp(bytes).rotate().resize({width:1280,height:1280,fit:"inside",withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toFile(destination);
      }
      const info=await sharp(destination).metadata();
      attachments.push({id,type:"image",src:"content/media/"+file,width:info.width,height:info.height,alt:item.alt,placeholder:Boolean(item.placeholder)});
    }
  }
  if(dry)return false;
  if(JSON.stringify(index[key])===JSON.stringify(attachments))return false;
  index[key]=attachments;await atomicJson(indexPath,index);return true;
}
export async function importMediaManifest(folder,content,{dry=false}={}){
  const manifest=await json(join(folder,"event-media.json"),{});
  if(!manifest || typeof manifest!=="object" || Array.isArray(manifest))throw new Error("event-media.json must contain event keys and media arrays.");
  const valid=new Set();
  for(const [mode,path] of [["cycling","rides/ride-index.json"],["sailing","sails/sail-index.json"],["archery","archery/session-index.json"]]){
    for(const entry of await json(join(content,path),[]))valid.add(mode+":"+entry.id);
  }
  let changed=0;
  for(const [key,items] of Object.entries(manifest)){
    if(!valid.has(key))throw new Error("Unknown media event: "+key);
    if(await importEventAttachments(key,items,folder,content,{dry}))changed++;
  }
  return changed;
}
