/** bun run scripts/test-staging-recipes.ts */
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_MASTER_PROMPT } from "../lib/master-prompt";
import {
  STAGING_RECIPES,
  siblingStagingLock,
  stagingRecipeForIndex,
} from "../lib/staging-recipes";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

assert(STAGING_RECIPES.length >= 4, "need at least 4 staging recipes");
assert(stagingRecipeForIndex(0).id !== stagingRecipeForIndex(1).id, "slots 0/1 must differ");
assert(stagingRecipeForIndex(0).id !== stagingRecipeForIndex(2).id, "slots 0/2 must differ");
assert(stagingRecipeForIndex(0).id !== stagingRecipeForIndex(3).id, "slots 0/3 must differ");

const lock = siblingStagingLock(0, 4);
assert(lock.includes("Object hero"), "slot 0 lock must name its recipe");
assert(lock.includes("Mid-action"), "slot 0 must forbid sibling mid-action");
assert(lock.includes("Place + scale"), "slot 0 must forbid sibling place");

assert(DEFAULT_MASTER_PROMPT.includes("VARIANT ORIGINALITY"), "master prompt must require sibling originality");
assert(DEFAULT_MASTER_PROMPT.includes("ANTI-STOCK-THUMB"), "master prompt must ban presenter-on-board loop");
assert(!/Activity is NOT required/i.test(DEFAULT_MASTER_PROMPT), "master prompt must not excuse identical poses");

const engine = readFileSync(join(import.meta.dir, "../lib/prompt-engine.ts"), "utf8");
assert(engine.includes("stagingRecipeForIndex"), "prompt engine must rotate staging recipes");
assert(engine.includes("SUBJECT ACTIVITY (required"), "prompt engine must require topic-true activity");
assert(engine.includes("VARIANT DIVERSITY (hard)"), "prompt engine must hard-require sibling diversity");
assert(!/Activity is NOT required/i.test(engine), "prompt engine must not treat activity as optional");
assert(engine.includes('tight:'), "prompt engine must include extreme-close composition");
assert(engine.includes('wide:'), "prompt engine must include place-scale composition");

console.log("✓ staging recipes, sibling lock, master prompt, and engine wiring");
console.log(`✓ ${STAGING_RECIPES.length} exclusive story beats`);
