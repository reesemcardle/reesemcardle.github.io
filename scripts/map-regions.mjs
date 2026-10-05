export const mapRegions = {
  sailing: [
    {id:"ny-harbor",label:"New York Harbor",folder:"NY",timeZone:"America/New_York",
      file:"content/maps/ny-harbor-osm.json",rotation:-29,
      bounds:{minLat:40.45,maxLat:40.95,minLon:-74.3,maxLon:-73.7}},
    {id:"newport",label:"Newport Harbor",folder:"Newport",timeZone:"America/New_York",
      file:"content/maps/newport.json",rotation:-29,
      detailBounds:{minLat:41.40,maxLat:41.75,minLon:-71.50,maxLon:-71.15},
      bounds:{minLat:41.20,maxLat:41.95,minLon:-72.00,maxLon:-70.70}},
    {id:"mahone-bay",label:"Mahone Bay",folder:"Mahone",timeZone:"America/Halifax",
      file:"content/maps/mahone-bay.json",rotation:-29,
      detailBounds:{minLat:44.23,maxLat:44.60,minLon:-64.50,maxLon:-64.02},
      bounds:{minLat:43.95,maxLat:44.85,minLon:-64.75,maxLon:-63.65}}
  ],
  cycling: [
    {id:"prospect-park",label:"Prospect Park, Brooklyn",timeZone:"America/New_York",
      bounds:{minLat:40.5,maxLat:40.9,minLon:-74.2,maxLon:-73.7}}
  ]
};

export function regionForPoints(points, activity="sailing") {
  const candidates=(mapRegions[activity] || []).map(region=>{
    const b=region.bounds;
    return {region,count:points.filter(p=>p.lat>=b.minLat && p.lat<=b.maxLat && p.lon>=b.minLon && p.lon<=b.maxLon).length};
  }).sort((a,b)=>b.count-a.count);
  // Don't silently assign long passages outside known map coverage.
  return candidates[0]?.count>=points.length*.95 && points.length ? candidates[0].region : null;
}

export function createRegionPicker(element,{regions,onSelect}) {
  function render(selected) {
    element.replaceChildren();
    regions.forEach((region,index)=>{
      if(index)element.append(document.createTextNode(", "));
      const button=document.createElement("button");
      button.type="button";button.textContent=region.label;
      button.className="region-link";
      button.dataset.region=region.id;
      button.setAttribute("aria-pressed",String(selected===region.id));
      button.addEventListener("click",()=>onSelect(region));
      element.append(button);
    });
  }
  return {render};
}
