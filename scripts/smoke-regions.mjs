import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const records=JSON.parse(await readFile(new URL("../content/sails/sail-index.json",import.meta.url)));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.HOME+"/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  async function assertCoverage(label){
    const covered=await page.evaluate(()=>{
      const svg=document.querySelector("#sailingVisual");
      const box=svg.viewBox.baseVal;
      const path=svg.querySelector("#harborCoverage path");
      return [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]]
        .every(([x,y])=>path.isPointInFill(new DOMPoint(x,y)));
    });
    assert.ok(covered,"map coverage at "+label);
  }
  await page.goto("http://localhost:8015/?mode=sailing");
  await page.waitForSelector("#sailGhosts path");
  for(const id of ["ny-harbor","newport","mahone-bay","ny-harbor"]){
    const count=records.filter(s=>s.regionId===id).length;
    await page.locator('[data-region="'+id+'"].region-link').click();
    await page.waitForFunction(id=>document.querySelector("#sailingVisual").dataset.region===id,id);
    assert.equal(await page.locator("#sailGhosts path").count(),count);
    assert.ok(await page.locator("#harborWater path").count()>0);
    assert.ok(await page.locator("#harborLand path").count()>0);
    if(id!=="ny-harbor"){
      assert.ok(await page.locator("#harborParks path").count()>0);
      assert.equal(await page.locator("#harborRoads path").count(),1,"roads are batched");
      await page.waitForTimeout(350);
      await assertCoverage(id+" home");
    }
    await page.locator('[data-action="all"]').click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#sailingVisual").getAttribute("data-camera"),"all");
    for(const [width,height] of [[1440,900],[2560,1440],[390,844],[320,844],[844,390]]){
      await page.setViewportSize({width,height});
      await page.waitForTimeout(350);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1),"viewport overflow "+id+" "+width);
      assert.ok(await page.locator('[data-region="'+id+'"].region-link').isVisible());
      if(id!=="ny-harbor")await assertCoverage(id+" all "+width+"x"+height);
      await page.screenshot({path:"/tmp/sailing-"+id+"-"+width+".png"});
      if(id!=="ny-harbor"){
        await page.locator("#sailingHome").click();
        await page.waitForTimeout(350);
        await assertCoverage(id+" home "+width+"x"+height);
        for(let index=0;index<count;index++){
          await page.locator('[data-action="next"]').click();
          await page.waitForTimeout(350);
          await assertCoverage(id+" sail "+index+" "+width+"x"+height);
        }
        await page.locator('[data-action="all"]').click();
        await page.waitForTimeout(350);
      }
    }
    await page.setViewportSize({width:1440,height:900});
    await page.locator('[data-action="next"]').click();
    await page.waitForSelector("#sailPath:not([hidden])");
    assert.equal(await page.locator("#sailingVisual").getAttribute("data-camera"),"sail");
    if(id!=="ny-harbor"){
      await page.waitForTimeout(350);
      await assertCoverage(id+" selected");
    }
    assert.ok(!(await page.locator("#equipmentValue").textContent()).includes("Sample"));
    const labels=await page.locator(".global-meta > div > span").allTextContents();
    assert.deepEqual(labels,["Location","Date","Start time","Avg wind","Starting tide","Ending tide","Weather","Avg. temp"]);
    assert.ok(await page.locator("#sailEventDetails").isVisible());
    assert.notEqual(await page.locator('[data-sail-field="duration"]').textContent(),"Not recorded");
    if(id==="newport"){
      assert.equal(await page.locator('[data-sail-field="boat"]').textContent(),"American Eagle (US-21)");
      assert.equal(await page.locator('[data-sail-field="class"]').textContent(),"12 Metre");
      assert.equal(await page.locator('[data-sail-field="type"]').textContent(),"Race");
    }
    if(id==="mahone-bay")assert.equal(await page.locator('[data-sail-field="boat"]').textContent(),"J/30");
    if(id==="ny-harbor"){
      assert.equal(await page.locator('[data-sail-field="boat"]').textContent(),"J/80 or J/24");
      assert.equal(await page.locator('[data-sail-field="type"]').textContent(),"Race or Club sail");
    }
  }
  await page.goto("http://localhost:8015/?mode=sailing&region=mahone-bay");
  await page.waitForSelector('#sailingVisual[data-region="mahone-bay"]');
  assert.equal(await page.locator("#sailGhosts path").count(),records.filter(s=>s.regionId==="mahone-bay").length);
  await page.locator('.side-nav [data-mode="cycling"]').click();
  assert.ok(!(await page.locator("#sailEventDetails").isVisible()));
  await page.locator('.side-nav [data-mode="sailing"]').click();
  assert.equal(await page.locator('.region-link[aria-pressed="true"]').textContent(),"Mahone Bay");
  assert.deepEqual(errors,[]);
  console.log("ok regions: isolated tracks, map switching, deep links, selection, desktop/mobile fit");
}finally{await browser.close();}
