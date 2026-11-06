import test from 'node:test';
import assert from 'node:assert/strict';
import {matchImpacts,targetTiles,ownedImpacts} from '../scripts/target-comparison.mjs';
test('comparison matches one-to-one and uses augmenting paths',()=>{
 const r=[{x:0,y:0},{x:10,y:0}],p=[{x:4,y:0},{x:0,y:0}];
 assert.equal(matchImpacts(r,p,6).matched,2);
 assert.equal(matchImpacts(r,[{x:0,y:0}],20).matched,1);
 assert.equal(matchImpacts([],p).extra.length,2);
});
test('tile ownership maps local coordinates and keeps overlap exactly once',()=>{
 const tiles=targetTiles({width:1000,height:1000,calibration:{rings:[[1,500,500,400,400]]}});
 for(const point of [{x:500,y:500},{x:450,y:450},{x:550,y:450}]){
 const owned=tiles.flatMap(t=>ownedImpacts(t,[{x:point.x-t.left,y:point.y-t.top}]));
 assert.equal(owned.length,1);assert.equal(owned[0].x,point.x);assert.equal(owned[0].y,point.y);
 }
});
