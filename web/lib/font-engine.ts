/**
 * YouTube thumbnail font engine — standalone typography module.
 *
 * Image models cannot load TTFs, but Gemini can paint typography from precise
 * named-family references. This engine:
 *  1. Defines allowed font references + placement zones
 *  2. Emits the exact prompt block the generator must follow
 *  3. Validates hook hygiene before generation
 *  4. Delegates post-render QA to thumbnail-verify (vision OCR + defect rubric)
 *
 * Keep HARD_BANS / ALLOWED_TREATMENT in sync with
 * `.cursor/skills/youtube-thumbnail-typography/` and thumbnail-verify.ts.
 */

import {
  verifyThumbnailImage,
  type ThumbnailVerification,
} from "@/lib/thumbnail-verify";

/**
 * Typography ownership feature flags.
 *
 * Keep the compositor/orchestrator implementation available for experiments,
 * but production defaults to Gemini painting the exact hook in the image.
 */
export const GEMINI_PAINTS_HOOK_TEXT = true;
export const POST_RENDER_TYPOGRAPHY_ENABLED = false;

/** Accurate named-family references Gemini should approximate. */
export const YOUTUBE_DISPLAY_FONTS = [
  {
    id: "sans-bold",
    label: "Montserrat SemiBold / Bold",
    energy: "Montserrat SemiBold or Montserrat Bold — medium-bold, crisp, geometric, phone-readable",
  },
  {
    id: "bebas",
    label: "Bebas Neue",
    energy: "Bebas Neue — clean condensed display sans with open, readable capitals",
  },
  {
    id: "anton",
    label: "Anton",
    energy: "Anton — strong clean display sans presence, but never simulated as ultra-heavy or black",
  },
  {
    id: "editorial",
    label: "Oswald SemiBold",
    energy: "Oswald SemiBold — premium documentary condensed sans, clean and phone-readable",
  },
  {
    id: "stacked",
    label: "Helvetica Neue Bold",
    energy: "Helvetica Neue Bold — clean editorial sans; hierarchy via size, never decoration",
  },
] as const;

export type YoutubeDisplayFontId = (typeof YOUTUBE_DISPLAY_FONTS)[number]["id"];

/** 16:9 placement zones — avoid bottom-right duration chip. */
export const PLACEMENT_ZONES = [
  {
    id: "lower-left",
    label: "Lower left",
    prompt:
      "Prefer the lower-left only when it is the clearest negative space. Keep ≥5% safe margin from every edge. Subject/face stays clear on the right.",
  },
  {
    id: "upper-right",
    label: "Upper right",
    prompt:
      "Prefer the upper-right only when it is the clearest negative space. Keep ≥5% safe margin. Subject stays clear on the left/lower frame.",
  },
  {
    id: "upper-left",
    label: "Upper left",
    prompt:
      "Prefer the upper-left only when it is the clearest negative space. Keep ≥5% safe margin. Never collide with a face or product silhouette.",
  },
  {
    id: "lower-right",
    label: "Lower right (careful)",
    prompt:
      "Place the hook in the lower-right only if that is the clearest negative space — leave extra room for YouTube's duration chip (avoid extreme bottom-right corner).",
  },
  {
    id: "mid-band",
    label: "Mid band",
    prompt:
      "Place a short wide hook across the mid-frame horizontal band on naturally dark or light photo pixels — never over eyes or the product's readable silhouette.",
  },
  {
    id: "opposite-face",
    label: "Opposite face",
    prompt:
      "Place the hook in the clearest negative space OPPOSITE the largest face/product. Never cover eyes, mouth, or the product silhouette.",
  },
] as const;

export type PlacementZoneId = (typeof PLACEMENT_ZONES)[number]["id"];

/** Absolute bans — product law. Do not soften. */
export const HARD_BANS = [
  "ZERO outline/stroke around letters — not thick, not thin, not clean",
  "NO color box / bar / banner / pill / scrim / dimmed strip behind the hook",
  "NO neon / glow tube / cyberpunk lettering",
  "NO ghost/echo double-print of the same word",
  "NO cropped letters or text bleeding off the 16:9 frame",
  "NO invented captions beyond the exact hook",
  "NO collage / hard split seams unless composition explicitly says split",
  "NO thin, script, serif body, or handwritten lettering",
  "NO drop shadow, glow, border, frame, or ultra-heavy/black weight",
  "NO Impact Black or Arial Black styling",
  "Use deliberate open tracking: approximately 0.06–0.10em; never tight, mashed, or touching",
] as const;

/** Required treatment for Gemini-painted type (and any future compositor mode). */
export const ALLOWED_TREATMENT =
  "solid flat-color fill with deliberate 0.06–0.10em open letter spacing; no stroke, outline, drop shadow, glow, border, plate, banner, or scrim";

export const DEFAULT_TRACKING_EM = 0.08;
export const DEFAULT_FONT_WEIGHT = 700;

export type CompositeTextOptions = {
  hook: string;
  zoneId?: PlacementZoneId;
  width?: number;
  height?: number;
  fill?: string;
  fontFamily?: string;
  fontWeight?: number;
  trackingEm?: number;
  /** Optional only — compositor defaults to no shadow. */
  shadow?: boolean;
  /** Embedded @font-face CSS for Sharp/librsvg. */
  fontFaceCss?: string;
  /**
   * Fractional draw box from the placement orchestrator (0–1 of canvas).
   * When set with honorPlacementBox, skips busyness zone re-picking.
   */
  placementBox?: {
    x: number;
    y: number;
    w: number;
    h: number;
    align: "start" | "end";
  };
  /** Prefer wrapping to this many lines when the hook is long. */
  preferredLines?: 1 | 2;
  /** Honour placementBox as-is (already clamped by master control). */
  honorPlacementBox?: boolean;
};

/** Build an SVG overlay; Sharp composites this after Gemini returns the plate. */
export function buildHookOverlaySvg(options: CompositeTextOptions): string {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const hook = options.hook.replace(/\s+/g, " ").trim().toUpperCase();
  const words = hook.split(" ").filter(Boolean);
  const zone = PLACEMENT_ZONES.find((z) => z.id === options.zoneId) || PLACEMENT_ZONES[0];
  const fontSize = Math.max(42, Math.min(120, Math.round(width * (words.length > 3 ? 0.07 : 0.09))));
  const x = zone.id.includes("right") ? width * 0.94 : width * 0.06;
  const anchor = zone.id.includes("right") ? "end" : "start";
  const y = zone.id.includes("upper") ? height * 0.18 : zone.id.includes("mid") ? height * 0.55 : height * 0.84;
  const lines =
    words.length > 3
      ? [
          words.slice(0, Math.ceil(words.length / 2)).join(" "),
          words.slice(Math.ceil(words.length / 2)).join(" "),
        ]
      : [hook];
  // Always improved open tracking — never ultra-tight.
  const tracking = Math.max(0.04, options.trackingEm ?? DEFAULT_TRACKING_EM);
  const weight = Math.min(700, options.fontWeight ?? DEFAULT_FONT_WEIGHT);
  const shadow = options.shadow ? `filter="url(#soft-shadow)"` : "";
  const shadowDef = options.shadow
    ? `<filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="3" dy="4" stdDeviation="3" flood-color="#000" flood-opacity=".22"/></filter>`
    : "";
  const style = options.fontFaceCss
    ? `<style type="text/css"><![CDATA[${options.fontFaceCss}]]></style>`
    : "";
  const text = lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * fontSize * 1.12}" text-anchor="${anchor}" font-family="${options.fontFamily || "Arial, Helvetica, sans-serif"}" font-size="${fontSize}px" font-weight="${weight}" letter-spacing="${tracking}em" fill="${options.fill || "#FFFFFF"}" ${shadow}>${escapeXml(line)}</text>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${style}<defs>${shadowDef}</defs>${text}</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] || char);
}

/**
 * Distinct type looks per variant — always zero-outline, on-photo placement.
 * Indices align with prompt-engine camera/type rotation.
 */
export const FONT_ENGINE_VARIANTS = [
  {
    id: "sans-lower-left",
    fontId: "sans-bold" as YoutubeDisplayFontId,
    zoneId: "lower-left" as PlacementZoneId,
    label: "Clean bold lower-left",
    prompt:
      "TYPE VARIANT — paint the exact hook in Montserrat SemiBold/Bold style, medium-bold, with deliberate 0.06–0.10em open tracking. Prefer lower-left negative space only if the scene supports it.",
  },
  {
    id: "bebas-upper-right",
    fontId: "bebas" as YoutubeDisplayFontId,
    zoneId: "upper-right" as PlacementZoneId,
    label: "Bebas upper-right stack",
    prompt:
      "TYPE VARIANT — paint the exact hook in Bebas Neue style with deliberate 0.06–0.10em open tracking. Prefer the upper-right third only when it is clear negative space.",
  },
  {
    id: "anton-mid",
    fontId: "anton" as YoutubeDisplayFontId,
    zoneId: "mid-band" as PlacementZoneId,
    label: "Anton mid-band",
    prompt:
      "TYPE VARIANT — paint the exact hook in Anton style at medium-bold visual weight with deliberate 0.06–0.10em open tracking. Use a mid-frame band only when it does not cover the subject.",
  },
  {
    id: "compact-upper-left",
    fontId: "editorial" as YoutubeDisplayFontId,
    zoneId: "upper-left" as PlacementZoneId,
    label: "Compact upper-left",
    prompt:
      "TYPE VARIANT — paint the exact hook in Oswald SemiBold style with deliberate 0.06–0.10em open tracking. Prefer upper-left only when it is clear negative space.",
  },
  {
    id: "editorial-opposite",
    fontId: "editorial" as YoutubeDisplayFontId,
    zoneId: "opposite-face" as PlacementZoneId,
    label: "Editorial opposite face",
    prompt:
      "TYPE VARIANT — paint the exact hook in Helvetica Neue Bold or Oswald SemiBold style with deliberate 0.06–0.10em open tracking, dynamically placed opposite the face/product.",
  },
  {
    id: "stacked-lower",
    fontId: "stacked" as YoutubeDisplayFontId,
    zoneId: "lower-left" as PlacementZoneId,
    label: "Stacked power lower",
    prompt:
      "TYPE VARIANT — paint the exact hook in Montserrat SemiBold/Bold style. One line preferred; use two lines only if needed to fit. Keep deliberate 0.06–0.10em open tracking.",
  },
] as const;

export type FontEngineVariant = (typeof FONT_ENGINE_VARIANTS)[number];

export function fontEngineVariantForIndex(index: number): FontEngineVariant {
  return FONT_ENGINE_VARIANTS[index % FONT_ENGINE_VARIANTS.length];
}

export type HookValidation = {
  ok: boolean;
  normalized: string;
  wordCount: number;
  errors: string[];
};

/** Pre-generation hygiene — cheap, no API. */
export function validateHookText(hook: string): HookValidation {
  const normalized = hook
    .toUpperCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  // Empty hook is valid (image must be text-free).
  if (!normalized) {
    return { ok: true, normalized: "", wordCount: 0, errors: [] };
  }

  const words = normalized.split(" ").filter(Boolean);
  const errors: string[] = [];

  if (words.length < 2) errors.push("Hook should be at least 2 words for YouTube punch");
  if (words.length > 5) errors.push("Hook must be 5 words or fewer (phone readability)");
  if (normalized.length > 48) errors.push("Hook longer than 48 characters — shorten it");
  if (/https?:|www\./i.test(normalized)) errors.push("URLs are banned on thumbnails");
  if (/[#@][A-Z0-9_]{3,}/.test(normalized) && words.length > 3) {
    errors.push("Avoid hashtag/handle spam on the hook");
  }

  return {
    ok: errors.length === 0,
    normalized,
    wordCount: words.length,
    errors,
  };
}

/**
 * Prompt block injected into image generation.
 * This is the "trained" typography brief — rules, not a fine-tuned weight file.
 */
export function buildFontEnginePromptBlock(options: {
  hook: string;
  variantIndex?: number;
  zoneId?: PlacementZoneId;
}): string {
  const hookCheck = validateHookText(options.hook);
  const variant = fontEngineVariantForIndex(options.variantIndex ?? 0);
  const zone =
    PLACEMENT_ZONES.find((z) => z.id === options.zoneId) ||
    PLACEMENT_ZONES.find((z) => z.id === variant.zoneId)!;
  const font =
    YOUTUBE_DISPLAY_FONTS.find((f) => f.id === variant.fontId) || YOUTUBE_DISPLAY_FONTS[0];

  if (!hookCheck.normalized) {
    return [
      "FONT ENGINE — NO HOOK:",
      "Do NOT render any on-image text, captions, logos, or labels.",
      "Ignore type-variant lettering instructions.",
    ].join("\n");
  }

  return [
    "FONT ENGINE (YouTube production typography — follow exactly):",
    `PAINT THIS EXACT HOOK YOURSELF, character-for-character, exactly once: "${options.hook.trim()}"`,
    "Do not translate, paraphrase, autocorrect, omit, add, duplicate, or invent characters. Render no other captions, labels, logos, watermarks, or pseudo-text.",
    `Named font target for this variant: ${font.energy}`,
    "Allowed named stylistic targets across variants: Montserrat SemiBold, Montserrat Bold, Bebas Neue, Anton, Oswald SemiBold, Helvetica Neue Bold. Use medium-bold only; never Impact Black, Arial Black, ultra-heavy, or black weight.",
    `Required treatment: ${ALLOWED_TREATMENT}`,
    `HARD BANS: ${HARD_BANS.join("; ")}`,
    zone.prompt,
    variant.prompt,
    "DYNAMIC PLACEMENT: Analyze the finished scene and choose x/y placement from its real negative space. Keep every glyph ≥5% from every edge; never crop text or cover a face, eyes, mouth, or the primary product silhouette.",
    "FIT: One line preferred, two lines maximum. Shrink or wrap the complete hook to fit; never truncate it. Keep visible breathing room between letters (roughly 0.06–0.10em).",
    "SCENE: Keep one continuous photographic scene with no collage seams unless a split was explicitly requested.",
  ].join("\n");
}

/** Post-render QA — wraps vision verifier with font-engine naming. */
export async function inspectTypography(options: {
  imageBase64: string;
  mimeType?: string;
  hook: string;
  topic: string;
  allowSplit?: boolean;
}): Promise<ThumbnailVerification> {
  return verifyThumbnailImage(options);
}

/** Human-readable summary for logs / CLI. */
export function formatTypographyReport(v: ThumbnailVerification): string {
  const lines = [
    `verdict=${v.verdict} score=${v.score} hookExact=${v.hookExact} (${v.ms}ms)`,
    `expected: "${v.hookExpected}"`,
    `found:    "${v.hookFound}"`,
  ];
  for (const d of v.defects) {
    lines.push(`  [${d.severity}] ${d.code}: ${d.detail}`);
  }
  if (v.repairNote) lines.push(`repair: ${v.repairNote}`);
  return lines.join("\n");
}
