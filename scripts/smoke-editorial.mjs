import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {compileMarkdown} from "./content-pages.mjs";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.HOME+"/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try{
  const page=await browser.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  for(const mode of ["about","labs"]){
    for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
      await page.setViewportSize({width,height});await page.goto("http://localhost:8015/?mode="+mode);
      await page.waitForSelector("body.editorial-mode");
      await page.waitForFunction(()=>!document.querySelector("#editorialReader").textContent.includes("Loading"));
      assert.ok(await page.locator("#editorialReader").isVisible());
      assert.ok(!(await page.locator(".trace-controls").isVisible()));
      assert.ok(!(await page.locator(".global-meta").isVisible()));
      assert.equal(await page.locator('#editorialSidebar a[href^="mailto:"]').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight+1));
      if(width<980){
        assert.equal(await page.locator(".mobile-nav [data-mode]").count(),6);
        await page.locator(".menu-button").click();
        assert.ok(await page.locator("#editorialSidebar").isVisible());
        await page.keyboard.press("Escape");
      }
      await page.screenshot({path:`/tmp/${mode}-${width}.png`});
    }
  }
  const article={id:"fixture",title:"Test notebook",kind:"experiment",date:"2026-10-05",tags:["Maps"],summary:"An experiment",...compileMarkdown("# Test notebook\n\n"+"A paragraph of test content.\n\n".repeat(20)+"## Results\n\n```js\nconst result = 1;\n```"),experiment:'<!doctype html><button onclick="this.textContent=\'Running\'">Run</button><script>try{parent.document.body.dataset.escaped="yes"}catch(e){}</script>'};
  await page.route("**/content/pages/labs.json",route=>route.fulfill({json:[article]}));
  await page.setViewportSize({width:1440,height:900});await page.goto("http://localhost:8015/?mode=labs");
  await page.locator(".lab-entry").click();await page.waitForSelector(".prose h1");
  assert.ok(page.url().includes("entry=fixture"));
  await page.locator('#editorialSidebar a[href="#article-results"]').click();
  await page.waitForFunction(()=>document.querySelector("#editorialReader").scrollTop>0);
  assert.equal(await page.locator(".lab-experiment").getAttribute("sandbox"),"allow-scripts");
  await page.frameLocator(".lab-experiment").getByRole("button",{name:"Run",exact:true}).click();
  assert.equal(await page.frameLocator(".lab-experiment").getByRole("button").textContent(),"Running");
  assert.equal(await page.locator("body").getAttribute("data-escaped"),null);
  await page.goBack();await page.waitForSelector(".lab-entry");
  await page.goForward();await page.waitForSelector(".prose h1");
  await page.locator('.side-nav [data-mode="cycling"]').click();await page.waitForSelector("#cyclingVisual:visible");
  assert.ok(!(await page.locator("#editorialReader").isVisible()));
  assert.ok(await page.locator(".trace-controls").isVisible());
  assert.deepEqual(errors,[]);console.log("ok editorial: responsive navigation, About, Labs, deep links, history, sections, sandbox and activity return");
}finally{await browser.close();}
