import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import exifr from "exifr";
import sharp from "sharp";
import { validateReview } from "./target-records.mjs";

export const storeRoot = resolve(process.env.TARGET_STORE || "private/target-workspace");
export const idPattern = /^photo-[a-f0-9]{24}$/;
export async function atomicJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, path);
}
function recordPath(id) {
  if (!idPattern.test(id)) throw new Error("Invalid target ID.");
  return join(storeRoot, `${id}.json`);
}
export async function readRecord(id) { return JSON.parse(await readFile(recordPath(id), "utf8")); }
export function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP") return "image/webp";
  throw new Error("Use a JPEG, PNG, or WebP photo. Export HEIC photos as JPEG first.");
}
export async function importPhoto(bytes, { name }) {
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error("Photo size must be below 30 MB.");
  imageType(bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const id = `photo-${digest.slice(0, 24)}`;
  try { return { record: await readRecord(id), duplicate: true }; } catch (error) { if (error.code !== "ENOENT") throw error; }
  let metadata = {};
  try { metadata = await exifr.parse(bytes, { pick: ["DateTimeOriginal", "OffsetTimeOriginal"], reviveValues: false }) || {}; } catch { /* Capture date remains editable when EXIF is absent or damaged. */ }
  const match = metadata.DateTimeOriginal?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/);
  const date = match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  const local = match ? `${date}T${match[4]}` : null;
  const offset = /^[+-]\d{2}:\d{2}$/.test(metadata.OffsetTimeOriginal || "") ? metadata.OffsetTimeOriginal : null;
  // Bake orientation into pixels and strip EXIF (including GPS) before API use.
  const { data: preview, info } = await sharp(bytes, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const mime = "image/jpeg";
  const record = { id, digest, name: String(name || "Target").slice(0,160), fileName: String(name || "Photo").slice(0,250),
    width, height, mime, date, exifDate: date, capturedAt: local && offset ? local + offset : null, capturedAtLocal: local,
    status: "pending", revision: 1, calibration: null, marks: [], excluded: [] };
  await mkdir(storeRoot, { recursive: true });
  await writeFile(join(storeRoot, `${id}.image`), preview, { mode: 0o600 });
  await atomicJson(recordPath(id), record);
  return { record, duplicate: false };
}
export async function updateRecord(id, edits) {
  const previous = await readRecord(id);
  if (edits.revision !== previous.revision) { const error = new Error("This target changed elsewhere. Reload it before saving."); error.status = 409; throw error; }
  const record = { ...previous, name: edits.name, date: edits.date, marks: edits.marks, excluded: edits.excluded, calibration: edits.calibration,
    reviewFeedback: edits.reviewFeedback ?? previous.reviewFeedback ?? "",
    reviewState: edits.reviewState ?? previous.reviewState ?? "draft",
    revision: previous.revision + 1, status: edits.calibration ? "review" : "pending" };
  validateReview(record);
  await atomicJson(recordPath(id), record);
  return record;
}

export async function saveDetection(id, result, revision, model) {
  const record = await readRecord(id);
  if (record.revision !== revision || record.status === "approved") throw new Error("Target changed during detection. Existing work was preserved.");
  await atomicJson(join(storeRoot, `${id}.detection.json`), { model, detectedAt: new Date().toISOString(), result });
  if (!result.isSupportedTarget) throw new Error(result.note || "A single 40 cm ten-ring target could not be identified.");
  const edits = { ...record,
    calibration: { center: [result.center.x, result.center.y], rings: result.rings.map(r => [r.radius, r.x, r.y, r.rx, r.ry]) },
    marks: result.impacts.map((mark,i)=>({id:`impact-${i+1}`,x:mark.x,y:mark.y,uncertain:mark.uncertain,note:mark.note})),
    excluded: result.hangingHoles.map((mark,i)=>({id:`pin-${i+1}`,x:mark.x,y:mark.y,uncertain:false,note:mark.note}))
  };
  const saved = await updateRecord(id, edits);
  return saved;
}
