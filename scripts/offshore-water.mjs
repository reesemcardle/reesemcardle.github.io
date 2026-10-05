import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {buffer} from "@turf/buffer";
import polygonClipping from "polygon-clipping";
import {buildSurface,coveragePolygon} from "./harbor-geometry.mjs";

export function extendOffshoreWater(land,reference,bounds){
  const coastGuard=buffer(reference,5,{units:"kilometers"});
  if(!coastGuard?.geometry)throw new Error("Invalid offshore reference geometry");
  const offshore=polygonClipping.difference(coveragePolygon(bounds),coastGuard.geometry.coordinates);
  // Only repair the offshore edge, preserving every isolated island from the detailed source.
  const islands=land.filter(([ring])=>!ring.some(([x,y])=>
    x===bounds.minLon || x===bounds.maxLon || y===bounds.minLat || y===bounds.maxLat));
  const coastal=polygonClipping.difference(land,offshore);
  const repaired=polygonClipping.union(coastal,islands);
  return {land:repaired,water:polygonClipping.difference(coveragePolygon(bounds),repaired)};
}

export async function offshoreReference(region,refresh=false){
  const path=new URL("../content/maps/"+region.id+"-offshore-reference.json",import.meta.url);
  if(refresh){
    const url="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson";
    const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error("Offshore reference HTTP "+response.status);
    const text=await response.text(),data=JSON.parse(text),b=region.bounds;
    const bounds={minLon:b.minLon-.2,maxLon:b.maxLon+.2,minLat:b.minLat-.2,maxLat:b.maxLat+.2};
    const {land}=buildSurface(data.features,bounds);
    if(!land.length)throw new Error("Empty offshore reference");
    await writeFile(path,JSON.stringify({type:"Feature",geometry:{type:"MultiPolygon",coordinates:land},properties:{
      url,bounds,coverage:b,retrieved:new Date().toISOString(),attribution:"Natural Earth 1:10m land, public domain",
      sourceSha256:createHash("sha256").update(text).digest("hex"),coastalGuardKilometers:5
    }})+"\n");
  }
  const reference=JSON.parse(await readFile(path,"utf8"));
  if(Object.keys(region.bounds).some(key=>reference.properties.coverage[key]!==region.bounds[key]))throw new Error("Refresh offshore reference for changed coverage");
  return reference;
}
