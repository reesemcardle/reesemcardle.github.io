import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {mapRegions} from "./map-regions.mjs";
import {buildSurface,surfaceFeatures} from "./harbor-geometry.mjs";
import {harborSvg} from "./harbor-map.mjs";
import {buildDetails,detailQuery} from "./regional-map-details.mjs";
import {extendOffshoreWater,offshoreReference} from "./offshore-water.mjs";

const sources={
  newport:{url:"https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer/1",
    where:"1=1",attribution:"U.S. Census Bureau, TIGERweb Areal Hydrography (public domain)"},
  "mahone-bay":{url:"https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_UT83/MapServer/8",
    where:"FEAT_DESC LIKE '%Water%'",
    attribution:"Province of Nova Scotia, Nova Scotia Topographic Database 1:10,000, Open Government Licence - Nova Scotia"}
};
async function query(url,params){
  const response=await fetch(url+"/query?"+new URLSearchParams(params),{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error("Map source HTTP "+response.status);
  const result=await response.json();
  if(result.error || result.exceededTransferLimit)throw new Error("Incomplete map source response: "+JSON.stringify(result.error || "transfer limit"));
  return result;
}
const selected=process.argv.find(arg=>arg.startsWith("--region="))?.split("=")[1];
if(selected && !sources[selected])throw new Error("Unknown regional map: "+selected);
for(const region of mapRegions.sailing.filter(r=>sources[r.id] && (!selected || selected===r.id))){
  const source=sources[region.id],b=region.bounds;
  const path=new URL("../content/maps/"+region.id+"-water-source.geojson",import.meta.url);
  if(process.argv.includes("--refresh-source")){
    const spatial={where:source.where,geometry:[b.minLon,b.minLat,b.maxLon,b.maxLat].join(","),
      geometryType:"esriGeometryEnvelope",inSR:4326,spatialRel:"esriSpatialRelIntersects"};
    const ids=await query(source.url,{...spatial,returnIdsOnly:true,f:"json"});
    if(!ids.objectIds?.length)throw new Error("No hydrography for "+region.id);
    const features=[];
    for(let i=0;i<ids.objectIds.length;i+=100){
      const page=await query(source.url,{objectIds:ids.objectIds.slice(i,i+100).join(","),
        outSR:4326,outFields:"*",returnZ:false,returnM:false,geometryPrecision:6,maxAllowableOffset:0.0001,f:"geojson"});
      features.push(...page.features);
    }
    if(features.length!==ids.objectIds.length)throw new Error("Incomplete feature count");
    const text=JSON.stringify({type:"FeatureCollection",features})+"\n";
    await writeFile(path,text);
    await writeFile(new URL("../content/maps/"+region.id+"-source.json",import.meta.url),JSON.stringify({
      ...source,bounds:b,query:spatial,retrieved:new Date().toISOString(),featureCount:features.length,
      geometryPrecision:6,maxAllowableOffset:0.0001,
      sha256:createHash("sha256").update(text).digest("hex")
    },null,2)+"\n");
  }
  const data=JSON.parse(await readFile(path,"utf8"));
  const provenance=JSON.parse(await readFile(new URL("../content/maps/"+region.id+"-source.json",import.meta.url),"utf8"));
  if(Object.keys(b).some(key=>b[key]!==provenance.bounds[key]))throw new Error("Coverage changed; refresh water source for "+region.id);
  if(data.type!=="FeatureCollection" || !data.features.length || data.exceededTransferLimit)throw new Error("Invalid hydrography snapshot");
  let {land:water,water:land}=buildSurface(data.features,region.bounds);
  if(region.id==="mahone-bay"){
    ({land,water}=extendOffshoreWater(land,await offshoreReference(region,process.argv.includes("--refresh-ocean-reference")),b));
  }
  const detailPath=new URL("../content/maps/"+region.id+"-details-source.json",import.meta.url);
  const detailBounds=region.detailBounds || b;
  if(process.argv.includes("--refresh-details")){
    const query=detailQuery(detailBounds);
    const url=process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
    let response;
    for(let attempt=0;attempt<3;attempt++){
      response=await fetch(url,{method:"POST",body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(240000)});
      if(response.ok || ![429,502,503,504].includes(response.status) || attempt===2)break;
      await response.body?.cancel();
      const delay=Math.max(30,Number(response.headers.get("retry-after")) || 0)*1000;
      console.log(region.label+": detail server busy; retrying in "+delay/1000+" seconds");
      await new Promise(resolve=>setTimeout(resolve,delay));
    }
    if(!response.ok)throw new Error("OSM HTTP "+response.status);
    const snapshot=await response.json();
    if(snapshot.remark || !snapshot.elements?.length)throw new Error("Incomplete OSM response: "+snapshot.remark);
    const text=JSON.stringify(snapshot)+"\n";
    await writeFile(detailPath,text);
    await writeFile(new URL("../content/maps/"+region.id+"-details-provenance.json",import.meta.url),JSON.stringify({
      url,query,bounds:detailBounds,retrieved:new Date().toISOString(),attribution:"OpenStreetMap contributors, ODbL 1.0",
      sha256:createHash("sha256").update(text).digest("hex")
    },null,2)+"\n");
    console.log(region.label+": saved "+snapshot.elements.length+" OSM elements");
  }
  const detailProvenance=JSON.parse(await readFile(new URL("../content/maps/"+region.id+"-details-provenance.json",import.meta.url),"utf8"));
  if(Object.keys(detailBounds).some(key=>detailBounds[key]!==detailProvenance.bounds[key]))throw new Error("Coverage changed; refresh details for "+region.id);
  const details=buildDetails(JSON.parse(await readFile(detailPath,"utf8")),land);
  const output={name:region.label,rotation:region.rotation,source:source.attribution+"; OpenStreetMap contributors (ODbL 1.0)"+(region.id==="mahone-bay"?"; Natural Earth offshore reference (public domain)":""),bounds:region.bounds,
    features:[...surfaceFeatures(land,"landmass"),...surfaceFeatures(water,"water"),...details].map(feature=>{
      if(!feature.rings)return feature;
      const {points,...rest}=feature;return rest;
    })};
  await writeFile(new URL("../"+region.file,import.meta.url),JSON.stringify(output)+"\n");
  await mkdir(new URL("../content/svg/",import.meta.url),{recursive:true});
  await writeFile(new URL("../content/svg/"+region.id+"-basemap.svg",import.meta.url),harborSvg(output));
  console.log(region.label+": "+land.length+" land polygons, "+water.length+" water polygons, "+details.length+" road/park features");
}
