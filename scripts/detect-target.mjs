import {readFile} from "node:fs/promises";
import {basename, resolve, join} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {importPhoto, saveDetection, atomicJson, storeRoot} from "./target-store.mjs";
import {detectImpacts, DEFAULT_VISION_MODEL} from "./target-vision.mjs";

// Single-photo experiments never run the batch importer or publish site data.
const photo = process.argv[2];
if (!photo) throw new Error("Usage: node scripts/detect-target.mjs <photo-path>");
const path = resolve(photo);
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
try {process.loadEnvFile("private/content.env");} catch(error) {if(error.code!=="ENOENT")throw error;}
if (!process.env.OPENAI_API_KEY) throw new Error("Configure OPENAI_API_KEY in private/content.env.");
const model = process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
const reasoningEffort = process.env.OPENAI_VISION_REASONING || "medium";
const {record} = await importPhoto(await readFile(path), {name:basename(path)});
if (record.calibration) {
  console.log("Already analyzed; preserving the saved review. No API request made.");
} else {
  console.log(JSON.stringify({file:record.fileName,date:record.date,model,reasoningEffort}));
  const result = await detectImpacts(record, await readFile(join(storeRoot,`${record.id}.image`)), {
    apiKey:process.env.OPENAI_API_KEY,model,reasoningEffort,
    onUsage:async info=>{
      await atomicJson(join(storeRoot,"attempts",`${record.id}-${randomUUID()}.json`),{...info,recordId:record.id,recordedAt:new Date().toISOString()});
      console.log(JSON.stringify(info));
    }
  });
  const saved = await saveDetection(record.id,result,record.revision,model);
  console.log(JSON.stringify({id:saved.id,date:saved.date,impacts:saved.marks.length,flagged:saved.marks.filter(mark=>mark.uncertain).length,excluded:saved.excluded.length}));
}
