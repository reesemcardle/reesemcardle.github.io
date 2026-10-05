import {createVideoPlayer} from "./video-player.mjs";

export function createEventMedia(root){
  const image=root.querySelector("img"),video=root.querySelector("video");
  const empty=root.querySelector(".event-media-empty"),stage=root.querySelector(".event-media-video");
  const counter=root.querySelector(".event-media-count"),caption=root.querySelector(".event-media-caption");
  const badge=root.querySelector(".event-media-placeholder");
  const previous=root.querySelector('[data-media-action="previous"]'),next=root.querySelector('[data-media-action="next"]');
  const player=createVideoPlayer({player:video,empty:root.querySelector(".event-media-error"),
    controls:root.querySelector(".video-controls"),playButton:root.querySelector('[data-media-action="play"]'),
    soundButton:root.querySelector('[data-media-action="sound"]'),autoplay:false});
  let items=[],index=0,key=null,visible=true;
  function show(){
    const item=items[index];
    player.setActive(false);stage.hidden=item?.type!=="video";image.hidden=item?.type!=="image";
    empty.hidden=Boolean(item);badge.hidden=!item?.placeholder;
    counter.textContent=items.length?(index+1)+" / "+items.length:"";
    previous.hidden=next.hidden=items.length<2;
    image.removeAttribute("src");
    if(item?.type==="image"){image.src=item.src;image.alt=item.alt;}
    if(item?.type==="video"){video.setAttribute("aria-label",item.alt);player.setItems([item]);player.setActive(visible);}
    else player.setItems([]);
  }
  for(const [button,direction] of [[previous,-1],[next,1]])button.addEventListener("click",()=>{
    index=(index+direction+items.length)%items.length;show();
  });
  // Pause when the metadata panel closes or the gallery scrolls out of view.
  new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting && !root.hidden;
    player.setActive(visible && items[index]?.type==="video");
  }).observe(root);
  return {
    setEvent(eventKey,label,media=[]){
      caption.textContent=label || "";
      if(key===eventKey)return;
      key=eventKey;items=media;index=0;show();
    },
    setActive(active){root.hidden=!active;if(!active)player.setActive(false);}
  };
}
