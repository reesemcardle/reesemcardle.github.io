import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath, pathToFileURL} from "node:url";

export function stampUpdatedDate(html, date = new Date()) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric"
  }).format(date);
  const marker = /<small id="lastUpdated">[^<]*<\/small>/g;
  if ([...html.matchAll(marker)].length !== 1) throw new Error("Expected one lastUpdated footer marker.");
  return html.replace(marker, `<small id="lastUpdated">Last updated ${label}</small>`);
}

function deploy() {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const git = (...args) => execFileSync("git", args, {cwd, encoding: "utf8"}).trim();
  if (git("branch", "--show-current") !== "master") throw new Error("Publish from master only.");
  if (git("status", "--porcelain")) throw new Error("Commit your site changes before publishing.");
  git("fetch", "origin");
  git("merge-base", "--is-ancestor", "origin/master", "HEAD");
  const path = new URL("../index.html", import.meta.url);
  const original = readFileSync(path, "utf8");
  const updated = stampUpdatedDate(original);
  if (original !== updated) {
    writeFileSync(path, updated);
    git("add", "index.html");
    git("commit", "-m", "Update publication date");
  }
  execFileSync("git", ["push", "origin", "master"], {cwd, stdio: "inherit"});
  console.log("Pushed. GitHub Pages will publish the update shortly.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) deploy();
