import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {mapRegions,regionForPoints} from "../scripts/map-regions.mjs";
import {inspectGpx} from "../scripts/content-gpx.mjs";
import {harborProjection,harborSvg} from "../scripts/harbor-map.mjs";
import polygonClipping from "polygon-clipping";
import {coveragePolygon} from "../scripts/harbor-geometry.mjs";
import {buildDetails} from "../scripts/regional-map-details.mjs";
import {extendOffshoreWater} from "../scripts/offshore-water.mjs";

// Re-intersecting shared edges needs a sub-millimetre grid to avoid floating-point slivers.
const snap=value=>typeof value==="number" ? Number(value.toFixed(9)) : value.map(snap);
function polygonArea(polygons){
  return polygons.reduce((sum,polygon)=>sum+polygon.reduce((total,ring)=>{
    const [x,y]=ring[0];
    let area=0;
    for(let i=1;i<ring.length;i++)area+=(ring[i-1][0]-x)*(ring[i][1]-y)-(ring[i][0]-x)*(ring[i-1][1]-y);
    return total+Math.abs(area/2);
  },0),0);
}

test("region classification uses track coordinates and rejects unknown passages",()=>{
  for(const [lat,lon,id] of [[40.75,-74.01,"ny-harbor"],[41.56,-71.33,"newport"],[44.42,-64.24,"mahone-bay"]]){
    assert.equal(regionForPoints([{lat,lon}]).id,id);
  }
  assert.equal(regionForPoints([{lat:0,lon:0}]),null);
  assert.equal(regionForPoints([]),null);
});
test("real sailing index is partitioned by region and every route fits its source coverage",async()=>{
  const index=JSON.parse(await readFile(new URL("../content/sails/sail-index.json",import.meta.url)));
  assert.ok(index.length>0);
  for(const entry of index){
    assert.ok(!/sample/i.test(entry.label));
    const track=inspectGpx(await readFile(new URL("../content/sails/"+entry.file,import.meta.url),"utf8"),"sailing");
    const region=regionForPoints(track.points);
    assert.equal(region.id,entry.regionId);
    if(entry.recordedAt)assert.ok(track.hasTiming);
    const b=region.bounds;
    assert.ok(track.points.every(p=>p.lon>=b.minLon && p.lon<=b.maxLon && p.lat>=b.minLat && p.lat<=b.maxLat));
  }
});

for(const region of mapRegions.sailing.slice(1)){
  test(region.label+" surfaces preserve complete coverage without land/water overlap",async()=>{
    const map=JSON.parse(await readFile(new URL("../"+region.file,import.meta.url)));
    const land=map.features.filter(f=>f.kind==="landmass").map(f=>f.rings);
    const water=map.features.filter(f=>f.kind==="water").map(f=>f.rings);
    assert.deepEqual(polygonClipping.intersection(land,water),[]);
    assert.deepEqual(polygonClipping.xor(polygonClipping.union(land,water),coveragePolygon(region.bounds)),[]);
    assert.ok(water.some(polygon=>polygon.length>1),"islands are retained as holes");
    const parks=map.features.filter(f=>f.kind==="land").map(f=>f.rings);
    assert.ok(parks.length>0,"parks are present");
    const overlap=polygonClipping.intersection(snap(parks),snap(water));
    assert.ok(polygonArea(overlap)<1e-10,"parks do not fill water (less than one square metre of rounding tolerance across the whole map)");
    assert.ok(map.features.some(f=>f.kind==="street" && !f.closed),"roads remain unfilled lines");
    const source=JSON.parse(await readFile(new URL("../content/maps/"+region.id+"-source.json",import.meta.url)));
    assert.deepEqual(source.bounds,region.bounds);
    if(region.id==="mahone-bay"){
      const openOcean=coveragePolygon({minLon:-63.95,maxLon:-63.8,minLat:44.1,maxLat:44.2});
      assert.deepEqual(polygonClipping.intersection(land,openOcean),[],"offshore source boundary is not mistaken for land");
    }
  });
}
test("regional SVG export uses the same bounded projection as the renderer",async()=>{
  for(const region of mapRegions.sailing.slice(1)){
    const map=JSON.parse(await readFile(new URL("../"+region.file,import.meta.url)));
    assert.deepEqual(map.bounds,region.bounds);
    assert.ok(map.features.some(f=>f.kind==="landmass"));
    assert.ok(map.features.some(f=>f.kind==="water"));
    for(const feature of map.features)for(const ring of feature.rings || []){
      assert.deepEqual(ring[0],ring.at(-1));
    }
    const project=harborProjection(region.bounds,region.rotation);
    assert.ok(Number.isFinite(project(region.bounds.minLon,region.bounds.minLat).x));
    assert.ok(!harborSvg(map).includes("NaN"));
  }
});

test("offshore repair retains detailed islands absent from the coarse reference",()=>{
  const bounds={minLon:0,maxLon:1,minLat:0,maxLat:1};
  const mainland=coveragePolygon({minLon:0,maxLon:.25,minLat:0,maxLat:1});
  const falseOffshore=coveragePolygon({minLon:0,maxLon:1,minLat:0,maxLat:.2});
  const island=coveragePolygon({minLon:.7,maxLon:.71,minLat:.7,maxLat:.71});
  const land=polygonClipping.union(mainland,falseOffshore,island);
  const reference={type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:mainland}};
  const repaired=extendOffshoreWater(land,reference,bounds);
  assert.deepEqual(polygonClipping.difference(island,repaired.land),[]);
  assert.deepEqual(polygonClipping.difference(mainland,repaired.land),[]);
  assert.deepEqual(polygonClipping.intersection(repaired.land,coveragePolygon({minLon:.8,maxLon:.9,minLat:.05,maxLat:.1})),[]);
});

test("OSM details preserve multipolygon holes and discard open park outlines",()=>{
  const geom=points=>points.map(([lon,lat])=>({lon,lat}));
  const snapshot={elements:[
    {type:"relation",id:1,tags:{type:"multipolygon",leisure:"park"},members:[
      {type:"way",ref:10,role:"outer",geometry:geom([[0,0],[4,0],[4,4],[0,4],[0,0]])},
      {type:"way",ref:11,role:"inner",geometry:geom([[1,1],[2,1],[2,2],[1,2],[1,1]])}
    ]},
    {type:"way",id:2,tags:{leisure:"park"},geometry:geom([[0,0],[0,3],[3,3]])},
    {type:"way",id:3,tags:{highway:"secondary"},geometry:geom([[0,0],[3,3]])}
  ]};
  const land=[[[[0,0],[3,0],[3,4],[0,4],[0,0]]]];
  const details=buildDetails(snapshot,land);
  assert.equal(details.filter(f=>f.kind==="land").length,1);
  assert.equal(details.find(f=>f.kind==="land").rings.length,2);
  assert.ok(details.find(f=>f.kind==="land").rings.flat().every(([x])=>x<=3),"parks stop at the shoreline");
  assert.equal(details.find(f=>f.kind==="street").closed,false);
  assert.throws(()=>buildDetails({remark:"runtime error",elements:[]},land),/Incomplete/);
});
