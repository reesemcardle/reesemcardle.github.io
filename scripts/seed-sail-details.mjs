// One-time owner-provided fleet details. Existing editable values take precedence.
import {readFile,readdir} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {inspectGpx} from "./content-gpx.mjs";
import {sailingEvent} from "./sailing-event.mjs";
import {atomicJson} from "./target-store.mjs";

const defaults={
  Newport:{boat:{name:"American Eagle",sailNumber:"US-21",class:"12 Metre"},sailType:"race"},
  Mahone:{boat:{name:null,sailNumber:null,class:"J/30"},sailType:null},
  NY:{boat:{name:null,sailNumber:null,class:null},boatOptions:["J/80","J/24"],sailType:null,sailTypeOptions:["race","club"]}
};
const root=join(process.env.WEBSITE_CONTENT_DIR || join(homedir(),"Website Content"),"sailing");
for(const [folder,details] of Object.entries(defaults)){
  for(const file of await readdir(join(root,folder))){
    if(!/\.gpx$/i.test(file))continue;
    const path=join(root,folder,file);
    let existing={};
    try{existing=JSON.parse(await readFile(path+".json","utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
    const track=inspectGpx(await readFile(path,"utf8"),"sailing");
    const record={...details,event:null,notes:null,...existing};
    record.durationSeconds=sailingEvent(record,track).durationSeconds;
    await atomicJson(path+".json",record);
    console.log(folder+"/"+file+".json: "+record.durationSeconds+" seconds");
  }
}
