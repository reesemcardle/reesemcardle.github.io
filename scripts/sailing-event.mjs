export function sailingEvent(sidecar, track) {
  const text=(value,label)=>{
    if(value==null)return null;
    if(typeof value!=="string" || value.length>2000)throw new Error("Invalid sail "+label);
    return value.trim() || null;
  };
  const choices=(value,label)=>{
    if(value==null)return [];
    if(!Array.isArray(value) || value.length>10)throw new Error("Invalid sail "+label);
    return [...new Set(value.map(v=>text(v,label)).filter(Boolean))];
  };
  if(sidecar.boat!=null && (typeof sidecar.boat!=="object" || Array.isArray(sidecar.boat)))throw new Error("Invalid sail boat");
  const boat=sidecar.boat || {};
  return {
    durationSeconds:track.hasTiming?(Date.parse(track.points.at(-1).time)-Date.parse(track.points[0].time))/1000:null,
    boat:{name:text(boat.name,"boat name"),sailNumber:text(boat.sailNumber,"sail number"),class:text(boat.class,"boat class")},
    boatOptions:choices(sidecar.boatOptions,"boat options"),
    sailType:text(sidecar.sailType,"type"),
    sailTypeOptions:choices(sidecar.sailTypeOptions,"type options"),
    event:text(sidecar.event,"event"),
    notes:text(sidecar.notes,"notes")
  };
}

export function formatSailDuration(seconds) {
  if(!Number.isFinite(seconds) || seconds<0)return "Not recorded";
  const minutes=Math.round(seconds/60);
  if(!minutes && seconds>0)return "<1 min";
  return minutes>=60?Math.floor(minutes/60)+"h "+String(minutes%60).padStart(2,"0")+"m":minutes+" min";
}

export function createSailingEventDetails(root) {
  const labels={race:"Race",club:"Club sail",cruise:"Cruise",practice:"Practice"};
  const field=(key,value)=>{root.querySelector('[data-sail-field="'+key+'"]').textContent=value;};
  const common=values=>{
    const unique=[...new Set(values)];
    return unique.length===1?unique[0]:unique.length?"Mixed":"Not recorded";
  };
  return {render(sails,selected){
    const events=(selected?[selected]:sails).map(s=>s.eventDetails || {});
    root.querySelector("h3").textContent=selected?"Sail details":"Fleet details";
    field("durationLabel",selected?"Duration":"Total duration");
    const durations=events.map(e=>e.durationSeconds);
    field("duration",durations.length && durations.every(Number.isFinite)?formatSailDuration(durations.reduce((a,b)=>a+b,0)):"Not recorded");
    field("boat",common(events.map(e=>e.boat?.name ? e.boat.name+(e.boat.sailNumber?" ("+e.boat.sailNumber+")":"") : e.boat?.class || e.boatOptions?.join(" or ") || "Not recorded")));
    field("class",common(events.map(e=>e.boat?.class || e.boatOptions?.join(" or ") || "Not recorded")));
    root.querySelector('[data-sail-field="class"]').parentElement.hidden=!events.some(e=>e.boat?.name && e.boat?.class);
    field("type",common(events.map(e=>e.sailType ? labels[e.sailType] || e.sailType : e.sailTypeOptions?.map(t=>labels[t] || t).join(" or ") || "Not recorded")));
    for(const key of ["event","notes"]){
      const value=selected?.eventDetails?.[key];
      const node=root.querySelector('[data-sail-field="'+key+'"]');
      node.textContent=value || "";node.parentElement.hidden=!value;
    }
  }};
}
