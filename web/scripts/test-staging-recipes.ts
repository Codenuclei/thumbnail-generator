/** bun run scripts/test-staging-recipes.ts */
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_MASTER_PROMPT } from "../lib/master-prompt";
import {
  STAGING_RECIPES,
  siblingStagingLock,
  stagingRecipeForIndex,
} from "../lib/staging-recipes";
import {
  buildChannelIdentityCard,
  buildCompactBanCard,
  buildCreativeBrief,
} from "../lib/creative-brief";
import { adaptPromptForModel } from "../lib/prompt-adapters";
import {
  isAutoStackModel,
  modelForStagingIndex,
  promptFamilyForModel,
  resolveSlotModel,
  STACK,
} from "../lib/model-route";
import { DEFAULT_IMAGE_MODEL } from "../lib/image-models";
import type { ChannelProfile } from "../lib/channel-profile";

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
assert(engine.includes("adaptPromptForModel"), "prompt engine must use family adapters");
assert(!/Activity is NOT required/i.test(engine), "prompt engine must not treat activity as optional");

assert(DEFAULT_IMAGE_MODEL === "google/gemini-3.1-flash-image", "default model is Nano Banana 2");
assert(isAutoStackModel("default") && isAutoStackModel(""), "default/empty use Best stack");
assert(!isAutoStackModel("black-forest-labs/flux.2-pro"), "locked Flux is not auto stack");
assert(modelForStagingIndex(0) === STACK.flux, "object-hero routes to Flux");
assert(modelForStagingIndex(1) === STACK.face, "mid-action routes to Nano Banana Pro");
assert(resolveSlotModel("openai/gpt-image-2", 0) === "openai/gpt-image-2", "locked model wins");

const fixtureProfile: ChannelProfile = {
  channelName: "Kitchen Nightmares",
  channelInput: "@gordonramsay",
  topicClusters: ["food"],
  colorPalette: ["#C41E3A", "#111111", "#F5F0E6"],
  typography: "Bold condensed caps, high contrast",
  compositionPatterns: ["Face left, hook right"],
  motifs: ["close-up food", "shocked face"],
  summary: "High-contrast food thumbs with a face and a short punch hook.",
  evidence: [],
  analyzedAt: 1,
};

const identity = buildChannelIdentityCard(fixtureProfile, {
  tone: "Blunt and hungry",
  approvedPhrases: [],
  avoidedPhrases: ["SHOCKING"],
  motifs: [],
  visualGrammar: "",
});
assert(identity.includes("CHANNEL IDENTITY — Kitchen Nightmares"), "identity card names the channel");
assert(identity.includes("#C41E3A"), "identity card locks palette");
assert(identity.includes("shocked face"), "identity card keeps motifs");
assert(buildChannelIdentityCard(null) === "", "no profile → no invented brand");

const bans = buildCompactBanCard("BEST BURGER", "Best burger in town");
assert(bans.includes('"BEST BURGER"'), "ban card quotes the hook");
assert(bans.includes("No outline"), "ban card keeps type bans");

const briefs = [0, 1, 2, 3].map((i) =>
  buildCreativeBrief({
    topic: "Best burger in town",
    hook: "BEST BURGER",
    stagingIndex: i,
    variantCount: 4,
    cameraFilterIndex: i,
    typographyVariantIndex: i,
    channelProfile: fixtureProfile,
  })
);
assert(briefs[0].action !== briefs[1].action, "sibling briefs differ in action");
assert(briefs[0].paragraph.includes("BEST BURGER"), "brief includes hook");
assert(briefs[0].colors.includes("#C41E3A"), "channel palette wins over empty pick");

const flux = adaptPromptForModel({
  topic: "Best burger in town",
  hook: "BEST BURGER",
  imageModel: STACK.flux,
  stagingIndex: 0,
  variantCount: 4,
  cameraFilterIndex: 0,
  channelProfile: fixtureProfile,
});
assert(flux.includes("BEST BURGER"), "Flux prompt quotes the hook");
assert(!/OPTIONAL SUBJECT ACTIVITY/i.test(flux), "Flux must not get the old activity essay");
assert(flux.includes("CHANNEL IDENTITY"), "Flux gets identity when channel is set");
assert(promptFamilyForModel(STACK.flux) === "flux", "flux family");

const gemini = adaptPromptForModel({
  topic: "Best burger in town",
  hook: "BEST BURGER",
  imageModel: STACK.face,
  stagingIndex: 1,
  variantCount: 4,
  typographyVariantIndex: 1,
  channelProfile: fixtureProfile,
});
assert(gemini.includes("FONT ENGINE") || gemini.includes("ZERO outline"), "Gemini keeps font-engine bans");
assert(gemini.includes("CHANNEL IDENTITY"), "Gemini gets identity");

const noBrand = adaptPromptForModel({
  topic: "Best burger in town",
  hook: "BEST BURGER",
  imageModel: STACK.flux,
  stagingIndex: 0,
});
assert(!noBrand.includes("CHANNEL IDENTITY"), "no profile → no identity card");

const recraft = adaptPromptForModel({
  topic: "Best burger in town",
  hook: "BEST BURGER",
  imageModel: STACK.graphic,
  stagingIndex: 0,
  channelProfile: fixtureProfile,
});
assert(recraft.includes("Brand colors") || recraft.includes("#C41E3A"), "Recraft uses channel colors");

console.log("✓ staging recipes, sibling lock, adapters, and channel identity");
console.log(`✓ default ${DEFAULT_IMAGE_MODEL}; Flux/Gemini/Recraft families wired`);
