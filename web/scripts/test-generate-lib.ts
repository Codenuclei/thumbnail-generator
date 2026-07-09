/** bun run scripts/test-generate-lib.ts */
import { readFileSync } from "fs";
import { join } from "path";
import { generateThumbnail } from "../lib/generate";

const envPath = join(import.meta.dir, "..", ".env.local");
for (const line of readFileSync(envPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1);
}

const prompt =
  "Ultra-sharp photorealistic YouTube thumbnail 16:9. Topic: China's Robot Revolution. Hook: CHINA'S ROBOT REVOLUTION in bold red and white. Factory robots, sparks, cinematic.";

console.log("GEMINI_API_KEY set:", Boolean(process.env.GEMINI_API_KEY));
const t0 = Date.now();
const result = await generateThumbnail(prompt, undefined, [], "1K", false);
console.log("backend:", result.backend);
console.log("image bytes:", Math.round((result.imageBase64.length * 3) / 4));
console.log("elapsed ms:", Date.now() - t0);
