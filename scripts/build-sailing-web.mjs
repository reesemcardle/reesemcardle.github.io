import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {DOMParser} from "@xmldom/xmldom";
import {compileHarborMap,harborProjection} from "./harbor-map.mjs";
import {mapRegions} from "./map-regions.mjs";

const defaultContent=fileURLToPath(new URL('../content/',import.meta.url));
async function save(path,value){
  const text=JSON.stringify(value)+'\n';
  try{if(await readFile(path,'utf8')===text)return;}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(path,text);
}
export async function buildSailingTracks(content=defaultContent){
  const directory=join(content,'sails'),indexPath=join(directory,'sail-index.json');
  let index;
  try{index=JSON.parse(await readFile(indexPath,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of index){
    const document=new DOMParser().parseFromString(await readFile(join(directory,entry.file),'utf8'),'application/xml');
    const points=Array.from(document.getElementsByTagNameNS('*','trkpt')).map(point=>[
      Number(point.getAttribute('lat')),Number(point.getAttribute('lon')),
      point.getElementsByTagNameNS('*','time')[0]?.textContent || null
    ]).filter(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon));
    const webFile=entry.file.replace(/\.gpx$/i,'.track.json');
    if(webFile===entry.file)throw new Error('Expected GPX source');
    await save(join(directory,webFile),{format:'sail-track-v1',points});
    entry.webFile=webFile;
  }
  await writeFile(indexPath,JSON.stringify(index,null,2)+'\n');
}
export async function buildSailingMaps(content=defaultContent){
  await mkdir(join(content,'maps'),{recursive:true});
  for(const region of mapRegions.sailing){
    const data=JSON.parse(await readFile(join(content,region.file.replace(/^content\//,'')),'utf8'));
    await save(join(content,'maps',region.id+'.paths.json'),compileHarborMap(data,harborProjection(region.bounds,region.rotation)));
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  await buildSailingMaps();
  await buildSailingTracks();
  console.log('Prepared sailing maps and tracks for the web.');
}
