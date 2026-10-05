import {mkdir,copyFile,constants} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {fileURLToPath} from "node:url";
import {importPages} from "./content-pages.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const folder=process.env.WEBSITE_CONTENT_DIR || join(homedir(),"Website Content");
const labs=join(folder,"labs"),assets=join(root,"content/pages/assets"),vendor=join(root,"content/pages/vendor");
for(const path of [labs,assets,vendor])await mkdir(path,{recursive:true});
for(const file of ["a-city-in-miniature.md","a-city-in-miniature.md.json","six-values.md","six-values.md.json","six-values.html"]){
  try{await copyFile(join(root,"docs/editorial-seed",file),join(labs,file),constants.COPYFILE_EXCL);}
  catch(error){if(error.code!=="EEXIST")throw error;}
}
await copyFile(join(homedir(),"Downloads/Joe-Macken-nyc-model-tout-21326-d8d5dc18100141b9a2260cf7444e8de1.jpg"),join(assets,"city-model.jpg"));
await copyFile(join(root,"node_modules/chart.js/dist/chart.umd.js"),join(vendor,"chart.umd.js"));
await copyFile(join(root,"node_modules/chart.js/LICENSE.md"),join(vendor,"chart.js-LICENSE.md"));
console.log("Labs updated: "+await importPages(folder,join(root,"content"),{only:"labs"}));
