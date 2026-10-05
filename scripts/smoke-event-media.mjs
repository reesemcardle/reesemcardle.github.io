import {createRequire} from "node:module";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.HOME+"/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  for(const mode of ["cycling","sailing","archery"]){
    await page.goto("http://localhost:8015/?mode="+mode);
    await page.waitForFunction(mode=>mode==="cycling"
      ? document.querySelector("#eventMedia video").readyState>=1
      : document.querySelector("#eventMedia img").naturalWidth>0,mode);
    const panel=page.locator("#eventMedia");
    await panel.scrollIntoViewIfNeeded();
    assert.ok(await panel.isVisible());
    for(const selector of ["img","video"]){
      assert.equal(await panel.locator(selector).evaluate(el=>getComputedStyle(el).objectFit),"cover");
    }
    if(mode==="cycling"){
      assert.equal(await panel.locator(".event-media-count").textContent(),"1 / 1");
      assert.ok(!(await panel.locator("img").isVisible()));
      assert.ok(!(await panel.locator('[data-media-action="next"]').isVisible()));
    }
    await page.screenshot({path:"/tmp/event-media-"+mode+".png"});
    if(mode!=="archery"){
      if(mode==="sailing")await panel.locator('[data-media-action="next"]').click();
      const video=panel.locator("video");
      assert.ok(await video.evaluate(v=>v.paused&&!v.controls));
      await panel.locator('[data-media-action="play"]').click();
      await page.waitForFunction(()=>document.querySelector("#eventMedia video").currentTime>0);
      await panel.locator('[data-media-action="sound"]').click();
      assert.ok(await video.evaluate(v=>!v.muted));
      await page.locator('.side-nav [data-mode="video"]').click();
      assert.ok(await video.evaluate(v=>v.paused));
      assert.ok(!(await panel.isVisible()));
      await page.locator('.side-nav [data-mode="'+mode+'"]').click();
      await page.locator('[data-action="next"]').click();
      await page.locator('[data-action="next"]').click();
      assert.ok(await panel.locator(".event-media-empty").isVisible());
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto("http://localhost:8015/?mode="+mode);
    await page.locator(".menu-button").click();
    await panel.scrollIntoViewIfNeeded();
    assert.ok(await panel.isVisible());
    await page.waitForFunction(mode=>mode==="cycling"
      ? document.querySelector("#eventMedia video").readyState>=1
      : document.querySelector("#eventMedia img").naturalWidth>0,mode);
    const filled=await panel.evaluate(el=>{
      const frame=el.querySelector(".event-media-frame").getBoundingClientRect();
      const media=el.querySelector("img:not([hidden])") || el.querySelector("video");
      const rect=media.getBoundingClientRect();
      return Math.abs(frame.width-rect.width)<1 && Math.abs(frame.height-rect.height)<1;
    });
    assert.ok(filled,"media fills the frame on mobile");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight+1));
    await page.screenshot({path:"/tmp/event-media-"+mode+"-mobile.png"});
    await page.setViewportSize({width:1440,height:1000});
  }
  await page.goto("http://localhost:8015/?mode=video");
  await page.waitForFunction(()=>document.querySelector("#videoPlayer").currentTime>0);
  assert.deepEqual(errors,[]);
  console.log("ok event media: images, video controls, multiple items, empty state, mode pause, mobile details, real Scenes clip");
}finally{await browser.close();}
