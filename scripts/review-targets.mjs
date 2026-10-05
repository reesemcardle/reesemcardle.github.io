import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { storeRoot, readRecord, updateRecord } from "./target-store.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.TARGET_REVIEW_PORT || 8016);
const assets = new Map([
  ["/", ["target-review.html", "text/html"]],
  ["/target-review.css", ["target-review.css", "text/css"]],
  ["/scripts/target-review.mjs", ["scripts/target-review.mjs", "text/javascript"]],
  ["/scripts/target-records.mjs", ["scripts/target-records.mjs", "text/javascript"]]
]);
let writes = Promise.resolve();
const json = (response, status, data) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(data)); };
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; object-src 'none'");
  const host = request.headers.host;
  if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(host)) return json(response,403,{error:"Local access only."});
  const origin = `http://${host}`;
  if (request.headers.origin && request.headers.origin !== origin) return json(response,403,{error:"Cross-origin access denied."});
  try {
    const url = new URL(request.url, origin);
    if (request.method === "GET" && assets.has(url.pathname)) {
      const [path,type] = assets.get(url.pathname); response.setHeader("Content-Type",type);response.end(await readFile(join(root,path)));return;
    }
    if (request.method === "GET" && url.pathname === "/api/targets") {
      await mkdir(storeRoot,{recursive:true});
      const ids=(await readdir(storeRoot)).filter(name=>/^photo-[a-f0-9]{24}\.json$/.test(name)).sort();
      const records=[];for(const id of ids)records.push(await readRecord(id.slice(0,-5)));
      return json(response,200,records);
    }
    const match=url.pathname.match(/^\/api\/targets\/(photo-[a-f0-9]{24})(\/image)?$/);
    if (!match) return json(response,404,{error:"Not found."});
    if (request.method === "GET") {
      const record=await readRecord(match[1]);
      if(match[2]){response.setHeader("Content-Type",record.mime);response.end(await readFile(join(storeRoot,`${record.id}.image`)));return;}
      return json(response,200,record);
    }
    if(request.method === "POST" && !match[2]) {
      if(request.headers.origin !== origin || request.headers["x-target-review"] !== "1")return json(response,403,{error:"Review-page request required."});
      const chunks=[];let size=0;
      for await (const chunk of request){size+=chunk.length;if(size>2*1024*1024)throw new Error("Review is too large.");chunks.push(chunk);}
      const edits=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const result=writes.then(()=>updateRecord(match[1],edits));writes=result.catch(()=>{});
      return json(response,200,await result);
    }
    return json(response,405,{error:"Method not allowed."});
  }catch(error){json(response,error.status || (error.code === "ENOENT" ? 404 : 400),{error:error.code === "ENOENT" ? "Target not found." : error.message});}
});
server.on("error",error=>{console.error(error.code === "EADDRINUSE" ? `Port ${port} is in use. Set TARGET_REVIEW_PORT to another port.` : error.message);process.exitCode=1;});
server.listen(port,"127.0.0.1",()=>console.log(`Target review: http://localhost:${port}/`));
