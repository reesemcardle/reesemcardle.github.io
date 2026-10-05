import { readFile } from "node:fs/promises";
import { importPhoto, readRecord, updateRecord } from "./target-store.mjs";

const [photoOrId, observationsPath, widthArg, heightArg] = process.argv.slice(2);
if (!photoOrId || !observationsPath) throw new Error("Usage: node scripts/import-target-extraction.mjs <photo-path|photo-id> <observations.json> [photo-width photo-height]");
const observations = JSON.parse(await readFile(observationsPath,"utf8"));
const record = photoOrId.startsWith("photo-")
  ? await readRecord(photoOrId)
  : (await importPhoto(await readFile(photoOrId),{name:photoOrId.split("/").at(-1),width:Number(widthArg),height:Number(heightArg)})).record;
const scaleX=record.width/observations.coordinateFrame.width, scaleY=record.height/observations.coordinateFrame.height;
const scalePoint=([x,y])=>[x*scaleX,y*scaleY];
record.name = `Target ${record.date || "undated"}`;
record.calibration={center:scalePoint(observations.center),rings:observations.ringEllipses.map(([r,x,y,rx,ry])=>[r,x*scaleX,y*scaleY,rx*scaleX,ry*scaleY])};
record.marks=observations.marks.map(([x,y,note],i)=>({id:`impact-${i+1}`,x:x*scaleX,y:y*scaleY,uncertain:Boolean(note),note:note||""}));
record.excluded=observations.excluded.map(({x,y,reason},i)=>({id:`pin-${i+1}`,x:x*scaleX,y:y*scaleY,uncertain:false,note:reason}));
const saved=await updateRecord(record.id,record);
console.log(JSON.stringify({id:saved.id,status:saved.status,marks:saved.marks.length,flagged:saved.marks.filter(m=>m.uncertain).length},null,2));
