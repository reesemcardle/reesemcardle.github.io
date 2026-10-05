import test from "node:test";
import assert from "node:assert/strict";
import {unprojectMapDelta} from "../scripts/map-camera.mjs";

test("pan and pointer zoom offsets invert combined rotation and tilt",()=>{
  for(const pitch of [0,35,68])for(const bearing of [-179,-90,0,32,90,179]){
    const point=unprojectMapDelta(73,-29,pitch,bearing);
    const angle=bearing*Math.PI/180;
    const x=point.x*Math.cos(angle)-point.y*Math.sin(angle);
    const y=(point.x*Math.sin(angle)+point.y*Math.cos(angle))*Math.cos(pitch*Math.PI/180);
    assert.ok(Math.abs(x-73)<1e-9);
    assert.ok(Math.abs(y+29)<1e-9);
  }
});
