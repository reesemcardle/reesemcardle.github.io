import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

export function contentFolder(){
  return resolve(process.env.WEBSITE_CONTENT_DIR || fileURLToPath(new URL('../private/Website Content/',import.meta.url)));
}
