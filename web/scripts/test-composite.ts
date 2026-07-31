/**
 * Compositor fixtures — proves the hook always lands inside the safe area with
 * readable ink. Run: cd web && bun scripts/test-composite.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { compositeHookTextDetailed, resolveThumbnailFontPath } from "../lib/font-composite";
import type { PlacementZoneId } from "../lib/font-engine";

const outDir = join(import.meta.dir, "..", "..", "output", "qa-loop-test");
mkdirSync(outDir, { recursive: true });

const W = 1280;
const H = 720;

async function plate(rgb: [number, number, number]): Promise<Buffer> {
  return sharp({
    create: { width: W, height: H, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  })
    .png()
    .toBuffer();
}

/** Bright top half / dark bottom half — forces different ink per zone. */
async function splitPlate(): Promise<Buffer> {
  const top = await sharp({
    create: { width: W, height: Math.round(H / 2), channels: 3, background: { r: 240, g: 240, b: 236 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: W, height: H, channels: 3, background: { r: 24, g: 26, b: 32 } },
  })
    .composite([{ input: top, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

type Case = {
  name: string;
  hook: string;
  zoneId?: PlacementZoneId;
  plate: () => Promise<Buffer>;
  /** Expected ink: "dark" on bright plates, "light" on dark plates. */
  expectInk?: "dark" | "light";
};

const CASES: Case[] = [
  { name: "short-dark", hook: "CAMPUS TRUTH", zoneId: "lower-left", plate: () => plate([28, 44, 62]), expectInk: "light" },
  { name: "short-bright", hook: "CAMPUS TRUTH", zoneId: "lower-left", plate: () => plate([238, 238, 234]), expectInk: "dark" },
  { name: "long-hook", hook: "THE HIDDEN COST OF CAMPUS", zoneId: "upper-right", plate: () => plate([30, 40, 50]) },
  { name: "very-long-word", hook: "UNCOMPROMISINGLY EXPENSIVE", zoneId: "lower-right", plate: () => plate([30, 40, 50]) },
  { name: "split-plate", hook: "CAMPUS TRUTH", zoneId: "upper-left", plate: splitPlate, expectInk: "dark" },
  { name: "mid-band", hook: "REAL NUMBERS", zoneId: "mid-band", plate: () => plate([22, 30, 40]), expectInk: "light" },
];

console.log(`font: ${resolveThumbnailFontPath() || "NONE (compositor will skip)"}\n`);

let failures = 0;

for (const testCase of CASES) {
  const base = await testCase.plate();
  const result = await compositeHookTextDetailed(base, {
    hook: testCase.hook,
    zoneId: testCase.zoneId,
  });

  const path = join(outDir, `composite-${testCase.name}.png`);
  writeFileSync(path, result.buffer);

  const problems: string[] = [];
  if (!result.applied) problems.push("compositor skipped");

  // Ink check.
  if (testCase.expectInk) {
    const isDark = result.detail.includes("ink=#101014");
    if (testCase.expectInk === "dark" && !isDark) problems.push("expected dark ink");
    if (testCase.expectInk === "light" && isDark) problems.push("expected light ink");
  }

  // Bounds check: no drawn pixel may fall in the 5% margin.
  const margin = { x: Math.round(W * 0.05), y: Math.round(H * 0.05) };
  const diff = await sharp(result.buffer).greyscale().raw().toBuffer();
  const baseRaw = await sharp(base).greyscale().raw().toBuffer();
  let outOfBounds = 0;
  let drawn = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (Math.abs(diff[i] - baseRaw[i]) > 24) {
        drawn++;
        if (x < margin.x || x > W - margin.x || y < margin.y || y > H - margin.y) {
          outOfBounds++;
        }
      }
    }
  }
  if (drawn === 0) problems.push("nothing was drawn");
  if (outOfBounds > 0) problems.push(`${outOfBounds}px outside safe margin`);

  const status = problems.length ? "FAIL" : "ok";
  if (problems.length) failures++;
  console.log(
    `[${status}] ${testCase.name.padEnd(15)} ${result.detail}` +
      (problems.length ? `\n         ${problems.join("; ")}` : "")
  );
}

console.log(`\n${CASES.length - failures}/${CASES.length} fixtures passed`);
if (failures) process.exit(1);
