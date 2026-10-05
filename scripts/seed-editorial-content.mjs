import {mkdir,copyFile,constants} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {importPages} from "./content-pages.mjs";
const folder=process.env.WEBSITE_CONTENT_DIR || join(homedir(),"Website Content");
for(const kind of ["labs","about"])await mkdir(join(folder,kind),{recursive:true});
for(const name of ["about.md","about.md.json"]){
  try{await copyFile(new URL("../docs/editorial-seed/"+name,import.meta.url),join(folder,"about",name),constants.COPYFILE_EXCL);}
  catch(e){if(e.code!=="EEXIST")throw e;}
}
console.log("Pages updated: "+await importPages(folder,new URL("../content",import.meta.url).pathname));
