import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import sharp from "sharp";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`); }
const cache = await mkdtemp(join(tmpdir(), "target-review-test-"));
const id = `photo-${"a".repeat(24)}`;
const record = { id, digest: "a".repeat(64), name: "Review fixture", date: "2026-03-24", width: 700, height: 900, mime: "image/jpeg", status: "review", revision: 1,
  calibration: { center: [350,450], rings: [[1,350,450,300,300]] },
  marks: [ {id:"impact-1",x:330,y:430,uncertain:true,note:"Merged tear"}, {id:"impact-2",x:400,y:500,uncertain:true,note:"Possible tear"}, {id:"impact-3",x:500,y:530,uncertain:false,note:""} ],
  excluded: [{id:"pin-1",x:60,y:70,uncertain:false,note:"Hanging pin"}]
};
const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="900"><rect width="700" height="900" fill="#eee"/><circle cx="350" cy="450" r="300" fill="white" stroke="black"/><circle cx="350" cy="450" r="240" fill="#333"/><circle cx="350" cy="450" r="180" fill="#37a4d2"/><circle cx="350" cy="450" r="120" fill="#ef4f40"/><circle cx="350" cy="450" r="60" fill="#f6d838"/>${[...record.marks,...record.excluded].map(m=>`<circle cx="${m.x}" cy="${m.y}" r="4" fill="black"/>`).join("")}</svg>`)).jpeg().toBuffer();
await writeFile(join(cache,`${id}.image`),image);await writeFile(join(cache,`${id}.json`),JSON.stringify(record));
const port=8126, origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[resolve("scripts/review-targets.mjs")],{env:{...process.env,TARGET_STORE:cache,TARGET_REVIEW_PORT:String(port)},stdio:["ignore","pipe","pipe"]});
let browser;
try {
  await new Promise((resolveReady,reject)=>{const timeout=setTimeout(()=>reject(new Error("Server startup timed out")),10000);server.stdout.once("data",()=>{clearTimeout(timeout);resolveReady();});server.once("exit",code=>{clearTimeout(timeout);reject(new Error(`Server exited ${code}`));});});
  browser=await playwright.chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(origin);await page.waitForSelector('.marker[data-id="impact-1"]');
  await page.locator("#markFeedback").fill("This is two arrows, same opening.");
  await page.locator("#observedCount").fill("2");
  await page.locator("#targetFeedback").fill("Please revise the merged tears.");
  await page.locator("#reviewState").selectOption("ready");
  await page.locator("#save").click();await page.waitForFunction(()=>document.getElementById("saveStatus").textContent.includes("ready for revision"));
  await page.reload();await page.waitForSelector('.marker[data-id="impact-1"]');
  assert.equal(await page.locator("#markFeedback").inputValue(),"This is two arrows, same opening.");
  assert.equal(await page.locator("#observedCount").inputValue(),"2");
  assert.equal(await page.locator("#reviewState").inputValue(),"ready");
  await page.locator("#confirm").click();assert.match(await page.locator("#counts").textContent(),/1 flagged/);
  await page.locator("#exclude").click();assert.match(await page.locator("#counts").textContent(),/2 sites/);
  await page.locator("#exclude").click();assert.match(await page.locator("#counts").textContent(),/3 sites/);
  await page.getByLabel("Select mark 2",{exact:true}).check();
  await page.locator("#merge").click();assert.match(await page.locator("#counts").textContent(),/2 sites/);
  await page.locator("#undo").click();assert.match(await page.locator("#counts").textContent(),/3 sites/);
  await page.locator("#markList button").filter({hasText:/^Mark 1$/}).click();
  const marker=await page.locator('.marker[data-id="impact-1"] circle').boundingBox();
  await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2);await page.mouse.down();await page.mouse.move(marker.x+30,marker.y+30,{steps:3});await page.mouse.up();
  await page.locator("#split").click();
  const photo=await page.locator("#photo").boundingBox();await page.mouse.click(photo.x+photo.width/2+40,photo.y+photo.height/2);
  assert.match(await page.locator("#counts").textContent(),/4 sites/);
  await page.locator("#save").click();await page.waitForFunction(()=>document.getElementById("save").disabled);
  const saved=JSON.parse(await readFile(join(cache,`${id}.json`),"utf8"));
  assert.equal(saved.marks.length,4);assert.equal(saved.marks.find(mark=>mark.id==="impact-1").observedCount,1);assert.notEqual(saved.marks.find(mark=>mark.id==="impact-1").x,330);
  assert.equal(saved.reviewFeedback,"Please revise the merged tears.");
  // A stale tab must not overwrite feedback from a newer save.
  const stale=await page.evaluate(async ({id,record})=>{const response=await fetch(`/api/targets/${id}`,{method:"POST",headers:{"Content-Type":"application/json","X-Target-Review":"1"},body:JSON.stringify(record)});return response.status;},{id,record});assert.equal(stale,409);
  const cross=await fetch(`${origin}/api/targets/${id}`,{method:"POST",headers:{Origin:"http://untrusted.example","X-Target-Review":"1"},body:JSON.stringify(saved)});assert.equal(cross.status,403);
  assert.equal((await fetch(`${origin}/private/content.env`)).status,404);
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`/tmp/target-editor-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log("ok target review: persisted feedback, count, corrections, merge/split, drag, undo, conflicts, privacy, responsive layouts");
} finally {
  if(browser)await browser.close();
  const closed=new Promise(resolveClosed=>server.once("exit",resolveClosed));server.kill();await closed;
}
