/**
 * Focused unit checks for content-gate heuristics / fail-open policy.
 * Run: bun run scripts/test-content-gate.ts  (from web/)
 */
import {
  isAdultOrientedQueryHeuristic,
  looksLikeNsfwMetadata,
  shouldAllowGatedImage,
  type ImageContentVerdict,
} from "../lib/gemini-filter";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

console.log("=== adult query heuristic ===");
assert(isAdultOrientedQueryHeuristic("NSFW art tutorial") === true, "nsfw query → adult");
assert(isAdultOrientedQueryHeuristic("onlyfans thumbnail ideas") === true, "onlyfans → adult");
assert(isAdultOrientedQueryHeuristic("HYROX Delhi race recap") === false, "hyrox → non-adult");
assert(
  isAdultOrientedQueryHeuristic("sex education for teens") === false,
  "sex education ambiguous → non-adult (safer)"
);
assert(isAdultOrientedQueryHeuristic("beach volleyball highlights") === false, "beach → non-adult");

console.log("\n=== nsfw metadata heuristic ===");
assert(looksLikeNsfwMetadata("Full NSFW Compilation") === true, "nsfw title");
assert(looksLikeNsfwMetadata("HYROX World Championship Finals") === false, "race title clean");

console.log("\n=== shouldAllowGatedImage policy ===");
const nsfw: ImageContentVerdict = {
  id: "1",
  allow: false,
  reasons: ["explicit"],
  codes: ["nsfw"],
  confidence: "high",
};
assert(shouldAllowGatedImage(nsfw, false) === false, "NSFW blocked on non-adult");
assert(shouldAllowGatedImage(nsfw, true) === true, "NSFW allowed on adult query");

const irrelevantHigh: ImageContentVerdict = {
  id: "2",
  allow: false,
  reasons: ["wrong topic"],
  codes: ["irrelevant"],
  confidence: "high",
};
assert(shouldAllowGatedImage(irrelevantHigh, false) === false, "confident irrelevant dropped");

const irrelevantLow: ImageContentVerdict = {
  id: "3",
  allow: false,
  reasons: ["maybe off"],
  codes: ["irrelevant"],
  confidence: "low",
};
assert(
  shouldAllowGatedImage(irrelevantLow, false) === true,
  "low-confidence irrelevant fail-open"
);

const clean: ImageContentVerdict = {
  id: "4",
  allow: true,
  reasons: [],
  codes: [],
  confidence: "high",
};
assert(shouldAllowGatedImage(clean, false) === true, "clean allowed");

const otherHigh: ImageContentVerdict = {
  id: "5",
  allow: false,
  reasons: ["gore"],
  codes: ["other"],
  confidence: "high",
};
assert(shouldAllowGatedImage(otherHigh, false) === false, "confident other dropped");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
