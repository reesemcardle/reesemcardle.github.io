// Lucide icons, ISC license: https://lucide.dev/license
const icons = {
  play:'<polygon points="6 3 20 12 6 21 6 3"/>',
  pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  volume:'<polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  muted:'<polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"/><path d="m23 9-6 6m0-6 6 6"/>'
};
export function createVideoPlayer({player, empty, controls, playButton, soundButton, onSelect=()=>{}, autoplay=true}) {
  let items=[], index=0, active=false, resumeOnVisible=false;
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");
  const sync=()=>{
    const audio=Boolean(items[index]?.hasAudio);
    controls.hidden=!items.length || Boolean(player.error);
    soundButton.disabled=!audio;
    for(const [button,label,icon] of [
      [playButton,player.paused?"Play":"Pause",player.paused?"play":"pause"],
      [soundButton,!audio?"No audio":player.muted?"Sound on":"Sound off",player.muted?"muted":"volume"]
    ]){
      button.setAttribute("aria-label",label);button.title=label;
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[icon]+'</svg>';
    }
  };
  const play=(manual=false)=>{
    if(!active || !items.length || document.hidden || (!manual && (!autoplay || reduced.matches)))return;
    player.play().then(()=>{if(!active || document.hidden)player.pause();}).catch(()=>{});
  };
  function show(){
    const item=items[index];
    player.pause();player.muted=true;
    player.hidden=!item;empty.hidden=Boolean(item);empty.textContent="No scenes yet";
    if(item){player.poster=item.src?item.poster || "":`content/videos/${item.poster}`;player.src=item.src || `content/videos/${item.file}`;player.load();play();}
    sync();
    if(active)onSelect(item,index,items.length);
  }
  for(const event of ["play","pause","volumechange","loadedmetadata","error"])player.addEventListener(event,sync);
  playButton.addEventListener("click",()=>{if(player.paused)play(true);else player.pause();});
  soundButton.addEventListener("click",()=>{if(items[index]?.hasAudio)player.muted=!player.muted;});
  player.addEventListener("error",()=>{if(active){empty.hidden=false;empty.textContent="Scene unavailable";}});
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){resumeOnVisible=!player.paused;player.pause();}
    else if(resumeOnVisible){resumeOnVisible=false;play();}
  });
  reduced.addEventListener("change",()=>{if(reduced.matches)player.pause();});
  return {
    setItems(value){
      player.pause();items=value;index=0;
      if(player.getAttribute("src")){player.removeAttribute("src");player.removeAttribute("poster");player.load();}
      if(active)show();
    },
    setActive(value){
      active=value;
      if(!active){player.pause();return;}
      if(!player.getAttribute("src") && items.length)show();
      else{player.hidden=!items.length;empty.hidden=Boolean(items.length);sync();onSelect(items[index],index,items.length);play();}
    },
    next(direction){if(!active || !items.length)return;index=(index+direction+items.length)%items.length;show();},
    restart(){if(!active || !items.length)return;player.currentTime=0;play();}
  };
}

export function captureLabels(timestamp) {
  if(!timestamp)return {date:"Not recorded",time:"Not recorded"};
  // Preserve the capture's local wall-clock value and stated offset, not the viewer's timezone.
  const match=timestamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::[^Z+-]*)?(Z|[+-]\d{2}:?\d{2})$/);
  if(!match)return {date:"Not recorded",time:"Not recorded"};
  return {date:new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${match[1]}T12:00:00Z`)),time:`${match[2]} ${match[3]==="Z"?"UTC":match[3]}`};
}
