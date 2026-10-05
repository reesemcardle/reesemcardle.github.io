import test from "node:test";
import assert from "node:assert/strict";
import {sailingEvent,formatSailDuration} from "../scripts/sailing-event.mjs";
const track={hasTiming:true,points:[{time:"2026-07-03T16:00:00Z"},{time:"2026-07-03T18:05:30Z"}]};
test("sail details preserve user classifications and derive elapsed duration from GPX",()=>{
  const event=sailingEvent({boat:{name:"American Eagle",sailNumber:"US-21",class:"12 Metre"},sailType:"race",durationSeconds:1},track);
  assert.equal(event.durationSeconds,7530);
  assert.equal(event.boat.name,"American Eagle");assert.equal(event.sailType,"race");
  assert.equal(formatSailDuration(event.durationSeconds),"2h 06m");
  const unknown=sailingEvent({boatOptions:["J/80","J/24"],sailTypeOptions:["race","club"]},track);
  assert.equal(unknown.boat.class,null);assert.equal(unknown.sailType,null);
  assert.deepEqual(unknown.boatOptions,["J/80","J/24"]);
  assert.equal(sailingEvent({}, {...track,hasTiming:false}).durationSeconds,null);
  assert.equal(formatSailDuration(null),"Not recorded");
  assert.throws(()=>sailingEvent({boat:"J30"},track),/Invalid sail boat/);
});
