export function matchImpacts(reference, predicted, tolerance = 20) {
  const candidates = predicted.map(p => reference.map((r,i)=>({i,d:Math.hypot(p.x-r.x,p.y-r.y)}))
    .filter(c=>c.d<=tolerance).sort((a,b)=>a.d-b.d));
  const owners = new Map();
  // Maximum-cardinality one-to-one matching; one detection cannot cover two holes.
  function assign(p, seen) {
    for (const {i} of candidates[p]) {
      if (seen.has(i)) continue;
      seen.add(i);
      if (!owners.has(i) || assign(owners.get(i),seen)) { owners.set(i,p); return true; }
    }
    return false;
  }
  predicted.forEach((_,i)=>assign(i,new Set()));
  const pairs=[...owners].map(([r,p])=>({reference:r,predicted:p,distance:Math.hypot(reference[r].x-predicted[p].x,reference[r].y-predicted[p].y)}));
  const used=new Set(pairs.map(p=>p.predicted));
  return {tolerance,matched:pairs.length,missed:reference.map((_,i)=>i).filter(i=>!owners.has(i)),extra:predicted.map((_,i)=>i).filter(i=>!used.has(i)),pairs};
}

export function targetTiles(record) {
  const [,cx,cy,rx,ry]=record.calibration.rings.at(-1);
  const left=Math.max(0,Math.floor(cx-rx*1.12)),right=Math.min(record.width,Math.ceil(cx+rx*1.12));
  const top=Math.max(0,Math.floor(cy-ry*1.12)),bottom=Math.min(record.height,Math.ceil(cy+ry*1.12));
  const mx=Math.round(cx),my=Math.round(cy),overlap=100;
  return [0,1].flatMap(row=>[0,1].map(col=>{
    const x=col?mx-overlap:left,y=row?my-overlap:top;
    return {id:`${row?'bottom':'top'}-${col?'right':'left'}`,left:x,top:y,width:(col?right:mx+overlap)-x,height:(row?bottom:my+overlap)-y,col,row,mx,my};
  }));
}

export function ownedImpacts(tile, impacts) {
  return impacts.map(p=>({...p,x:p.x+tile.left,y:p.y+tile.top,tile:tile.id}))
    .filter(p=>(tile.col?p.x>=tile.mx:p.x<tile.mx)&&(tile.row?p.y>=tile.my:p.y<tile.my));
}
