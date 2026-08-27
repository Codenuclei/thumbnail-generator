import { buildFontEnginePromptBlock } from "@/lib/font-engine";
import {
  buildChannelIdentityCard,
  buildCompactBanCard,
  buildCreativeBrief,
  type CreativeBriefInput,
} from "@/lib/creative-brief";
import { promptFamilyForModel, type PromptFamily } from "@/lib/model-route";

export type AdaptedPromptInput = CreativeBriefInput & {
  imageModel?: string;
  /** Optional extra scene notes (media summary, user brief already on input). */
  sceneNote?: string;
};

function sharedTail(input: AdaptedPromptInput): string {
  const brief = buildCreativeBrief(input);
  const identity = buildChannelIdentityCard(
    input.channelProfile,
    input.brandLanguage
  );
  const bans = buildCompactBanCard(brief.hook, input.topic);
  const extra = (input.userBrief || "").trim();
  return [
    identity,
    bans,
    brief.siblingLock,
    brief.staging.prompt,
    extra ? `USER BRIEF: ${extra.slice(0, 400)}` : "",
    input.sceneNote ? `SCENE NOTE: ${input.sceneNote.slice(0, 280)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fluxPrompt(input: AdaptedPromptInput): string {
  const brief = buildCreativeBrief(input);
  const identity = buildChannelIdentityCard(
    input.channelProfile,
    input.brandLanguage
  );
  const lens = brief.camera.prompt.replace(/^Camera:\s*/i, "").split(".")[0];
  const hookBit = brief.hook
    ? `Large readable letters "${brief.hook}" sit in the ${brief.hookZone}, solid flat fill, no outline.`
    : "No letters, captions, or logos anywhere.";
  const colorBit = brief.colors.length
    ? `Colors ${brief.colors.slice(0, 3).join(", ")}.`
    : "";
  const scene = [
    `${brief.subject} ${brief.action.toLowerCase()}, subject on the ${brief.position}.`,
    brief.composition,
    `Shot on ${lens}.`,
    hookBit,
    colorBit,
    "Photoreal YouTube thumbnail, high contrast, one story beat.",
  ]
    .filter(Boolean)
    .join(" ");
  return [scene, identity, buildCompactBanCard(brief.hook, input.topic), brief.siblingLock]
    .filter(Boolean)
    .join("\n");
}

function gptPrompt(input: AdaptedPromptInput): string {
  const brief = buildCreativeBrief(input);
  const typeEnergy = input.channelProfile?.typography || "medium-bold condensed sans";
  return [
    "YouTube thumbnail, 16:9. Follow this brief in order.",
    `1. Goal: ${brief.goal}`,
    `2. Subject: ${brief.subject} on the ${brief.position}`,
    `3. Action: ${brief.action} — different from siblings`,
    `4. Composition: ${brief.composition}`,
    `5. Light + color: ${brief.light}${brief.colors.length ? `; ${brief.colors.join(" ")}` : ""}`,
    brief.hook
      ? `6. Paint exactly "${brief.hook}" once in the ${brief.hookZone}. Type energy: ${typeEnergy}. No other text.`
      : "6. No on-image text.",
    sharedTail(input),
  ].join("\n");
}

function recraftPrompt(input: AdaptedPromptInput): string {
  const brief = buildCreativeBrief(input);
  const typeEnergy = input.channelProfile?.typography || "Bebas / Montserrat Bold, open tracking";
  return [
    "Design a 16:9 YouTube thumbnail poster.",
    `Layout: subject ${brief.position}, hook zone ${brief.hookZone}.`,
    `Story: ${brief.action} for "${brief.subject}".`,
    brief.colors.length
      ? `Brand colors only: ${brief.colors.join(" ")}.`
      : "High-contrast 2–3 color poster.",
    brief.hook
      ? `Headline exactly "${brief.hook}" · ${typeEnergy} · solid fill, no stroke, no plate.`
      : "No headline lettering.",
    sharedTail(input),
  ].join("\n");
}

function seedreamPrompt(input: AdaptedPromptInput): string {
  const brief = buildCreativeBrief(input);
  return [
    brief.paragraph,
    `Atmosphere: ${brief.camera.prompt}`,
    sharedTail(input),
  ].join("\n");
}

function geminiPrompt(input: AdaptedPromptInput): string {
  const brief = buildCreativeBrief(input);
  const typeBlock = buildFontEnginePromptBlock({
    hook: input.hook || "",
    variantIndex: input.typographyVariantIndex ?? input.stagingIndex ?? 0,
  });
  return [
    "Create a phone-readable YouTube thumbnail. Positive framing — describe what IS in the frame.",
    brief.paragraph,
    brief.camera.prompt,
    typeBlock,
    sharedTail(input),
  ].join("\n");
}

export function adaptPromptForModel(input: AdaptedPromptInput): string {
  const family: PromptFamily = promptFamilyForModel(input.imageModel);
  if (family === "flux") return fluxPrompt(input);
  if (family === "gpt") return gptPrompt(input);
  if (family === "recraft") return recraftPrompt(input);
  if (family === "seedream") return seedreamPrompt(input);
  return geminiPrompt(input);
}
