import type { TopicContext } from "@/lib/gemini-filter";
import type { StyleBrief } from "@/lib/style-intelligence";
import type { ColorPaletteOption } from "@/lib/palette-types";
import type { GenerationMediaIntelligence } from "@/lib/video-intelligence-types";
import type { BrandLanguage } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";
import type { ThumbnailFeedback } from "@/lib/inspiration";

export type GenerationContextInput = {
  topic: string;
  hook?: string;
  topicContext?: TopicContext;
  styleBrief?: StyleBrief;
  selectedPalette?: ColorPaletteOption;
  mediaIntelligence?: GenerationMediaIntelligence;
  brandLanguage?: BrandLanguage;
  channelProfile?: ChannelProfile;
  userBrief?: string;
  feedback?: ThumbnailFeedback[];
  selectedRefCount?: number;
  useOpeningFrames?: boolean;
  userMediaPhotoCount?: number;
  seedVariantLabel?: string;
  seedVariantNote?: string;
};

export type GenerationContextSummary = {
  headline: string;
  items: Array<{ label: string; value: string }>;
};

function topicContextBlock(ctx: TopicContext): string {
  return [
    "TOPIC CONTEXT (ground truth — setting and visuals must match):",
    `- What it is: ${ctx.whatItIs}`,
    `- Authentic setting: ${ctx.setting}`,
    ctx.authenticVisuals.length
      ? `- Use these visuals: ${ctx.authenticVisuals.slice(0, 6).join("; ")}`
      : "",
    ctx.rejectVisuals.length
      ? `- FORBIDDEN visuals (wrong venue/domain even if title sounds related): ${ctx.rejectVisuals.slice(0, 6).join("; ")}`
      : "",
    ctx.notes ? `- Notes: ${ctx.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Structured context block injected near the top of generation prompts. */
export function buildGenerationContextBlock(input: GenerationContextInput): string {
  const hook = (input.hook || "").trim();
  const lines: string[] = [
    "GENERATION BRIEF (assemble the thumbnail from these inputs — do not ignore research):",
    `Story to tell in 0.3s: ${input.topic.trim()}${hook ? ` · hook "${hook.toUpperCase()}"` : " · text-free (no on-image copy)"}`,
  ];

  if (input.topicContext) {
    lines.push(topicContextBlock(input.topicContext));
  }

  if (input.mediaIntelligence) {
    const m = input.mediaIntelligence;
    lines.push(
      "MEDIA STORY (primary evidence — scene must match):",
      `- Subject: ${m.primarySubject}`,
      `- Summary: ${m.summary}`,
      m.sceneTypes.length ? `- Scene types: ${m.sceneTypes.slice(0, 5).join(", ")}` : "",
      m.relatedContexts.length
        ? `- Related contexts: ${m.relatedContexts.slice(0, 4).join("; ")}`
        : "",
      m.emotionalTone ? `- Tone: ${m.emotionalTone}` : ""
    );
  }

  const userBrief = (input.userBrief || "").trim();
  if (userBrief) {
    lines.push(
      "USER CREATIVE BRIEF:",
      userBrief.length > 1200 ? `${userBrief.slice(0, 1200)}…` : userBrief
    );
  }

  if (input.styleBrief) {
    const b = input.styleBrief;
    lines.push(
      "RESEARCH STYLE (from liked/selected refs):",
      b.summary,
      b.creativeDirection ? `Direction: ${b.creativeDirection}` : "",
      b.doList.length ? `Do: ${b.doList.slice(0, 5).join("; ")}` : "",
      b.avoidList.length ? `Avoid: ${b.avoidList.slice(0, 5).join("; ")}` : ""
    );
  }

  if (input.selectedPalette?.colors?.length) {
    lines.push(
      `ACTIVE PALETTE (${input.selectedPalette.name}): ${input.selectedPalette.colors.slice(0, 5).join(", ")} — contrast-first; hex are hints not handcuffs.`
    );
  }

  const liked = input.feedback?.filter((f) => f.rating === "like") || [];
  if (liked.length) {
    lines.push(
      `LIKED REFS (${liked.length}): match their layout energy, type weight, and palette — not their unrelated subjects.`
    );
  }

  if (input.selectedRefCount && input.selectedRefCount > 0) {
    lines.push(
      `${input.selectedRefCount} research thumbnail(s) selected — study attached reference images for fonts (match weight/case/energy, no neon glow, no cropped letters) and composition. Do NOT copy the reference's outline/stroke treatment on letters — default to solid fill + soft shadow, only add a thin even outline if it renders crisply (a blotchy/uneven outline is a defect). Never reproduce a reference 1:1 — output must be a new, similar-but-distinct image. Ignore any border/frame/vignette edge or decorative doodle stroke a reference may have — never carry that into the output.`
    );
  }

  if (input.useOpeningFrames) {
    lines.push(
      "VIDEO STILLS attached — extract person/object/background that matches topic context; do not paste full frame."
    );
  }

  if (input.userMediaPhotoCount && input.userMediaPhotoCount > 0) {
    lines.push(
      `${input.userMediaPhotoCount} user photo(s) attached — choose one ingredient (face, product, or plate).`
    );
  }

  if (input.channelProfile?.summary) {
    lines.push(`CHANNEL LOOK: ${input.channelProfile.summary.slice(0, 280)}`);
  }

  if (input.brandLanguage?.approvedPhrases?.length) {
    lines.push(
      `BRAND PHRASES (hook only if user provided hook): ${input.brandLanguage.approvedPhrases.slice(0, 4).join("; ")}`
    );
  }

  if (input.seedVariantLabel || input.seedVariantNote) {
    lines.push(
      "VARIANT SEED:",
      input.seedVariantNote ||
        `Generate siblings inspired by attached generated variant "${input.seedVariantLabel}". Match its story, palette energy, and type placement — vary camera and layout.`,
      "The seed image is direction-only — improve clarity and phone-readability; do not pixel-copy."
    );
  }

  lines.push(
    "SETTING RULE: Thumbnail environment must match topic context and media evidence. Never substitute a wrong venue (e.g. outdoor track for indoor HYROX, factory sodium glow for cleanroom).",
    "ORIGINALITY RULE: References/seed are style + font guidance only. The output must never be an exact or near-1:1 replica of any single reference or seed thumbnail — always vary composition/staging/framing enough to be a new, similar-but-distinct image.",
    "NO BORDER/FRAME RULE: The image must fill the entire 16:9 canvas edge-to-edge — no colored border, picture-frame outline, vignette ring, rounded-card bezel, or decorative stroke/scribble line anywhere near the canvas edges, even if a reference or seed has one."
  );

  return lines.filter(Boolean).join("\n");
}

/** UI-facing summary of what the next generate call will use. */
export function buildGenerationContextSummary(
  input: GenerationContextInput
): GenerationContextSummary {
  const hook = (input.hook || "").trim();
  const items: Array<{ label: string; value: string }> = [];

  if (input.topicContext?.setting) {
    items.push({ label: "Setting", value: input.topicContext.setting });
  }
  if (input.mediaIntelligence?.primarySubject) {
    items.push({ label: "Subject", value: input.mediaIntelligence.primarySubject });
  }
  if (hook) {
    items.push({ label: "Hook", value: hook.toUpperCase() });
  } else {
    items.push({ label: "Text", value: "None (image-only)" });
  }
  if (input.selectedPalette?.name) {
    items.push({
      label: "Palette",
      value: input.selectedPalette.name,
    });
  } else if (input.styleBrief?.colorPalette?.length) {
    items.push({
      label: "Palette",
      value: input.styleBrief.colorPalette.slice(0, 4).join(", "),
    });
  }
  const liked = input.feedback?.filter((f) => f.rating === "like").length || 0;
  if (liked > 0) {
    items.push({ label: "Liked refs", value: String(liked) });
  }
  if (input.selectedRefCount && input.selectedRefCount > 0) {
    items.push({ label: "Selected refs", value: String(input.selectedRefCount) });
  }
  if (input.useOpeningFrames) {
    items.push({ label: "Video stills", value: "On" });
  }
  if (input.userMediaPhotoCount && input.userMediaPhotoCount > 0) {
    items.push({ label: "Media photos", value: String(input.userMediaPhotoCount) });
  }
  if (input.channelProfile?.channelName) {
    items.push({ label: "Channel", value: input.channelProfile.channelName });
  }
  if (input.seedVariantLabel) {
    items.push({ label: "Seed variant", value: input.seedVariantLabel });
  }
  if (input.styleBrief?.summary) {
    items.push({
      label: "Style",
      value:
        input.styleBrief.summary.length > 72
          ? `${input.styleBrief.summary.slice(0, 72)}…`
          : input.styleBrief.summary,
    });
  }

  const headline = hook
    ? `${input.topic.trim()} · ${hook.toUpperCase()}`
    : input.topic.trim() || "Ready to generate";

  return { headline, items };
}
