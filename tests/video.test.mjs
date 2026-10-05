import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { videoMetadata, importVideo } from "../scripts/content-video.mjs";
import { captureLabels } from "../scripts/video-player.mjs";
const exec=promisify(execFile);
const info={format:{duration:"5",tags:{creation_time:"2026-03-24T18:57:54Z",location:"+40.6892-074.0445/"}},streams:[{codec_type:"video",width:1920,height:1080},{codec_type:"audio"}]};
test("video capture metadata preserves capture offset and treats missing fields as unknown",()=>{
  const metadata=videoMetadata(info);
  assert.equal(metadata.hasAudio,true);assert.equal(metadata.location,null);
  assert.equal(metadata.date,"2026-03-24");
  assert.equal(videoMetadata(info,{date:"2025-12-31",location:"Prospect Park"}).date,"2025-12-31");
  assert.throws(()=>videoMetadata(info,{date:"2026-02-30"}),/valid YYYY-MM-DD/);
  assert.equal(captureLabels("2026-03-24T14:57:54-04:00").time,"14:57 -04:00");
  assert.equal(captureLabels(null).date,"Not recorded");
  assert.equal(videoMetadata({...info,format:{duration:"3"}}).capturedAt,null);
  assert.throws(()=>videoMetadata({...info,format:{duration:"241"}}),/four minutes/);
  assert.throws(()=>videoMetadata(info,{capturedAt:"2026-03-24T14:57:54"}),/timezone/);
});
test("video conversion creates a bounded MP4 and poster, strips GPS, and caches unchanged originals",async t=>{
  try{await exec("ffmpeg",["-version"]);}catch{t.skip("FFmpeg not installed");return;}
  const directory=await mkdtemp(join(tmpdir(),"site-video-")),path=join(directory,"source.mov"),output=join(directory,"output");
  await exec("ffmpeg",["-v","error","-y","-f","lavfi","-i","testsrc2=size=640x360:rate=24","-f","lavfi","-i","sine=frequency=440","-t","1","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-metadata","creation_time=2026-03-24T18:57:54Z","-metadata","location=+40.6892-074.0445/",path]);
  const weatherLookup=async()=>({status:"ok",condition:"Clear",wind:"W 5 mph"});
  const first=await importVideo(path,output,[],{weatherLookup});
  assert.equal(first.entry.capturedAt,"2026-03-24T18:57:54.000000Z");assert.equal(first.entry.weather.condition,"Clear");
  assert.ok(first.changed);assert.equal(first.entry.hasAudio,true);assert.ok(first.entry.width<=1280);assert.ok(first.entry.height<=720);
  assert.ok((await stat(join(output,first.entry.poster))).size>0);
  const {stdout}=await exec("ffprobe",["-v","error","-show_format","-show_streams","-of","json",join(output,first.entry.file)]);
  const converted=JSON.parse(stdout);assert.equal(converted.streams[0].codec_name,"h264");assert.equal(converted.streams[0].pix_fmt,"yuv420p");assert.equal(converted.format.tags.location,undefined);
  const again=await importVideo(path,output,first.index);assert.equal(again.changed,false);
  await writeFile(path+".json",JSON.stringify({name:"Harbor",location:"New York Harbor",weather:"Clear",capturedAt:"2026-03-24T14:57:54-04:00"}));
  const changed=await importVideo(path,output,first.index,{weatherLookup});assert.equal(changed.entry.name,"Harbor");assert.equal(changed.index.length,1);
  assert.equal(JSON.parse(await readFile(join(output,"video-index.json"),"utf8"))[0].location,"New York Harbor");
});
