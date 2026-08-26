import type { StyleBrief } from "@/lib/style-intelligence";
import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { GenerationMediaIntelligence } from "@/lib/video-intelligence-types";
import type { BrandLanguage } from "@/lib/brand-language";
import { brandLanguagePromptBlock } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";
import { channelProfilePromptBlock } from "@/lib/channel-profile";
import type { TopicContext } from "@/lib/gemini-filter";
import {
  buildGenerationContextBlock,
  type GenerationContextInput,
} from "@/lib/generation-context";
import {
  compositionFactorVariantPrompt,
} from "@/lib/composition-factors";
import {
  FONT_ENGINE_VARIANTS,
  buildFontEnginePromptBlock,
  fontEngineVariantForIndex,
} from "@/lib/font-engine";
import { dryLessonsPromptBlock } from "@/lib/dry-learn";
import { DEFAULT_MASTER_PROMPT } from "@/lib/master-prompt";
import {
  siblingStagingLock,
  stagingRecipeForIndex,
} from "@/lib/staging-recipes";

export { DEFAULT_MASTER_PROMPT } from "@/lib/master-prompt";

/** Rotating camera looks — varied lenses/angles without warm yellow color casts. */
export const CAMERA_FILTERS = [
  {
    id: "daylight-35",
    label: "Neutral daylight 35mm",
    prompt:
      "Camera: Canon EOS R5, 35mm f/2, eye-level medium. Neutral daylight (~5600K) — clean whites, accurate skin, soft contrast, mild grain. Even window/skylight, shallow DOF. Distinct from wide flash and tight 50mm siblings. NO warm amber/yellow cast, NO golden-hour orange wash, NO tungsten glow.",
  },
  {
    id: "flash-reportage",
    label: "Clean flash reportage",
    prompt:
      "Camera: 28mm reportage, WIDE and closer to the action than a 35mm portrait. Direct on-camera flash, high contrast blacks, slight motion on secondary action. Flash is white/neutral — not yellow. No color cast, no orange rim light.",
  },
  {
    id: "cool-factory",
    label: "Cool industrial",
    prompt:
      "Camera: Fujifilm X-T5, 50mm f/1.8, TIGHTER crop than the 35mm sibling. Cool-neutral industrial light (daylight LEDs / overcast windows). Crisp edges, soft background. Prefer blue-gray or white practicals — NEVER amber factory sodium glow or yellow haze.",
  },
  {
    id: "studio-clean",
    label: "Clean studio plate",
    prompt:
      "Camera: Sony A7IV, 40mm still-life height (table/counter), not a standing portrait lens. Softbox / overhead daylight LED — even exposure, accurate neutrals, slight grain. No halation, no lens flare blobs, no warm practical spill.",
  },
  {
    id: "hard-daylight",
    label: "Hard daylight",
    prompt:
      "Camera: Nikon Z6 II, 24mm WIDE, slightly high or low — not eye-level medium. Hard midday or open-shade daylight — saturated but photographic color, crisp edges. White balance locked neutral. No sunset/golden gel, no yellow fog.",
  },
  {
    id: "overcast-muted",
    label: "Overcast muted",
    prompt:
      "Camera: 45mm, flat overcast sky, muted but color-accurate palette, soft contrast, documentary candid framing. Cool-neutral grade — not sepia, not amber.",
  },
  {
    id: "cleanroom-white",
    label: "Cleanroom white",
    prompt:
      "Camera: 85mm TIGHT, eye-level. Bright fluorescent/LED cleanroom or warehouse — whites stay white, metals stay silver/steel. Zero yellow sodium vapor look, zero orange fill.",
  },
  {
    id: "doc-handheld",
    label: "Doc handheld",
    prompt:
      "Camera: handheld documentary, 35mm, LOW angle (hip/table). Natural location light corrected to neutral WB. Real grit OK; ban amber glows, lens flares, and cinematic orange-teal grading.",
  },
] as const;

export type CameraFilter = (typeof CAMERA_FILTERS)[number];

export function cameraFilterForIndex(index: number): CameraFilter {
  return CAMERA_FILTERS[index % CAMERA_FILTERS.length];
}

/**
 * Distinct hook-type treatments per variant — sourced from the standalone
 * font engine so bans/placement stay in one place.
 */
export const TYPOGRAPHY_VARIANTS = FONT_ENGINE_VARIANTS;

export type TypographyVariant = (typeof TYPOGRAPHY_VARIANTS)[number];

export function typographyVariantForIndex(index: number): TypographyVariant {
  return fontEngineVariantForIndex(index);
}

/** Editable quality / anti-slop master prompt shown in the UI — see master-prompt.ts */
// DEFAULT_MASTER_PROMPT re-exported above from @/lib/master-prompt

const COMPOSITION_MAP: Record<string, string> = {
  center:
    "Composition: candid center hero — subject close, shot from a slight low angle, shallow depth of field, environment readable but not CGI-perfect.",
  split:
    "Composition: split comparison — two vertical panels like a real editorial layout; each side looks photographed, not symmetrically generated.",
  cutout:
    "Composition: subject cutout left or right over a real scene plate; cutout edge should feel like a clean photo edit (soft natural edge or subtle shadow) — NEVER a thick white/neon sticker outline, glow halo, or comic-panel stroke around the person.",
  data:
    "Composition: clean process/data overlay on a real photographed scene — thin lines and labels only; no glowing sci-fi screens.",
  tight:
    "Composition: extreme close crop on the hero object or the peak of the action — fill the frame. Environment is a thin sliver. Not a medium standing portrait.",
  wide:
    "Composition: wide enough to read the place. Architecture, depth, and context do work. Subject is not a centered talking-head fill.",
};

export function buildUltraPrompt(
  topic: string,
  options: {
    hook?: string;
    composition?: string;
    styleBrief?: StyleBrief;
    inspirations?: InspirationVideo[];
    feedback?: ThumbnailFeedback[];
    iterationNote?: string;
    iterationIndex?: number;
    /** Index into CAMERA_FILTERS — varies look across variants */
    cameraFilterIndex?: number;
    /** Index into TYPOGRAPHY_VARIANTS — distinct type look per variant */
    typographyVariantIndex?: number;
    /** User-editable quality direction (defaults to DEFAULT_MASTER_PROMPT) */
    masterPrompt?: string;
    /**
     * Selected composition factor ids (rule of thirds, diagonal, etc.).
     * Treated as a case-aware menu — never force-applied.
     */
    compositionFactors?: string[];
    /** Preferred factor for this variant — use only if the scene fits */
    compositionFactorHint?: string;
    /** Index into STAGING_RECIPES — exclusive story beat / action / crop */
    stagingRecipeIndex?: number;
    /** How many siblings this request is generating */
    variantCount?: number;
    /** When true, attached refs include selected key-moment / video stills */
    useOpeningFrames?: boolean;
    /** Video still provided — primary frame drives subject; refs are style-only */
    primaryVideoFrame?: boolean;
    /** Structured analysis grounded in supplied script, photos, frames, and YouTube context. */
    mediaIntelligence?: GenerationMediaIntelligence;
    /** Freeform creative brief / script from Media intelligence (works without Analyze). */
    userBrief?: string;
    /** User uploaded media photos attached as image assets. */
    userMediaPhotoCount?: number;
    /** Approved/avoided phrases and visual grammar. */
    brandLanguage?: BrandLanguage;
    /** Evidence-backed main channel visual language. */
    channelProfile?: ChannelProfile;
    /** Venue/domain grounding from research filter. */
    topicContext?: TopicContext;
    /** Active palette for context assembly. */
    selectedPalette?: GenerationContextInput["selectedPalette"];
    /** Count of user-selected research refs. */
    selectedRefCount?: number;
    /** Note when regenerating from a generated variant seed image. */
    seedVariantNote?: string;
    seedVariantLabel?: string;
  }
): string {
  // Form hook is the only source of truth — never fall back to styleBrief.suggestedHook
  // (that re-injects stale text after the user clears the Hook field).
  // Preserve the user's exact characters/case in the image prompt. QA may
  // normalize for comparison, but the image model must see the literal hook.
  const hook = (options.hook || "").trim();
  const filter = cameraFilterForIndex(options.cameraFilterIndex ?? 0);
  const typeVariant = typographyVariantForIndex(options.typographyVariantIndex ?? 0);
  const stagingIndex = options.stagingRecipeIndex ?? options.cameraFilterIndex ?? 0;
  const staging = stagingRecipeForIndex(stagingIndex);
  const quality =
    (options.masterPrompt || "").trim() || DEFAULT_MASTER_PROMPT;

  const contextBlock = buildGenerationContextBlock({
    topic,
    hook: options.hook,
    topicContext: options.topicContext,
    styleBrief: options.styleBrief,
    selectedPalette: options.selectedPalette,
    mediaIntelligence: options.mediaIntelligence,
    brandLanguage: options.brandLanguage,
    channelProfile: options.channelProfile,
    userBrief: options.userBrief,
    feedback: options.feedback,
    selectedRefCount: options.selectedRefCount,
    useOpeningFrames: options.useOpeningFrames,
    userMediaPhotoCount: options.userMediaPhotoCount,
    seedVariantLabel: options.seedVariantLabel,
    seedVariantNote: options.seedVariantNote,
  });

  const lines = [
    quality,
    contextBlock,
    filter.prompt,
    buildFontEnginePromptBlock({
      hook: options.hook || "",
      variantIndex: options.typographyVariantIndex ?? 0,
    }),
    dryLessonsPromptBlock(),
    typeVariant.prompt,
    `Topic: ${topic.trim()}`,
    siblingStagingLock(stagingIndex, options.variantCount ?? 4),
    staging.prompt,
    "SUBJECT ACTIVITY (required and topic-true): This variant MUST show a topic-relevant action or staging that is different from every sibling. Inspect attached selected/liked refs and the style brief for observed actions, then ADAPT that energy into THIS recipe — do not clone the same presenter-holds-object pose. Never invent an unrelated generic pose (random walking, pointing at nothing). If refs only show one repeated pose, break it with this recipe's beat.",
    "VARIANT DIVERSITY (hard): Siblings must differ in ACTION, CROP SCALE, CAMERA HEIGHT, and PLACE. Type treatment, palette, and framing also change. Reusing the same font layout, the same standing-presenter pose, or the same object-on-board kitchen plate across variants = FAIL.",
  ];

  if (options.styleBrief) {
    lines.push(
      "ACTION/POSE EVIDENCE FROM RESEARCH (use only if it clearly supports an activity):",
      `Emotional beat: ${options.styleBrief.emotionalHook}`,
      `Creative direction: ${options.styleBrief.creativeDirection}`,
      options.styleBrief.textPatterns.length
        ? `Observed text/story patterns: ${options.styleBrief.textPatterns.slice(0, 5).join("; ")}`
        : "",
      options.styleBrief.doList.length
        ? `Relevant observed directions: ${options.styleBrief.doList.slice(0, 5).join("; ")}`
        : ""
    );
  }

  if (options.compositionFactorHint || options.compositionFactors?.length) {
    lines.push(
      compositionFactorVariantPrompt(
        options.compositionFactorHint,
        options.compositionFactors?.length
          ? options.compositionFactors
          : options.compositionFactorHint
            ? [options.compositionFactorHint]
            : []
      )
    );
  }

  const userBrief = (options.userBrief || "").trim();
  if (userBrief) {
    lines.push(
      "USER BRIEF (follow this creative direction for the thumbnail — subject, scene, text ideas, mood):",
      userBrief.length > 2500 ? `${userBrief.slice(0, 2500)}…` : userBrief
    );
  }

  const photoCount = options.userMediaPhotoCount || 0;
  if (photoCount > 0) {
    lines.push(
      `USER MEDIA PHOTOS (${photoCount}): Attached "Media photo" images are optional ingredients — not a forced full-frame paste.`,
      "From them, pick the single best contribution for THIS topic/hook: (A) person/face likeness, OR (B) product/object, OR (C) environment/background plate. Crop, reframe, and restage as a thumbnail.",
      "Keep likeness/product identity recognizable when chosen. Ignore unused photos. Research thumbs stay style-only (layout/palette/type)."
    );
  }

  if (options.mediaIntelligence) {
    const media = options.mediaIntelligence;
    lines.push(
      "MEDIA INTELLIGENCE (evidence to guide the story — adapt freely into a strong thumb; do not invent unsupported people/products):",
      `Content summary: ${media.summary}`,
      `Audience: ${media.audience}`,
      `Primary subject: ${media.primarySubject}`,
      media.storyBeats.length ? `Story beats: ${media.storyBeats.slice(0, 6).join(" → ")}` : "",
      media.sceneTypes.length ? `Observed scene types: ${media.sceneTypes.join(", ")}` : "",
      `Visual depth cues: foreground=${media.depth.foreground}; midground=${media.depth.midground}; background=${media.depth.background}; focal=${media.depth.focalSubject}`,
      media.thumbnailOpportunities.length
        ? `Thumbnail opportunities: ${media.thumbnailOpportunities.join("; ")}`
        : "",
      `Suggested colors from media (prefer for harmony, override if unreadable): ${media.colors.dominant.slice(0, 8).join(", ")}; bg ${media.colors.background}; text ${media.colors.text}`,
      `Evidence confidence: ${media.confidence.level} (${media.confidence.score}%). ${media.sourceSummary}`,
      media.confidence.limitations.length
        ? `EVIDENCE LIMITS: ${media.confidence.limitations.join("; ")}`
        : ""
    );
  }

  if (options.primaryVideoFrame) {
    lines.push(
      "KEY FRAME MODE: The first attached image is a selected still from the user's video (YouTube key moment or uploaded clip).",
      "Treat it as a SOURCE PLATE: extract the best person, object, or background for the topic — recompose into a phone-readable thumbnail. You may crop tightly and change framing.",
      "Do NOT require a 1:1 paste of the entire frame. Do NOT replace the real person/product with a different invented one. Research thumbs = palette/type/layout only."
    );
  } else if (options.useOpeningFrames) {
    lines.push(
      "VIDEO STILL MODE: Attached frames are key-moment candidates from the user's video (YouTube samples across the runtime, or uploaded clips). Prefer the clearest hero subject or object that matches the topic — not limited to the first 1–2 seconds."
    );
  }

  if (options.iterationNote) {
    lines.push(
      `ITERATION ${options.iterationIndex || 2}: Refine the previous thumbnail.`,
      `User edit request: ${options.iterationNote}`,
      "Keep the camera-real documentary look. Apply the edit precisely — do not add AI polish."
    );
  }

  if (hook) {
    lines.push(
      `HARD TEXT RULE: Paint this exact hook character-for-character, exactly once: "${hook}"`,
      "Do not translate, paraphrase, autocorrect, truncate, duplicate, or invent text. No lettering beyond the exact hook.",
      "Gemini owns both glyph rendering and placement. Choose x/y dynamically from clean negative space with ≥5% edge margins; never cover faces, eyes, or the primary product silhouette.",
      "One line preferred, two lines maximum. Shrink or wrap the complete hook to fit; never crop or truncate. Use medium-bold named sans styling, deliberate 0.06–0.10em open tracking, and solid flat fill with no stroke, outline, drop shadow, glow, plate, banner, or scrim."
    );
  } else {
    // Empty Hook field = intentional. Never invent on-thumb copy from the video title / topic.
    lines.push(
      "NO HOOK TEXT (critical): The Hook field is empty. Do NOT put any words, titles, captions, or logos on the thumbnail.",
      `FORBIDDEN: using the Topic/video title ("${topic.trim()}") or any paraphrase of it as on-image text. No invented slogans either.`,
      "Image-only composition — subject, color, and framing carry the click. Ignore TYPE VARIANT lettering instructions when no hook is provided."
    );
  }

  if (options.brandLanguage) {
    lines.push(brandLanguagePromptBlock(options.brandLanguage));
  }

  if (options.channelProfile) {
    lines.push(channelProfilePromptBlock(options.channelProfile));
  }

  if (options.styleBrief) {
    lines.push(`Style from research: ${options.styleBrief.summary}`);
    lines.push(`Direction: ${options.styleBrief.creativeDirection}`);
    if (options.styleBrief.colorPalette?.length) {
      const colorLine = options.primaryVideoFrame
        ? `Color direction (harmonize with key frame; prioritize subject readability over exact hex locks): ${options.styleBrief.colorPalette
            .slice(0, 5)
            .join(", ")}`
        : options.mediaIntelligence
          ? `Color direction (${options.mediaIntelligence.colors.source === "measured" ? "prefer these media-measured swatches when they stay readable" : "soft palette hint"}): ${options.styleBrief.colorPalette
              .slice(0, 5)
              .join(", ")}`
          : `Color direction from liked thumbs (match energy, not pixel-perfect locks): ${options.styleBrief.colorPalette
              .slice(0, 5)
              .join(", ")}`;
      lines.push(colorLine);
    }
    if (options.styleBrief.typography) {
      if (hook) {
        lines.push(
          `REFERENCE TYPOGRAPHY from selected/liked thumbs (study & adapt — case/placement energy ONLY; ignore outline/stroke/shadow/heavy-black treatments): ${options.styleBrief.typography}`,
          `Use that reference language only to paint the exact hook "${hook}" once, then apply this variant's named font target and dynamic negative-space placement. No neon/glow, stroke/outline/drop shadow/plate, or ultra-heavy weight.`
        );
      } else {
        lines.push(
          `REFERENCE TYPOGRAPHY (study only — do NOT render any text): ${options.styleBrief.typography}`,
          "Hook is empty — keep the frame text-free. Do not invent lettering from references or the topic."
        );
      }
    }
    lines.push("Mood: clear, high-contrast YouTube energy — confident, not muddy or over-filtered.");
    if (options.styleBrief.avoidList.length) {
      lines.push(`AVOID: ${options.styleBrief.avoidList.join("; ")}`);
    }
  }

  if (options.composition && COMPOSITION_MAP[options.composition]) {
    lines.push(COMPOSITION_MAP[options.composition]);
  }

  const liked = options.feedback?.filter((f) => f.rating === "like") || [];
  const disliked = options.feedback?.filter((f) => f.rating === "dislike") || [];

  if (liked.length) {
    const likedLines = liked.map((f, i) => {
      const why = (f.comment || "").trim();
      return why
        ? `${i + 1}. "${f.title}" by ${f.channel} — why liked: ${why.slice(0, 140)}`
        : `${i + 1}. "${f.title}" by ${f.channel}`;
    });
    lines.push(
      `Liked references (${liked.length}) — study each attached sample + note; custom media photos take priority over these:`,
      ...likedLines
    );
    if (options.primaryVideoFrame) {
      lines.push(
        "Liked refs = palette + typography + layout energy only — do NOT override primary video frame; never clone their crop/pose."
      );
    } else if (hook) {
      lines.push(
        `Borrow FONT ENERGY (weight, case, open tracking), palette mood, and layout rhythm from liked samples. Invent a NEW scene for topic + hook "${hook}". Remaking any liked thumb (same pose/crop/background/text placement) = FAIL.`
      );
    } else {
      lines.push(
        "Liked refs = palette + layout rhythm + topic-relevant energy only — NO on-image text, NO cloned pose/crop."
      );
    }
  }

  if (disliked.length) {
    const avoid = disliked
      .map((f) => {
        const note = f.comment ? ` because: ${f.comment}` : "";
        return `"${f.title}"${note}`;
      })
      .join("; ");
    lines.push(`Do NOT resemble user-disliked thumbnails: ${avoid}`);
  }

  if (options.inspirations?.length) {
    const refs = options.inspirations
      .slice(0, 6)
      .map((v) => `"${v.title}" (${v.channel})`)
      .join("; ");
    if (options.primaryVideoFrame) {
      lines.push(
        `Research titles (text-only DNA — palette/type hints; never recreate these thumbs): ${refs}`
      );
    } else {
      lines.push(
        `Research titles (inspiration DNA only — invent original staging; never recreate these competitors' crops, poses, or backgrounds): ${refs}`,
        "COPYCAT BAN: If the output could be mistaken for one of the research/liked thumbs at a glance, it fails. Change camera angle, subject staging, and environment enough to read as a new original."
      );
    }
  } else if (
    !options.mediaIntelligence &&
    !options.primaryVideoFrame &&
    !options.useOpeningFrames &&
    !options.iterationNote &&
    !userBrief &&
    photoCount === 0
  ) {
    lines.push(
      hook
        ? `SCRATCH MODE: No reference thumbnails provided. Invent a strong original YouTube thumbnail from the topic — clear subject, high contrast, 16:9 documentary energy — and paint only the exact hook "${hook}" in clean negative space. Do not copy a known channel's art.`
        : "SCRATCH MODE: No reference thumbnails and no hook. Invent a strong original YouTube thumbnail from the topic alone — clear subject, high contrast, 16:9 documentary energy, ZERO on-image text. Do not copy a known channel's art or put the topic title on the image."
    );
  } else if (
    !options.inspirations?.length &&
    (userBrief || photoCount > 0) &&
    !options.mediaIntelligence
  ) {
    lines.push(
      "SCRATCH + USER MEDIA: Build an original thumbnail from the topic, user brief, and/or attached media photos — no research references required."
    );
  }

  return lines.filter(Boolean).join("\n");
}
