import {existsSync} from "node:fs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DOMParser} from '@xmldom/xmldom';
import {mapRegions} from '../scripts/map-regions.mjs';
import {compileHarborMap,harborProjection} from '../scripts/harbor-map.mjs';
import {prepareSail} from '../scripts/sail-data.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('prepared maps preserve every rendered path and coverage boundary',{skip:!existsSync(new URL('../private/build/maps/ny-harbor-osm.json',import.meta.url))},async()=>{
  for(const region of mapRegions.sailing){
    const source=JSON.parse(await read(region.file));
    const prepared=JSON.parse(await read(region.webFile));
    assert.deepEqual(prepared,compileHarborMap(source,harborProjection(region.bounds,region.rotation)),region.id);
  }
});
test('prepared tracks preserve every coordinate, timestamp and sailing statistic',{skip:!existsSync(new URL('../private/build/sails/',import.meta.url))},async()=>{
  const index=JSON.parse(await read('content/sails/sail-index.json'));
  for(const entry of index){
    const xml=new DOMParser().parseFromString(await read('private/build/sails/'+entry.file),'application/xml');
    const original=Array.from(xml.getElementsByTagNameNS('*','trkpt')).map(p=>({
      lat:Number(p.getAttribute('lat')),lon:Number(p.getAttribute('lon')),time:p.getElementsByTagNameNS('*','time')[0]?.textContent || null
    })).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
    const packed=JSON.parse(await read('content/sails/'+entry.webFile));
    const restored=packed.points.map(([lat,lon,time])=>({lat,lon,time}));
    assert.deepEqual(restored,original,entry.id);
    assert.deepEqual(prepareSail(restored),prepareSail(original),entry.id);
  }
});
