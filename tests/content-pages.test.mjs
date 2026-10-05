import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile,symlink} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {compileMarkdown,importPages} from "../scripts/content-pages.mjs";

test("Markdown supports code, links and unique section IDs without executable HTML",()=>{
  const result=compileMarkdown('# A title\n\n## Repeat\n\n## Repeat\n\n```js\nconst x = "<b>";\n```\n\n[Bad](javascript:alert(1))\n\n<script>alert(1)</script><img src="x" onerror="alert(1)"><iframe src="https://example.com"></iframe>');
  assert.deepEqual(result.headings.map(h=>h.id),["article-a-title","article-repeat","article-repeat-2"]);
  assert.match(result.html,/language-js/);
  assert.doesNotMatch(result.html,/<script|onerror|javascript:|<iframe/);
  assert.match(result.html,/&lt;b&gt;/);
});

test("editorial import handles drafts, dates, sandbox payloads, public contacts and repeat builds",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"editorial-")),output=join(folder,"out");
  await mkdir(join(folder,"labs"));await mkdir(join(folder,"about"));
  await writeFile(join(folder,"labs/first.md"),"# First\n\nSome writing.");
  await writeFile(join(folder,"labs/first.md.json"),JSON.stringify({date:"2026-10-05",kind:"experiment",tags:["maps"],experiment:"demo.html"}));
  await writeFile(join(folder,"labs/demo.html"),"<!doctype html><button>Run</button>");
  await writeFile(join(folder,"labs/private.md"),"# Unpublished");
  await writeFile(join(folder,"labs/private.md.json"),'{"draft":true}');
  await writeFile(join(folder,"about/about.md"),"## Experience\n\nA role.");
  await writeFile(join(folder,"about/about.md.json"),JSON.stringify({name:"Example",location:"City",linkedin:"https://www.linkedin.com/in/example/"}));
  assert.equal(await importPages(folder,output,{dry:true}),2);
  await assert.rejects(readFile(join(output,"pages/about.json")),/ENOENT/);
  assert.equal(await importPages(folder,output),2);
  assert.equal(await importPages(folder,output),0);
  const labs=JSON.parse(await readFile(join(output,"pages/labs.json")));
  assert.equal(labs.length,1);assert.equal(labs[0].id,"first");assert.match(labs[0].experiment,/<button>/);
  assert.equal(JSON.parse(await readFile(join(output,"pages/about.json"))).email,null);
  await writeFile(join(folder,"labs/first.md.json"),'{"date":"2026-02-30"}');
  await assert.rejects(importPages(folder,output,{only:"labs"}),/Invalid Labs date/);
  await writeFile(join(folder,"labs/first.md.json"),'{"experiment":"escape.html"}');
  await writeFile(join(folder,"outside.html"),"private");
  await symlink(join(folder,"outside.html"),join(folder,"labs/escape.html"));
  await assert.rejects(importPages(folder,output,{only:"labs"}),/inside labs/);
});
