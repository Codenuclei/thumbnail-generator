/**
 * LLM-ops smoke test for the thumbnail QA loop.
 *
 * 1. Verifier sanity: run verifyThumbnailImage on known images and check the
 *    verdicts make sense (real thumbnail passes OCR, wrong hook fails).
 * 2. Full loop: generateWithVerification renders + QA-checks + repairs.
 *
 * bun run scripts/test-verify-loop.ts [--full]
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Load .env.local into process.env before importing app modules.
const raw = readFileSync(join(import.meta.dir, "..", ".env.local"), "utf8").replace(/^\uFEFF/, "");
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const [k, ...rest] = t.split("=");
  if (!process.env[k]) process.env[k] = rest.join("=");
}

const { verifyThumbnailImage } = await import("../lib/thumbnail-verify");
const { generateWithVerification } = await import("../lib/generate");

const OUT_DIR = join(import.meta.dir, "..", "..", "output", "qa-loop-test");
mkdirSync(OUT_DIR, { recursive: true });

function show(label: string, v: Awaited<ReturnType<typeof verifyThumbnailImage>>) {
  console.log(`\n=== ${label} ===`);
  console.log(`verdict=${v.verdict} score=${v.score} hookExact=${v.hookExact} (${v.ms}ms)`);
  console.log(`hookFound: "${v.hookFound}"`);
  for (const d of v.defects) console.log(`  [${d.severity}] ${d.code}: ${d.detail}`);
  if (v.repairNote) console.log(`repair: ${v.repairNote}`);
}

const imagePathArg = process.argv.find((a) => a.startsWith("--image="));
const full = process.argv.includes("--full");

if (imagePathArg) {
  const p = imagePathArg.slice("--image=".length);
  const hookArg = process.argv.find((a) => a.startsWith("--hook="))?.slice("--hook=".length) || "";
  const b64 = readFileSync(p).toString("base64");
  const mime = p.endsWith(".png") ? "image/png" : "image/jpeg";
  show(
    `custom image ${p}`,
    await verifyThumbnailImage({ imageBase64: b64, mimeType: mime, hook: hookArg, topic: "manual check" })
  );
} else if (!full) {
  console.log("Pass --image=/path/to.png --hook='TEXT' for verifier sanity, or --full for the loop test.");
}

if (process.argv.includes("--repair")) {
  // Deliberately render the WRONG hook so attempt 1 fails QA and the repair
  // note has to correct it on attempt 2 — proves the feedback loop works.
  console.log("\nRepair-path test: prompt says 'WATER GONE', QA expects 'NOTHING LEFT'...");
  const t0 = Date.now();
  const result = await generateWithVerification(
    [
      "YouTube thumbnail, 16:9. Documentary photo: empty water reservoir, worried young Indian woman focal subject.",
      'Bold hook text: "WATER GONE"',
      "Typography: bold condensed display sans, ALL CAPS, solid fill, soft drop shadow, directly on photo.",
    ].join("\n"),
    { hook: "NOTHING LEFT", topic: "India water crisis", maxRepairs: 1 },
    { imageSize: "1K", budgetMs: 170_000 }
  );
  console.log(`elapsed ${Date.now() - t0}ms`);
  const v = result.verification;
  if (v) {
    console.log(`verdict=${v.verdict} score=${v.score} attempts=${v.attempts} hookFound=${JSON.stringify(v.hookFound)}`);
    for (const d of v.defects) console.log(`  [${d.severity}] ${d.code}: ${d.detail}`);
  } else {
    console.log("verification skipped");
  }
  const out = join(OUT_DIR, `repair-${Date.now()}.png`);
  writeFileSync(out, Buffer.from(result.imageBase64, "base64"));
  console.log(`saved ${out}`);
}

if (full) {
  console.log("\nRunning full generate → verify → repair loop (1 variant, 1K)...");
  const t0 = Date.now();
  const result = await generateWithVerification(
    [
      "YouTube thumbnail, 16:9 landscape. Documentary photo of Bengaluru city with dried-out lake bed in foreground, worried young Indian woman as focal subject.",
      'Bold hook text (phone-readable) — spell EXACTLY, letter-for-letter: "WE ARE RUNNING OUT"',
      "Typography: bold condensed display sans (Anton / Impact energy), ALL CAPS, solid flat fill with soft drop shadow, no outline, text directly on the photo in clear negative space. One clean render of the words — no ghost layers, no cropped letters, no background patch, no border.",
    ].join("\n"),
    { hook: "WE ARE RUNNING OUT", topic: "India water crisis in Bengaluru", maxRepairs: 1 },
    { imageSize: "1K", budgetMs: 170_000 }
  );
  const ms = Date.now() - t0;
  const out = join(OUT_DIR, `loop-${Date.now()}.png`);
  writeFileSync(out, Buffer.from(result.imageBase64, "base64"));
  console.log(`\nLoop done in ${ms}ms → ${out}`);
  const v = result.verification;
  if (v) {
    console.log(`verdict=${v.verdict} score=${v.score} attempts=${v.attempts} hookExact=${v.hookExact}`);
    console.log(`hookFound: "${v.hookFound}"`);
    for (const d of v.defects) console.log(`  [${d.severity}] ${d.code}: ${d.detail}`);
  } else {
    console.log("verification: skipped (QA unavailable)");
  }
}
