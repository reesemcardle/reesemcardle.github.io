import {readFile} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";
import {atomicJson} from "./target-store.mjs";
const root=process.env.WEBSITE_CONTENT_DIR || join(homedir(),"Website Content");
const manifestPath=join(root,"event-media.json");
let manifest={};
try{manifest=JSON.parse(await readFile(manifestPath,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
const rides=JSON.parse(await readFile(new URL("../content/rides/ride-index.json",import.meta.url)));
const sails=JSON.parse(await readFile(new URL("../content/sails/sail-index.json",import.meta.url)));
const sessions=JSON.parse(await readFile(new URL("../content/archery/session-index.json",import.meta.url)));
manifest["cycling:"+rides[0].id] ||= [
  {file:"placeholder image and video/bike.MOV",alt:"Cycling preview video",placeholder:true}
];
for(const region of new Set(sails.map(s=>s.regionId))){
  const sail=sails.find(s=>s.regionId===region);
  manifest["sailing:"+sail.id] ||= [
    {file:"placeholder image and video/sail.JPG",alt:"Sailing preview: rigging and the New York waterfront",placeholder:true},
    {file:"placeholder image and video/sail.MOV",alt:"Sailing preview video",placeholder:true}
  ];
}
manifest["archery:"+sessions[0].id] ||= [
  {file:"targets/2026-03-24-target.jpeg",alt:"Target photographed on March 24, 2026",placeholder:false}
];
await atomicJson(manifestPath,manifest);
console.log("Created media entries for "+Object.keys(manifest).length+" events");
