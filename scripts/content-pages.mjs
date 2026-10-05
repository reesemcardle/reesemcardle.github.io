import {readFile,readdir,realpath} from "node:fs/promises";
import {join,basename,resolve,relative,sep} from "node:path";
import {marked,Renderer} from "marked";
import sanitizeHtml from "sanitize-html";
import {atomicJson} from "./target-store.mjs";

export function compileMarkdown(source){
  const headings=[],used=new Map();
  const renderer=new Renderer();
  renderer.heading=function({tokens,depth}){
    const text=this.parser.parseInline(tokens);
    const label=sanitizeHtml(text,{allowedTags:[],allowedAttributes:{}});
    const base=label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "section";
    const n=(used.get(base)||0)+1;used.set(base,n);
    const id="article-"+base+(n>1?"-"+n:"");
    if(depth<=3)headings.push({id,label,level:depth});
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };
  const html=sanitizeHtml(marked.parse(source,{gfm:true,renderer}),{
    allowedTags:sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes:{a:["href","title","rel"],img:["src","alt","title"],code:["class"],h1:["id"],h2:["id"],h3:["id"]},
    allowedSchemes:["https","http","mailto"],allowProtocolRelative:false,
    transformTags:{
      a:(_,attrs)=>({tagName:"a",attribs:{...attrs,rel:"noopener noreferrer"}})
    }
  });
  return {html,headings,minutes:Math.max(1,Math.ceil(source.split(/\s+/).length/220))};
}

async function json(path,fallback){try{return JSON.parse(await readFile(path,"utf8"));}catch(e){if(e.code==="ENOENT")return fallback;throw e;}}
async function save(path,data,dry){
  const text=JSON.stringify(data,null,2)+"\n";
  try{if(await readFile(path,"utf8")===text)return 0;}catch(e){if(e.code!=="ENOENT")throw e;}
  if(!dry)await atomicJson(path,data);
  return 1;
}
export async function importPages(folder,content,{only=null,dry=false}={}){
  let changed=0;
  if(!only || only==="labs"){
    const dir=join(folder,"labs");let entries;
    try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=="ENOENT")throw e;}
    if(entries){
      const articles=[];
      for(const entry of entries.filter(e=>e.isFile() && e.name.endsWith(".md")).sort((a,b)=>a.name.localeCompare(b.name))){
        const id=basename(entry.name,".md");
        if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))throw new Error("Labs filenames need lowercase words separated by hyphens: "+entry.name);
        const meta=await json(join(dir,entry.name+".json"),{});
        if(meta.draft===true)continue;
        const source=await readFile(join(dir,entry.name),"utf8");
        const title=meta.title || source.match(/^#\s+(.+)$/m)?.[1] || id;
        if(typeof title!=="string" || !["writing","experiment"].includes(meta.kind || "writing"))throw new Error("Invalid Labs title or kind: "+id);
        if(meta.date && (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date) || Number.isNaN(Date.parse(meta.date)) || new Date(meta.date).toISOString().slice(0,10)!==meta.date))throw new Error("Invalid Labs date: "+id);
        if(meta.tags && (!Array.isArray(meta.tags) || !meta.tags.every(t=>typeof t==="string")))throw new Error("Labs tags must be strings");
        const article={id,title,date:meta.date || null,kind:meta.kind || "writing",tags:meta.tags || [],summary:typeof meta.summary==="string"?meta.summary:"",...compileMarkdown(source)};
        if(meta.experiment){
          const root=await realpath(dir),path=await realpath(resolve(dir,meta.experiment)),local=relative(root,path);
          if(local.startsWith(".."+sep) || local===".." || !path.endsWith(".html"))throw new Error("Experiment must be an HTML file inside labs");
          article.experiment=await readFile(path,"utf8");
        }
        articles.push(article);
      }
      articles.sort((a,b)=>(b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title));
      changed+=await save(join(content,"pages/labs.json"),articles,dry);
    }
  }
  if(!only || only==="about"){
    let source;try{source=await readFile(join(folder,"about/about.md"),"utf8");}catch(e){if(e.code!=="ENOENT")throw e;}
    if(source!==undefined){
      const meta=await json(join(folder,"about/about.md.json"),{});
      if(meta.linkedin && !/^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/.test(meta.linkedin))throw new Error("Use a LinkedIn profile URL");
      if(meta.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(meta.email))throw new Error("Invalid public email alias");
      const profile={name:meta.name || "Reese McArdle",location:meta.location || "",linkedin:meta.linkedin || null,email:meta.email || null,...compileMarkdown(source)};
      changed+=await save(join(content,"pages/about.json"),profile,dry);
    }
  }
  return changed;
}
