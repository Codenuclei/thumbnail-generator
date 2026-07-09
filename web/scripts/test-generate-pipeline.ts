/**
 * Simulates real /api/generate Gemini call — reads key from .env.local.
 * bun run scripts/test-generate-pipeline.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

function loadKey(name: string): string {
  const raw = readFileSync(join(import.meta.dir, "..", ".env.local"), "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith(`${name}=`)) return t.slice(name.length + 1).trim();
  }
  throw new Error(`${name} missing`);
}

const THUMB =
  "https://i.ytimg.com/vi/8jLOx1hD3_o/hqdefault.jpg";

async function test(label: string, body: object) {
  const key = loadKey("GEMINI_API_KEY");
  const t0 = Date.now();
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    }
  );
  const ms = Date.now() - t0;
  const text = await res.text();
  const hasImage = text.includes('"inlineData"') || text.includes('"inline_data"');
  console.log(`\n=== ${label} ===`);
  console.log(`HTTP ${res.status} in ${ms}ms | hasImage=${hasImage}`);
  if (!res.ok) console.log(text.slice(0, 600));
}

// 1) minimal
await test("minimal 1K no refs", {
  contents: [{ role: "user", parts: [{ text: "YouTube thumbnail 16:9: CHINA ROBOT REVOLUTION bold text factory robots" }] }],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
  },
});

// 2) with 6 reference images (like production)
const imgRes = await fetch(THUMB);
const b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
  { text: "Create YouTube thumbnail: CHINA ROBOT REVOLUTION. Match reference energy." },
  { text: "References:" },
];
for (let i = 0; i < 6; i++) parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });

await test("6 ref images 1K", {
  contents: [{ role: "user", parts }],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
  },
});

// 3) 4K like old default
await test("minimal 4K", {
  contents: [{ role: "user", parts: [{ text: "YouTube thumbnail 16:9: CHINA ROBOT REVOLUTION" }] }],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: "16:9", imageSize: "4K" },
  },
});
