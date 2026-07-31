/**
 * Font-engine test suite — hygiene + vision QA against known fixtures.
 *
 * cd web && bun run scripts/test-font-engine.ts
 * cd web && bun run scripts/test-font-engine.ts --image=/path.png --hook="TEXT"
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const envPath = join(import.meta.dir, "..", ".env.local");
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    if (!process.env[k]) process.env[k] = rest.join("=");
  }
}

const {
  validateHookText,
  buildFontEnginePromptBlock,
  inspectTypography,
  formatTypographyReport,
  HARD_BANS,
  ALLOWED_TREATMENT,
  FONT_ENGINE_VARIANTS,
  YOUTUBE_DISPLAY_FONTS,
  PLACEMENT_ZONES,
} = await import("../lib/font-engine");

const ROOT = join(import.meta.dir, "..", "..");
const ASSETS =
  "/Users/mu-mac_3/.cursor/projects/Users-mu-mac-3-Projects-thumbnail-generator/assets";
const QA = join(ROOT, "output", "qa-loop-test");

type Fixture = {
  name: string;
  path: string;
  hook: string;
  topic: string;
  expect: "pass" | "fail";
  /** When expect=fail, at least one of these defect codes should appear. */
  expectCodes?: string[];
};

const FIXTURES: Fixture[] = [
  {
    name: "gold-munnar-real-youtube",
    path: join(ASSETS, "Screenshot_2026-07-30_at_4.48.15_PM-20deaadd-3447-435e-8d72-83588bc61425.png"),
    hook: "MUNNAR",
    topic: "Kerala tea gardens",
    // Single-word gold still passes OCR; hygiene prefers 2+ words but QA allows exact match.
    expect: "pass",
  },
  {
    name: "gold-final-v1-no-outline",
    path: join(QA, "final-v1.png"),
    hook: "DO NOT BUY NOW",
    topic: "Mumbai real estate",
    expect: "pass",
  },
  {
    name: "gold-final-v2-soft-shadow",
    path: join(QA, "final-v2.png"),
    hook: "DO NOT BUY NOW",
    topic: "Mumbai real estate",
    expect: "pass",
  },
  {
    name: "gold-strict-v1-travel",
    path: join(QA, "strict-v1.png"),
    hook: "TRAVEL DESTINATIONS",
    topic: "Kerala tea gardens travel",
    expect: "pass",
  },
  {
    name: "fail-stroke-and-split",
    path: join(ASSETS, "Screenshot_2026-07-30_at_5.29.28_PM-117d31bb-4e36-430e-a66c-faa4e957e15c.png"),
    hook: "TRAVEL DESTINATIONS",
    topic: "travel destinations",
    expect: "fail",
    expectCodes: ["hard-outline", "collage-seam"],
  },
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runHygieneTests() {
  console.log("\n=== hygiene (no API) ===");
  const good = validateHookText("DO NOT BUY NOW");
  assert(good.ok && good.wordCount === 4, `expected ok 4-word hook, got ${JSON.stringify(good)}`);
  console.log("✓ 4-word hook OK");

  const empty = validateHookText("");
  assert(empty.ok && empty.normalized === "", "empty hook must be ok (text-free mode)");
  console.log("✓ empty hook OK (text-free)");

  const long = validateHookText("THIS HOOK IS WAY TOO LONG FOR A THUMB");
  assert(!long.ok, "6+ word hook must fail hygiene");
  console.log("✓ long hook rejected");

  const url = validateHookText("SEE https://evil.com NOW");
  assert(!url.ok, "URL hook must fail");
  console.log("✓ URL hook rejected");

  const block = buildFontEnginePromptBlock({ hook: "WE ARE RUNNING OUT", variantIndex: 0 });
  assert(block.includes("WE ARE RUNNING OUT"), "prompt must include exact hook");
  assert(block.includes("ZERO outline") || HARD_BANS.some((b) => block.includes("outline")), "prompt must ban outlines");
  assert(block.includes(ALLOWED_TREATMENT.split("+")[0].trim().slice(0, 12)), "prompt must state allowed treatment");
  console.log("✓ prompt block includes hook + bans");

  assert(YOUTUBE_DISPLAY_FONTS.length >= 4, "need display font set");
  assert(PLACEMENT_ZONES.length >= 4, "need placement zones");
  assert(FONT_ENGINE_VARIANTS.length >= 4, "need variants");
  console.log(
    `✓ catalog: ${YOUTUBE_DISPLAY_FONTS.length} fonts, ${PLACEMENT_ZONES.length} zones, ${FONT_ENGINE_VARIANTS.length} variants`
  );
}

async function runFixture(f: Fixture): Promise<boolean> {
  if (!existsSync(f.path)) {
    console.log(`⊘ SKIP ${f.name} — missing ${f.path}`);
    return true;
  }
  const b64 = readFileSync(f.path).toString("base64");
  const mime = f.path.endsWith(".png") ? "image/png" : "image/jpeg";
  const v = await inspectTypography({
    imageBase64: b64,
    mimeType: mime,
    hook: f.hook,
    topic: f.topic,
  });
  console.log(`\n--- ${f.name} (expect ${f.expect}) ---`);
  console.log(formatTypographyReport(v));

  if (v.verdict === "skipped") {
    console.log("⊘ SKIP — QA unavailable");
    return true;
  }

  let ok = v.verdict === f.expect;
  if (ok && f.expect === "fail" && f.expectCodes?.length) {
    const codes = new Set(v.defects.map((d) => d.code));
    const hit = f.expectCodes.some((c) => codes.has(c as never));
    if (!hit) {
      console.log(`✗ expected one of [${f.expectCodes.join(", ")}] in defects`);
      ok = false;
    }
  }
  console.log(ok ? "✓ PASS" : "✗ FAIL");
  return ok;
}

const imageArg = process.argv.find((a) => a.startsWith("--image="));
const hookArg = process.argv.find((a) => a.startsWith("--hook="))?.slice("--hook=".length) || "";

if (imageArg) {
  const p = imageArg.slice("--image=".length);
  const b64 = readFileSync(p).toString("base64");
  const mime = p.endsWith(".png") ? "image/png" : "image/jpeg";
  const v = await inspectTypography({
    imageBase64: b64,
    mimeType: mime,
    hook: hookArg,
    topic: "manual",
  });
  console.log(formatTypographyReport(v));
  process.exit(v.verdict === "fail" ? 1 : 0);
}

let failed = 0;
try {
  runHygieneTests();
} catch (err) {
  console.error("✗ hygiene:", err instanceof Error ? err.message : err);
  failed += 1;
}

console.log("\n=== vision fixtures ===");
for (const f of FIXTURES) {
  const ok = await runFixture(f);
  if (!ok) failed += 1;
}

console.log(`\n=== summary: ${failed === 0 ? "ALL PASSED" : `${failed} FAILED`} ===`);
console.log("Skill: .cursor/skills/youtube-thumbnail-typography/SKILL.md");
console.log("Engine: web/lib/font-engine.ts");
process.exit(failed === 0 ? 0 : 1);
