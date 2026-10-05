import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const port = 8012;
const baseUrl = `http://127.0.0.1:${port}`;
const rootDir = resolve(".");
const archeryIndex = JSON.parse(await readFile("content/archery/session-index.json", "utf8"));
const archeryRecords = await Promise.all(archeryIndex.map(async entry => JSON.parse(await readFile(`content/archery/${entry.file}`, "utf8"))));
const archeryCount = archeryRecords.reduce((sum, session) => sum + session.ends.reduce((n,end)=>n+end.shots.length,0),0);
const photoArchery = archeryRecords.every(session => session.source?.type === "target-photo");

const playwright = loadPlaywright();
const server = await ensureServer();

try {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const pages = [
    {
      path: "/",
      name: "cycling",
      checks: [
        async (page) => assertTextIncludes(page, "h1", "Reese"),
        async (page) => assertAttribute(page, ".side-nav [data-mode='cycling']", "aria-pressed", "true"),
        async (page) => assertText(page, "#metaLocation", "Prospect Park"),
        async (page) => assertNotText(page, "#metaTime", "--"),
        async (page) => assertText(page, "#metaWindLabel", "Avg wind"),
        async (page) => assertNotText(page, "#rideMiles", "--"),
        async (page) => assertMinCount(page, "#rideGhosts path", 1),
        async (page) => clickAndCheckActivity(page, "Ride miles")
      ]
    },
    {
      path: "/?mode=sailing",
      name: "sailing",
      checks: [
        async (page) => assertAttribute(page, ".side-nav [data-mode='sailing']", "aria-pressed", "true"),
        async (page) => assertTextIncludes(page, "#rideMiles", "nm"),
        async (page) => assertMinCount(page, "#sailGhosts .sail-ghost", 1),
        async (page) => assertHidden(page, "#sailPath"),
        async (page) => assertHidden(page, "#sailPoint"),
        async (page) => clickAndCheckActivity(page, "Sail distance")
      ]
    },
    {
      path: "/?mode=archery",
      name: "archery",
      checks: [
        async (page) => assertAttribute(page, ".side-nav [data-mode='archery']", "aria-pressed", "true"),
        async (page) => assertText(page, "#rideMiles", String(archeryCount)),
        async (page) => assertCount(page, "#archeryShots .archery-shot", archeryCount),
        async (page) => clickAndCheckActivity(page, photoArchery ? "Estimated score" : "Session score")
      ]
    }
  ];

  const results = [];
  for (const spec of pages) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    // Exercise unavailable conditions deterministically, including long fallback labels.
    await page.route(/api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => route.abort());
    const pageErrors = [];
    const failedRequests = [];
    const consoleMessages = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));

    await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "networkidle" });
    try {
      await page.waitForFunction(() => document.getElementById("metaTime")?.textContent.trim() !== "--", { timeout: 5000 });
    } catch (error) {
      const debug = await page.evaluate(async () => {
        const scriptSources = [...document.scripts].map((script) => script.src || "inline");
        const moduleUrl = scriptSources.find((source) => source.includes("index.js"));
        const moduleText = moduleUrl ? await fetch(moduleUrl).then((response) => response.text()) : "";
        return {
          scriptSources,
          moduleSnippet: moduleText.slice(0, 120),
          metaTime: document.getElementById("metaTime")?.textContent
        };
      });
      throw new Error(`${spec.name} did not initialize: ${JSON.stringify({ pageErrors, consoleMessages, ...debug })}`);
    }
    if (spec.name === "sailing") {
      await assertAttribute(page, "#sailingVisual", "data-camera", "home");
      await page.waitForTimeout(750);
      await page.screenshot({ path: "/tmp/site-sailing-home.png", fullPage: true });
    }
    for (const check of spec.checks) await check(page);
    if (["cycling", "sailing", "archery"].includes(spec.name) && process.argv.includes("--profile-camera")) {
      const timing = await page.evaluate(async (mode) => {
        const svg = document.getElementById(`${mode}Visual`);
        const rect = svg.getBoundingClientRect();
        const intervals = [];
        let previous = performance.now();
        for (let i = 0; i < 90; i++) {
          const now = await new Promise(requestAnimationFrame);
          intervals.push(now - previous);
          previous = now;
          svg.dispatchEvent(new WheelEvent("wheel", { deltaY: i % 2 ? 12 : -12, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, cancelable: true }));
        }
        intervals.splice(0, 10);
        intervals.sort((a, b) => a - b);
        return { medianMs: intervals[40], p95Ms: intervals[76] };
      }, spec.name);
      console.log(`${spec.name} camera frame timing`, JSON.stringify(timing));
    }

    const materialFailures = failedRequests.filter((url) => url.startsWith(baseUrl) && !url.endsWith("/favicon.ico"));
    if (pageErrors.length || materialFailures.length) {
      throw new Error(`${spec.name} errors: ${JSON.stringify({ pageErrors, failedRequests: materialFailures })}`);
    }

    results.push(`ok ${spec.name}`);
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1024, 768], [1280, 600], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const layout = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const frame = box(".visual-frame");
        const metrics = box(".visual-metrics");
        const caption = box("figcaption");
        return {
          overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1,
          overlap: frame.bottom > metrics.top + 1 || (caption.height > 0 && metrics.bottom > caption.top + 1),
          blank: frame.width <= 0 || frame.height < 80
        };
      });
      await page.screenshot({ path: `/tmp/site-${spec.name}-${width}.png`, fullPage: true });
      if (Object.values(layout).some(Boolean)) {
        const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")]
          .filter((el) => el.namespaceURI === "http://www.w3.org/1999/xhtml" && el.getBoundingClientRect().right > innerWidth)
          .map((el) => ({ tag: el.tagName, id: el.id, class: el.className, width: el.getBoundingClientRect().width })));
        throw new Error(`${spec.name} layout at ${width}: ${JSON.stringify({ ...layout, elements: overflow })}`);
      }
      if (width <= 980) {
        const selection = await textContent(page, "#rideMilesLabel");
        await page.locator(".menu-button").click();
        await assertAttribute(page, ".menu-button", "aria-expanded", "true");
        if (!await page.locator(".metadata").isVisible()) throw new Error("Activity details did not open");
        await page.keyboard.press("Escape");
        await assertHidden(page, ".metadata");
        await assertText(page, "#rideMilesLabel", selection);
      }
    }
    await page.locator("[data-action='all']").click();
    if (["cycling", "sailing"].includes(spec.name)) await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/site-${spec.name}-overview.png`, fullPage: true });
    if (spec.name === "sailing") {
      await assertMinCount(page, "#harborWater path", 1);
      await assertMinCount(page, "#harborCoverage path", 1);
      await assertHidden(page, "#sailPoint");
      const overview = await page.locator("#sailingVisual").getAttribute("viewBox");
      await page.locator("#sailingHome").click();
      await page.waitForTimeout(750);
      await assertAttribute(page, "#sailingVisual", "data-camera", "home");
      const home = await page.locator("#sailingVisual").getAttribute("viewBox");
      if (Number(home.split(" ")[2]) >= Number(overview.split(" ")[2])) throw new Error("Home should be closer than all routes");
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (let index = 0; index < 3; index++) {
        await page.locator("[data-action='next']").click();
        const contained = await page.locator("#sailingVisual").evaluate((svg) => {
          const view = svg.viewBox.baseVal;
          const route = svg.querySelector("#sailPath").getBBox();
          return route.width > 0 && route.x >= view.x && route.y >= view.y && route.x + route.width <= view.x + view.width && route.y + route.height <= view.y + view.height;
        });
        if (!contained) throw new Error(`Sail ${index + 1} does not fit camera`);
      }
    }
    if (["cycling", "sailing", "archery"].includes(spec.name)) {
      if (spec.name === "archery") {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.locator("[data-action='next']").click();
      }
      const scoreBefore = await textContent(page, "#rideMiles");
      const shotsBefore = await page.locator("#archeryShots circle").count();
      const map = page.locator(`#${spec.name}Visual`);
      await map.scrollIntoViewIfNeeded();
      const rect = await map.boundingBox();
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const beforePan = await map.getAttribute("viewBox");
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 70, y + 30, { steps: 5 });
      await page.mouse.up();
      if (await map.getAttribute("viewBox") === beforePan) throw new Error("Drag did not pan");
      const beforeZoom = Number((await map.getAttribute("viewBox")).split(" ")[2]);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(100);
      if (Number((await map.getAttribute("viewBox")).split(" ")[2]) >= beforeZoom) throw new Error("Wheel did not zoom in");
      await page.keyboard.down("Shift");
      await page.mouse.down();
      await page.mouse.move(x + 150, y - 220, { steps: 5 });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await page.waitForTimeout(50);
      if (Number(await map.getAttribute("data-pitch")) !== 68) throw new Error("Shift-drag must clamp pitch at 68 degrees");
      const bearing=Number(await map.getAttribute("data-bearing"));
      if(spec.name!=="archery" && Math.abs(bearing-32)>0.01)throw new Error("Horizontal Shift-drag did not rotate");
      if(spec.name==="archery" && bearing!==0)throw new Error("Archery rotation changed");
      const screenPoint=()=>page.locator(`#${spec.name}World`).evaluate(el=>{
        const p=new DOMPoint(800,500).matrixTransform(el.getScreenCTM());
        return {x:p.x,y:p.y};
      });
      const beforeTiltedPan=await screenPoint();
      await page.mouse.move(x,y);
      await page.mouse.down();
      await page.mouse.move(x+35,y+20,{steps:5});
      await page.mouse.up();
      await page.waitForTimeout(50);
      const afterTiltedPan=await screenPoint();
      if(Math.abs(afterTiltedPan.x-beforeTiltedPan.x-35)>1 || Math.abs(afterTiltedPan.y-beforeTiltedPan.y-20)>1)throw new Error("Pan must follow the pointer after rotation and tilt");
      await page.screenshot({ path: `/tmp/site-${spec.name}-manual.png`, fullPage: true });
      await page.locator(`#${spec.name}Home`).click();
      await page.waitForTimeout(300);
      if (Number(await map.getAttribute("data-pitch")) !== 0) throw new Error("Home did not reset pitch");
      if (Number(await map.getAttribute("data-bearing")) !== 0) throw new Error("Home did not reset bearing");
      if (spec.name === "archery") {
        await assertText(page, "#rideMiles", scoreBefore);
        await assertCount(page, "#archeryShots circle", shotsBefore);
      }
    }
    await page.close();
  }

  await browser.close();
  console.log(results.join("\n"));
} finally {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch (localError) {
    const bundledModules = `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`;
    try {
      return createRequire(`${bundledModules}/`)("playwright");
    } catch (bundledError) {
      throw new Error(`Playwright is not available locally or in the Codex runtime.\n${localError.message}\n${bundledError.message}`);
    }
  }
}

async function ensureServer() {
  if (await isReachable(baseUrl)) return null;

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", baseUrl);
    const filePath = resolveRequestPath(requestUrl.pathname);

    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "content-type": contentType(filePath) });
      if (request.method === "HEAD") {
        response.end();
      } else {
        createReadStream(filePath).pipe(response);
      }
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolveReady, rejectReady) => {
    server.once("error", rejectReady);
    server.listen(port, "127.0.0.1", resolveReady);
  });
  return server;
}

function resolveRequestPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded === "/" ? "/index.html" : decoded);
  const filePath = join(rootDir, normalized);
  return filePath === rootDir || filePath.startsWith(`${rootDir}${sep}`) ? filePath : null;
}

function contentType(filePath) {
  return {
    ".css": "text/css",
    ".gpx": "application/gpx+xml",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".mjs": "text/javascript",
    ".svg": "image/svg+xml"
  }[extname(filePath)] || "application/octet-stream";
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function assertText(page, selector, expected) {
  const actual = await textContent(page, selector);
  if (actual !== expected) throw new Error(`${selector} expected "${expected}", got "${actual}"`);
}

async function assertTextIncludes(page, selector, expected) {
  const actual = await textContent(page, selector);
  if (!actual.includes(expected)) throw new Error(`${selector} expected to include "${expected}", got "${actual}"`);
}

async function assertNotText(page, selector, unexpected) {
  const actual = await textContent(page, selector);
  if (actual === unexpected) throw new Error(`${selector} should not be "${unexpected}"`);
}

async function assertAttribute(page, selector, name, expected) {
  const actual = await page.locator(selector).getAttribute(name);
  if (actual !== expected) throw new Error(`${selector} ${name} expected "${expected}", got "${actual}"`);
}

async function assertAttributeMatches(page, selector, name, pattern) {
  const actual = await page.locator(selector).getAttribute(name);
  if (!pattern.test(actual || "")) throw new Error(`${selector} ${name} did not match ${pattern}: "${actual}"`);
}

async function assertHidden(page, selector) {
  const hidden = await page.locator(selector).evaluate((element) => {
    return element.hasAttribute("hidden") || getComputedStyle(element).display === "none";
  });
  if (!hidden) throw new Error(`${selector} expected to be hidden`);
}

async function assertCount(page, selector, expected) {
  const actual = await page.locator(selector).count();
  if (actual !== expected) throw new Error(`${selector} expected ${expected}, got ${actual}`);
}

async function clickAndCheckActivity(page, milesLabel) {
  await page.locator("[data-action='next']").click();
  await page.waitForTimeout(100);
  await assertText(page, "#rideMilesLabel", milesLabel);
  await assertText(page, "#metaWindLabel", "Avg wind");
}

async function assertMinCount(page, selector, expected) {
  const actual = await page.locator(selector).count();
  if (actual < expected) throw new Error(`${selector} expected at least ${expected}, got ${actual}`);
}

async function textContent(page, selector) {
  return (await page.locator(selector).textContent()).trim();
}
