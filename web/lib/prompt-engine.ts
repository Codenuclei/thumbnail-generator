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

/** Rotating camera looks — varied lenses/angles without warm yellow color casts. */
export const CAMERA_FILTERS = [
  {
    id: "daylight-35",
    label: "Neutral daylight 35mm",
    prompt:
      "Camera: Canon EOS R5, 35mm f/2. Neutral daylight white balance (~5600K) — clean whites, accurate skin, soft contrast, mild grain. Even window/skylight, shallow DOF. NO warm amber/yellow cast, NO golden-hour orange wash, NO tungsten glow.",
  },
  {
    id: "flash-reportage",
    label: "Clean flash reportage",
    prompt:
      "Camera: 28mm reportage, direct on-camera flash, high contrast blacks, slight motion on secondary action. Flash is white/neutral — not yellow. No color cast, no orange rim light.",
  },
  {
    id: "cool-factory",
    label: "Cool industrial",
    prompt:
      "Camera: Fujifilm X-T5, 50mm f/1.8. Cool-neutral industrial light (daylight LEDs / overcast windows). Crisp edges, soft background. Prefer blue-gray or white practicals — NEVER amber factory sodium glow or yellow haze.",
  },
  {
    id: "studio-clean",
    label: "Clean studio plate",
    prompt:
      "Camera: Sony A7IV, 40mm. Softbox / overhead daylight LED look — even exposure, accurate neutrals, slight grain. No halation, no lens flare blobs, no warm practical spill.",
  },
  {
    id: "hard-daylight",
    label: "Hard daylight",
    prompt:
      "Camera: Nikon Z6 II, 24mm. Hard midday or open-shade daylight — saturated but photographic color, crisp edges. White balance locked neutral. No sunset/golden gel, no yellow fog.",
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
      "Camera: 35mm eye-level. Bright fluorescent/LED cleanroom or warehouse — whites stay white, metals stay silver/steel. Zero yellow sodium vapor look, zero orange fill.",
  },
  {
    id: "doc-handheld",
    label: "Doc handheld",
    prompt:
      "Camera: handheld documentary, 35mm, eye-level or slight low angle. Natural location light corrected to neutral WB. Real grit OK; ban amber glows, lens flares, and cinematic orange-teal grading.",
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

/** Editable quality / anti-slop master prompt shown in the UI. */
export const DEFAULT_MASTER_PROMPT = [
  "YouTube thumbnail, 16:9 landscape (1280×720 intent). No watermark, no channel logo unless supplied.",
  "QUALITY BAR: Compete with top YouTube thumbnails — one dominant focal point, extreme phone-readability at ~120px wide, high subject/background separation, intentional contrast.",
  "TYPOGRAPHY (critical): Study hook lettering on any attached reference thumbs (weight, case, placement) — but NEVER copy any outline/stroke from a reference. Match font ENERGY closely — same general family/weight/case feel — then render it as a fresh, similar (never identical) interpretation using THIS variant's distinct type treatment — bold condensed display sans (Impact / Arial Black / Bebas Neue / Montserrat Black / Anton energy). ALL CAPS or Title Case for 2–5 words max. ALWAYS solid flat-color fill + a soft per-letter drop shadow for lift — that is the ONLY permitted treatment. ABSOLUTE BAN on outlines/strokes: no outline of ANY width around letters — not thick, not thin, not 'clean' — zero stroke, ever. Never thin, script, serif body, or tiny paragraphs. FORBIDDEN TEXT STYLE: any outline/stroke around glyphs, neon/glow tube-light letters, neon outline halos, cyberpunk glow text, or any glowing-sign lettering effect — text must read as solid, matte, printed display type. Variants must NOT share the same type look.",
  "TEXT INTEGRITY (hard ban — reject messy type): Render the hook EXACTLY once as clean, sharp glyphs. FORBIDDEN: overlapping/colliding letters, mashed tracking, double-printed or ghosted/echo layers of the same word, smeared or melted strokes, stray fragments floating above glyphs, duplicated letter endings (e.g. AMAZONON), misspellings, extra characters, warped or stacked outlines that look like a glitch. Keep clear air between every letter so each glyph is fully legible at phone size. Prefer comfortable tracking over ultra-tight. One solid fill only, ZERO outline — never a second offset copy of the word.",
  "SPELLING ACCURACY (hard ban on typos — verify before finalizing): Reproduce the hook text character-for-character exactly as given — same letters, same order, same word count. FORBIDDEN: dropped letters, added letters, swapped/transposed letters, merged words, split words, near-phonetic guesses, or auto-corrected substitutions. If the hook is long, shrink the type size or wrap to a second line rather than truncate, abbreviate, or misspell any word. Double-check every word reads as a real, correctly spelled match of the input before finishing.",
  "NO EXCESS TEXT / NO DUPLICATE GENERATION (hard ban): Render ONLY the specified hook, in ONE place, ONE time. Do NOT invent extra captions, subtitles, taglines, timestamps, fake channel names/handles, fake subscribe buttons, fake view/like counts, or any other on-image text beyond the hook. Do NOT tile, mirror, or repeat the main subject/scene into multiple copies or a collage/grid layout — exactly one dominant subject in one continuous scene.",
  "NO OUTLINE/STROKE ON TEXT (hard ban — this is the #1 recurring defect to avoid): ZERO outline or stroke around hook letters — no thick, no thin, no clean, no blotchy, none. Solid flat fill + soft per-letter drop shadow is the ONLY treatment. Never trace any line around glyphs and never let anything bleed into a rectangular or rounded border shape around the word or the canvas.",
  "NO BACKGROUND PATCH BEHIND TEXT (hard ban): Never place the hook on top of a solid or semi-transparent color box, bar, ribbon, banner, chip, pill, lower-third strip, or rounded rectangle 'plate'. Text must sit DIRECTLY on the photo — pick placement over naturally dark or light parts of the scene (or add a soft drop shadow / subtle glow falloff only, never a hard-edged rectangle) to keep it readable. A colored block behind the lettering is always wrong for this format, even if a reference thumbnail uses one.",
  "TEXT PLACEMENT (hard ban — no incomplete placement): Hook text in the clearest negative space; never cover faces/eyes or the product's readable silhouette. The ENTIRE hook must sit fully inside the 16:9 frame with safe margin on every side — FORBIDDEN: letters or words cut off/cropped by the canvas edge, text bleeding off-frame, partially rendered or half-visible words, or a hook that only half-fits and trails off. If it doesn't fit cleanly, shorten the line or drop to a second line rather than crop it. One line preferred; two lines max.",
  "NO BORDER / FRAME (hard ban — reject even if a reference has one): The photo must fill the entire 16:9 canvas edge-to-edge with zero decorative framing. FORBIDDEN: a colored border/frame around the outside edge, a picture-frame or comic-panel outline, a rounded-corner card/bezel look, a vignette ring, a drop-shadow box around the whole image, browser-chrome/screenshot bezels, or any stroke/line running along the canvas edges. Also forbidden: random decorative scribble/doodle stroke marks, hand-drawn underline squiggles, or comic-style speed lines scattered across the scene that are not part of the hook text itself. If a reference/liked thumbnail happens to have a border or frame, that is exactly the one thing to leave out — study its fonts/color/layout only, never its framing.",
  "CAMERA: Real-lens language (35–50mm equivalent, shallow DOF when it helps). Prefer photographic light over CGI. Mild grain OK; no plastic skin, no neon HUD, no Unreal/Octane look.",
  "WHITE BALANCE (critical): Neutral daylight / cool-LED lighting only. Whites must stay white; metals silver/steel. FORBIDDEN: odd yellow/amber/orange glow, golden-hour wash, tungsten spill, sodium-vapor haze, sepia cast, orange rim lights, cinematic orange-teal grade, lens-flare blobs.",
  "COMPOSITION: One story beat. Face or hero object large. Environment supports topic — do not clutter with unrelated props. Apply classic framing factors ONLY when they fit the scene; never force them.",
  "NO SPLIT / NO COLLAGE (hard ban unless the composition instruction explicitly says split): The frame must be ONE continuous photographic scene edge-to-edge. FORBIDDEN by default: vertical/horizontal split panels, before/after diptychs, two different photos joined by a hard seam, multi-panel grids, or collage layouts. If a TYPE or camera variant conflicts with this, keep the single continuous scene.",
  "COLOR: Punchy but intentional — 2–4 dominant colors, strong subject vs background contrast. Avoid muddy mid-grays, random neon rainbows, and forcing measured swatches when they hurt readability.",
  "USER MEDIA RULE: If photos/frames are attached, intelligently choose ONE primary contribution — a person likeness, a product/object, OR a background/plate — whichever best serves the topic and hook. Do NOT paste the entire source frame as the thumbnail unless it already is a strong thumb. Do NOT invent faces/products that contradict supplied media.",
  "NO 1:1 REPLICA RULE (hard ban): Reference/liked/seed thumbnails are inspiration for fonts, palette, and layout ENERGY only — never a template to reproduce. The final image must NEVER be an exact, near-identical, or pixel-level copy of any single reference thumbnail (same subject pose, same crop, same background, same text placement all at once counts as a replica). Change at least the composition, subject staging, camera angle, or framing enough that it reads as a new, original thumbnail clearly inspired by — not cloned from — the references. This applies even when only one reference/seed image is attached.",
  "ANTI-AI-SLOP: No hyperrealistic/8k/masterpiece bait, no glowing sci-fi UI, no perfect symmetry, no stock-photo smiles, no unrelated celebrity faces, no mystery yellow glow on factories/cleanrooms.",
  "Professional click energy: curiosity + clarity, zero cheap spam, zero illegible text.",
].join("\n");

const COMPOSITION_MAP: Record<string, string> = {
  center:
    "Composition: candid center hero — subject close, shot from a slight low angle, shallow depth of field, environment readable but not CGI-perfect.",
  split:
    "Composition: split comparison — two vertical panels like a real editorial layout; each side looks photographed, not symmetrically generated.",
  cutout:
    "Composition: subject cutout left or right over a real scene plate; cutout edge should feel like a clean photo edit (soft natural edge or subtle shadow) — NEVER a thick white/neon sticker outline, glow halo, or comic-panel stroke around the person.",
  data:
    "Composition: clean process/data overlay on a real photographed scene — thin lines and labels only; no glowing sci-fi screens.",
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
  const hook = (options.hook || "").trim().toUpperCase();
  const filter = cameraFilterForIndex(options.cameraFilterIndex ?? 0);
  const typeVariant = typographyVariantForIndex(options.typographyVariantIndex ?? 0);
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
    "VARIANT DIVERSITY: This image MUST look different from sibling variants — different type treatment, framing decision, and camera look. Do not reuse the same font layout across variants.",
  ];

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
      `Bold hook text (phone-readable, 2–5 words) — spell EXACTLY, letter-for-letter, no extra/missing/swapped letters, no auto-correcting to a different word: "${hook}"`,
      "Render the hook using THIS variant's type treatment above. Match lettering energy from attached reference thumbs when present, but keep this variant's distinct font/layout so siblings look different.",
      "HARD TEXT RULE: One clean pass of the words only, rendered exactly ONCE in ONE place. No overlapping letters, no ghost/echo duplicate layer, no melted strokes, no duplicated endings, no second copy of the hook anywhere else in frame, no extra invented captions/subtitles/labels. Every character must be separate, readable, and correctly spelled. ZERO outline/stroke around letters of any width — plain solid fill with soft per-letter drop shadow only."
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
          `REFERENCE TYPOGRAPHY from selected/liked thumbs (study & adapt — weight, case, placement ONLY, never the outline/stroke treatment): ${options.styleBrief.typography}`,
          "Ground THIS variant's type in that reference language, then apply the TYPE VARIANT above so outputs are visibly different from sibling variants. No neon/glow lettering, and keep the full hook inside the frame — no cropped or incomplete words. Clean solid fill + soft shadow ONLY — zero outline/stroke of any width, even if the reference uses one."
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
    const likedRefs = liked
      .map((f) => {
        const note = f.comment ? ` (user note: ${f.comment})` : "";
        return `"${f.title}" by ${f.channel}${note}`;
      })
      .join("; ");
    if (options.primaryVideoFrame) {
      lines.push(
        `Liked references (palette + typography + layout hints only — do NOT override primary video frame): ${likedRefs}`
      );
    } else if (hook) {
      lines.push(
        `STRONGLY match patterns from user-liked references — especially hook FONTS (weight, case) and layout: ${likedRefs}`,
        "Match the font energy closely but render it fresh — no neon/glow text, no cropped/incomplete lettering, no copied outline/stroke treatment (default to clean solid fill + soft shadow), and the final image must not be a 1:1 replica of any single liked reference."
      );
    } else {
      lines.push(
        `Liked references (palette + layout only — NO on-image text): ${likedRefs}`
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
        `Research thumbnails (palette/typography/layout reference only — read their hook fonts): ${refs}`
      );
    } else {
      lines.push(
        `Additional references (layout/palette/fonts only — copy type energy, not subjects): ${refs}`
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
        ? "SCRATCH MODE: No reference thumbnails provided. Invent a strong original YouTube thumbnail from the topic + provided hook — bold phone-readable text, clear subject, high contrast, 16:9 documentary energy. Do not copy a known channel's art."
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
