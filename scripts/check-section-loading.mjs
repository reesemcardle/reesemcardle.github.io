import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function checkSectionLoading(browser,baseUrl){
  const ready=page=>page.waitForFunction(()=>document.querySelector('.instrument').getAttribute('aria-busy')==='false');
  for(const mode of ['video','cycling','sailing','archery','labs','about']){
    const page=await browser.newPage();
    const requests=[],errors=[];
    page.on('request',r=>{if(r.url().includes('/content/'))requests.push(r.url());});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${baseUrl}/?mode=${mode}`);
    await ready(page);
    assert.equal(await page.locator('.visual-wrap').getAttribute('data-mode'),mode);
    const unrelated={video:['maps','rides','sails','archery','pages'],cycling:['sails','archery','pages','videos'],sailing:['rides','archery','pages','videos'],archery:['maps','rides','sails','pages','videos'],labs:['maps','rides','sails','archery','videos'],about:['maps','rides','sails','archery','videos']}[mode];
    assert.deepEqual(requests.filter(url=>unrelated.some(folder=>url.includes(`/content/${folder}/`))),[],`${mode} requested unrelated content`);
    assert.deepEqual(errors,[]);
    await page.close();
  }

  const page=await browser.newPage();
  try{
    await page.goto(baseUrl);
    await ready(page);
    const nav=mode=>page.locator(`.side-nav [data-mode="${mode}"]`).click();
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    let requested;
    const started=new Promise(resolve=>{requested=resolve;});
    await page.route('**/content/archery/session-index.json',async route=>{requested();await gate;await route.continue();});
    await nav('archery');
    await started;
    assert.equal(await page.locator('#activityTitle').textContent(),'Scenes');
    assert.equal(await page.locator('#videoVisual').isVisible(),true);
    assert.equal(await page.locator('.visual-wrap').evaluate(el=>getComputedStyle(el).visibility),'visible');
    // A newer navigation must win, even when an older request finishes later.
    await nav('labs');
    await ready(page);
    const sessions=JSON.parse(await readFile(new URL('../content/archery/session-index.json',import.meta.url),'utf8'));
    const finished=Promise.all(sessions.map(session=>page.waitForResponse(response=>response.url().endsWith(`/content/archery/${session.file}`)).then(response=>response.finished())));
    release();
    await finished;
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#activityTitle').textContent(),'Labs');
    await nav('archery');
    await ready(page);
    assert.ok(await page.locator('#archeryShots circle').count()>0);
    const cachedRequests=[];
    page.on('request',r=>{if(r.url().includes('/content/archery/'))cachedRequests.push(r.url());});
    await nav('video');await ready(page);
    await nav('archery');await ready(page);
    assert.deepEqual(cachedRequests,[],'Returning to archery should reuse loaded content');
    // A failed destination must preserve the current view and permit retry.
    await page.route('**/content/pages/about.json',route=>route.fulfill({status:503,body:'Unavailable'}));
    await nav('about');await ready(page);
    assert.equal(await page.locator('#archeryVisual').isVisible(),true);
    assert.match(await page.locator('#navigationStatus').textContent(),/Unable to load About/);
    await page.unroute('**/content/pages/about.json');
    await nav('about');await ready(page);
    assert.equal(await page.locator('#activityTitle').textContent(),'About');
    assert.equal(await page.locator('#editorialReader').isVisible(),true);
  }finally{await page.close();}
  console.log('ok independent loading, retained view, navigation races, caching and retry');
}
