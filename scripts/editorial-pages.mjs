const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const dateLabel=value=>value?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(value)):"";

export function createEditorialPages(root,sidebar){
  let serial=0,active=false;
  const cache=new Map();
  async function load(mode){
    if(!cache.has(mode))cache.set(mode,fetch(`content/pages/${mode}.json`).then(r=>{if(!r.ok)throw new Error("Unable to load page");return r.json();}).catch(e=>{cache.delete(mode);throw e;}));
    return cache.get(mode);
  }
  function sectionLinks(headings){
    if(!headings.length)return;
    sidebar.append(node("h3","On this page"));
    const nav=node("nav");nav.setAttribute("aria-label","Article sections");
    for(const heading of headings){
      const a=node("a");a.innerHTML=heading.label;a.href="#"+heading.id;
      a.addEventListener("click",e=>{
        e.preventDefault();const target=root.querySelector("#"+heading.id);target?.scrollIntoView({block:"start"});
        document.dispatchEvent(new Event("close-page-details"));
        target?.setAttribute("tabindex","-1");target?.focus({preventScroll:true});
      });nav.append(a);
    }
    sidebar.append(nav);
  }
  function articleView(article){
    const articleEl=node("article",undefined,"prose");articleEl.innerHTML=article.html;root.append(articleEl);
    if(article.experiment){
      const frame=node("iframe");frame.title=article.title;frame.className="lab-experiment";
      frame.setAttribute("sandbox","allow-scripts");frame.setAttribute("referrerpolicy","no-referrer");
      frame.srcdoc=article.experiment;root.append(frame);
    }
    sectionLinks(article.headings);
  }
  function row(label,value){if(!value)return;const line=node("dl",undefined,"editorial-fact");line.append(node("dt",label),node("dd",value));sidebar.append(line);}
  function labLink(article){
    const link=node("a",undefined,"lab-entry");link.href="?mode=labs&entry="+encodeURIComponent(article.id);
    link.append(node("span",[article.kind,dateLabel(article.date)].filter(Boolean).join(" / "),"lab-entry-meta"),node("h3",article.title));
    if(article.summary)link.append(node("p",article.summary));
    link.addEventListener("click",e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,"",link.href);show("labs");});return link;
  }
  async function show(mode){
    const request=++serial;active=true;root.hidden=sidebar.hidden=false;
    root.replaceChildren(node("p","Loading…","editorial-status"));sidebar.replaceChildren();root.scrollTop=0;
    try{
      const data=await load(mode);if(request!==serial || !active)return;
      root.replaceChildren();
      if(mode==="about"){
        root.append(node("h1",data.name,"profile-name"));
        if(data.location)root.append(node("p",data.location,"profile-location"));
        sidebar.append(node("h3","Profile"));row("Based in",data.location);
        const contact=node("nav");contact.setAttribute("aria-label","Contact");
        if(data.linkedin){const a=node("a","LinkedIn");a.href=data.linkedin;a.rel="noopener noreferrer";contact.append(a);}
        if(data.email){const a=node("a",data.email);a.href="mailto:"+data.email;contact.append(a);}
        sidebar.append(contact);articleView(data);
      }else{
        const id=new URLSearchParams(location.search).get("entry"),article=data.find(a=>a.id===id);
        sidebar.append(node("h3",article?"Entry":"Notebook"));
        if(article){
          const back=node("a","All entries","editorial-back");back.href="?mode=labs";
          back.addEventListener("click",e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,"",back.href);show("labs");});root.append(back);
          row("Type",article.kind);row("Published",dateLabel(article.date));row("Reading",article.minutes+" min");row("Topics",article.tags.join(", "));articleView(article);
          if(!article.headings.some(h=>h.level===1))root.querySelector("article").prepend(node("h1",article.title));
        }else{
          if(id)root.append(node("p","Entry not found.","editorial-status"));
          row("Entries",String(data.length));
          if(!data.length)root.append(node("p","No entries yet.","editorial-status"));
          else for(const entry of data)root.append(labLink(entry));
        }
      }
    }catch(e){if(request===serial)root.replaceChildren(node("p","This page could not be loaded. Please refresh to try again.","editorial-status"));}
  }
  return {show,hide(){active=false;serial++;root.hidden=sidebar.hidden=true;root.replaceChildren();sidebar.replaceChildren();}};
}
