import type { BrandLanguage } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";
import type { ColorPaletteOption } from "@/lib/palette-types";
import { fontEngineVariantForIndex } from "@/lib/font-engine";
import {
  siblingStagingLock,
  stagingRecipeForIndex,
  type StagingRecipe,
} from "@/lib/staging-recipes";
import { cameraFilterForIndex, type CameraFilter } from "@/lib/camera-filters";

export type CreativeBriefInput = {
  topic: string;
  hook?: string;
  stagingIndex?: number;
  variantCount?: number;
  cameraFilterIndex?: number;
  typographyVariantIndex?: number;
  composition?: string;
  selectedPalette?: ColorPaletteOption | null;
  channelProfile?: ChannelProfile | null;
  brandLanguage?: BrandLanguage | null;
  userBrief?: string;
  /** True when the user explicitly chose a palette (not auto-from-likes). */
  paletteLockedByUser?: boolean;
};

export type CreativeBrief = {
  goal: string;
  subject: string;
  position: string;
  action: string;
  composition: string;
  light: string;
  colors: string[];
  hook: string;
  hookZone: string;
  paragraph: string;
  staging: StagingRecipe;
  camera: CameraFilter;
  siblingLock: string;
};

const GOAL_BY_STAGING: Record<string, string> = {
  "object-hero": "curiosity — the object is the click",
  "mid-action": "shock — peak emotion mid-use",
  "place-scale": "authority — the place proves the story",
  "reveal-clash": "curiosity — contrast happening now",
  "pov-hands": "urgency — the viewer is doing it",
  "low-punch": "authority — monumental low angle",
};

const POSITION_BY_ZONE: Record<string, { subject: string; hook: string }> = {
  "lower-left": { subject: "RIGHT", hook: "LOWER LEFT" },
  "upper-right": { subject: "LEFT", hook: "UPPER RIGHT" },
  "upper-left": { subject: "RIGHT", hook: "UPPER LEFT" },
  "lower-right": { subject: "LEFT", hook: "LOWER RIGHT" },
  "mid-band": { subject: "LOWER THIRD", hook: "MID BAND" },
  "opposite-face": { subject: "one side", hook: "opposite the face/product" },
};

const COMP_LINE: Record<string, string> = {
  tight: "16:9 extreme close, environment is a sliver, ~70% subject fill",
  center: "16:9 center hero, isolated subject, clean negative space for the hook",
  wide: "16:9 place-readable, subject smaller, architecture does work",
  cutout: "16:9 subject isolated over a real scene plate, soft natural edge",
  split: "16:9 editorial split only because composition asked for it",
  data: "16:9 photographed scene with thin process labels only",
};

export function resolveBriefColors(input: CreativeBriefInput): string[] {
  const channel = input.channelProfile?.colorPalette?.filter(Boolean) || [];
  const picked = input.selectedPalette?.colors?.filter(Boolean) || [];
  if (channel.length && !input.paletteLockedByUser) return channel.slice(0, 4);
  if (picked.length) return picked.slice(0, 4);
  if (channel.length) return channel.slice(0, 4);
  return [];
}

export function buildChannelIdentityCard(
  profile?: ChannelProfile | null,
  brand?: BrandLanguage | null
): string {
  if (!profile) return "";
  const lines = [
    `CHANNEL IDENTITY — ${profile.channelName} (lock this look):`,
    profile.colorPalette?.length
      ? `Palette: ${profile.colorPalette.slice(0, 4).join(" ")} (use these 2–4 colors; do not invent a new scheme)`
      : "",
    profile.typography
      ? `Type energy: ${profile.typography} — apply to the exact hook only; still no outline/plate/neon`
      : "",
    profile.compositionPatterns?.length
      ? `Crop grammar: ${profile.compositionPatterns.slice(0, 4).join("; ")}`
      : "",
    profile.motifs?.length ? `Motifs: ${profile.motifs.slice(0, 6).join(", ")}` : "",
    profile.summary ? `Channel summary: ${profile.summary.slice(0, 220)}` : "",
  ];
  if (brand?.tone) lines.push(`Tone: ${brand.tone}`);
  if (brand?.avoidedPhrases?.length) {
    lines.push(`Never: ${brand.avoidedPhrases.slice(0, 6).join("; ")}`);
  }
  if (brand?.approvedPhrases?.length) {
    lines.push(`Preferred phrases (hook only if user typed them): ${brand.approvedPhrases.slice(0, 4).join("; ")}`);
  }
  lines.push(
    "Stay on-brand across siblings. Staging/action/crop MAY change; palette, type energy, and motifs MUST not. Identity is grammar — never clone a prior upload."
  );
  return lines.filter(Boolean).join("\n");
}

export function buildCompactBanCard(hook: string, topic: string): string {
  const exact = hook.trim();
  return [
    "HARD BANS (compact):",
    exact
      ? `Paint this exact hook once, character-for-character: "${exact}". No other lettering.`
      : `No on-image text. Do not paint the topic ("${topic.trim()}") or any slogan.`,
    "No outline, stroke, drop shadow, glow, neon, plate, banner, or scrim on letters.",
    "No replica of any reference/liked/seed thumb (same pose + crop + place + type block).",
    "16:9 edge-to-edge. No decorative frame, border, or collage seam.",
    "No stock presenter-holds-object smile. One story beat for THIS variant only.",
    "Whites stay white — no amber/golden-hour/orange-teal wash.",
  ].join("\n");
}

export function buildCreativeBrief(input: CreativeBriefInput): CreativeBrief {
  const stagingIndex = input.stagingIndex ?? 0;
  const staging = stagingRecipeForIndex(stagingIndex);
  const camera = cameraFilterForIndex(input.cameraFilterIndex ?? stagingIndex);
  const type = fontEngineVariantForIndex(input.typographyVariantIndex ?? stagingIndex);
  const zones = POSITION_BY_ZONE[type.zoneId] || POSITION_BY_ZONE["opposite-face"];
  const hook = (input.hook || "").trim();
  const colors = resolveBriefColors(input);
  const goal = GOAL_BY_STAGING[staging.id] || "clarity — one readable click";
  const comp =
    COMP_LINE[input.composition || ""] ||
    "16:9 high isolation, phone-readable, clean negative space for the hook";
  const subject = input.topic.trim();
  const action = staging.label;
  const light = camera.label;
  const paragraph = [
    `Goal: ${goal}.`,
    `Subject: ${subject} on the ${zones.subject}.`,
    `Action: ${action} — topic-true, different from every sibling.`,
    `Comp: ${comp}.`,
    `Light: ${light}.`,
    colors.length ? `Palette: ${colors.join(" ")}.` : "",
    hook
      ? `Hook once in the ${zones.hook}: "${hook}".`
      : "No hook — image-only, zero lettering.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    goal,
    subject,
    position: zones.subject,
    action,
    composition: comp,
    light,
    colors,
    hook,
    hookZone: zones.hook,
    paragraph,
    staging,
    camera,
    siblingLock: siblingStagingLock(stagingIndex, input.variantCount ?? 4),
  };
}
