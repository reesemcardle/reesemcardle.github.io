import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {mapRegions} from '../scripts/map-regions.mjs';
const json=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));

test('public sailing maps and tracks are complete without private build inputs',async()=>{
  for(const region of mapRegions.sailing){
    const map=await json(region.webFile);
    assert.equal(map.format,'harbor-paths-v1');
    assert.ok(map.coverage.startsWith('M'));
    assert.deepEqual(map.layers.map(layer=>layer.id),['harborLand','harborWater','harborParks','harborRoads','harborPaths']);
    assert.ok(!JSON.stringify(map).includes('NaN'));
    assert.ok(map.layers.slice(0,2).every(layer=>layer.paths.length));
  }
  for(const sail of await json('content/sails/sail-index.json')){
    const track=await json('content/sails/'+sail.webFile);
    assert.equal(track.format,'sail-track-v1');
    assert.ok(track.points.length>=2);
    assert.ok(track.points.every(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon)));
  }
});
test('every published event media reference exists',async()=>{
  for(const items of Object.values(await json('content/media/event-index.json'))){
    for(const item of items)for(const path of [item.src,item.poster].filter(Boolean)){
      assert.ok(path.startsWith('content/'));
      await access(new URL('../'+path,import.meta.url));
    }
  }
});
