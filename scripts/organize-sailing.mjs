import {readdir,readFile,mkdir,rename,stat} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {inspectGpx} from "./content-gpx.mjs";
import {regionForPoints} from "./map-regions.mjs";

const root=process.env.WEBSITE_CONTENT_DIR || join(homedir(),"Website Content");
const folder=join(root,"sailing"),apply=process.argv.includes("--apply");
for(const file of await readdir(folder,{withFileTypes:true})){
  if(!file.isFile() || !/\.gpx$/i.test(file.name))continue;
  const source=join(folder,file.name);
  const region=regionForPoints(inspectGpx(await readFile(source,"utf8"),"sailing").points);
  if(!region){console.log("Unclassified: "+file.name);continue;}
  const target=join(folder,region.folder,file.name);
  // Refuse collisions, including associated metadata, before moving either file.
  for(const suffix of ["",".json"]){
    try{await stat(target+suffix);throw new Error("Destination already exists: "+target+suffix);}
    catch(error){if(error.code!=="ENOENT")throw error;}
  }
  if(apply){
    await mkdir(join(folder,region.folder),{recursive:true});
    await rename(source,target);
    try{await rename(source+".json",target+".json");}catch(error){if(error.code!=="ENOENT")throw error;}
  }
  console.log((apply?"Moved ":"Would move ")+file.name+" -> "+region.folder);
}
