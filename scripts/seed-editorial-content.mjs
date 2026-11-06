import {contentFolder} from "./content-paths.mjs";
import {mkdir,copyFile,constants} from "node:fs/promises";
import {join} from "node:path";
import {importPages} from "./content-pages.mjs";
const folder=contentFolder();
for(const kind of ["labs","about"])await mkdir(join(folder,kind),{recursive:true});
for(const name of ["about.md","about.md.json"]){
  try{await copyFile(new URL("../private/archive/public-cleanup/docs/editorial-seed/"+name,import.meta.url),join(folder,"about",name),constants.COPYFILE_EXCL);}
  catch(e){if(e.code!=="EEXIST")throw e;}
}
console.log("Pages updated: "+await importPages(folder,new URL("../content",import.meta.url).pathname));
