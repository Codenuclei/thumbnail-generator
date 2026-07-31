/**
 * YouTube thumbnail font engine — standalone typography module.
 *
 * Image models cannot load TTFs. This engine:
 *  1. Defines allowed font energy + placement zones
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

/** Display-font energy the model should approximate (not real TTF loads). */
export const YOUTUBE_DISPLAY_FONTS = [
  {
    id: "impact",
    label: "Impact / Arial Black",
    energy: "Impact / Arial Black — ultra-heavy condensed grotesk, ALL CAPS punch",
  },
  {
    id: "bebas",
    label: "Bebas Neue",
    energy: "Bebas Neue — tall condensed display sans, clean geometric caps",
  },
  {
    id: "anton",
    label: "Anton / Montserrat Black",
    energy: "Anton / Montserrat Black — wide heavy display caps, strong presence",
  },
  {
    id: "editorial",
    label: "Editorial condensed",
    energy: "Premium documentary condensed bold caps — clean, phone-readable",
  },
  {
    id: "stacked",
    label: "Stacked power",
    energy: "Impact-energy dual power words — hierarchy via size, not decoration",
  },
] as const;

export type YoutubeDisplayFontId = (typeof YOUTUBE_DISPLAY_FONTS)[number]["id"];

/** 16:9 placement zones — avoid bottom-right duration chip. */
export const PLACEMENT_ZONES = [
  {
    id: "lower-left",
    label: "Lower left",
    prompt:
      "Place the hook in the lower-left negative space (left ~40%, bottom ~35%). Keep ≥4% safe margin from every edge. Subject/face stays clear on the right.",
  },
  {
    id: "upper-right",
    label: "Upper right",
    prompt:
      "Place the hook in the upper-right negative space (right ~40%, top ~30%). Keep ≥4% safe margin. Subject stays clear on the left/lower frame.",
  },
  {
    id: "upper-left",
    label: "Upper left",
    prompt:
      "Place the hook in the upper-left negative space (left ~40%, top ~30%). Keep ≥4% safe margin. Never collide with a face or product silhouette.",
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
] as const;

/** Only legal text treatment. */
export const ALLOWED_TREATMENT =
  "solid flat-color fill + soft per-letter OFFSET drop shadow only (shadow sits below/behind glyphs — never a rim hugging the letter edge)";

/**
 * Distinct type looks per variant — always zero-outline, on-photo placement.
 * Indices align with prompt-engine camera/type rotation.
 */
export const FONT_ENGINE_VARIANTS = [
  {
    id: "impact-lower-left",
    fontId: "impact" as YoutubeDisplayFontId,
    zoneId: "lower-left" as PlacementZoneId,
    label: "Impact lower-left",
    prompt:
      "TYPE VARIANT — Impact / Arial Black energy, ALL CAPS, solid flat fill + soft OFFSET drop shadow (zero outline), 2–4 words, lower-left negative space. Clean single glyphs — no collisions, no ghost layer.",
  },
  {
    id: "bebas-upper-right",
    fontId: "bebas" as YoutubeDisplayFontId,
    zoneId: "upper-right" as PlacementZoneId,
    label: "Bebas upper-right stack",
    prompt:
      "TYPE VARIANT — Bebas Neue / condensed sans, normal tracking (letters must not touch), Title Case or ALL CAPS, stacked 2 lines max, soft OFFSET drop shadow only (zero outline), upper-right third.",
  },
  {
    id: "anton-mid",
    fontId: "anton" as YoutubeDisplayFontId,
    zoneId: "mid-band" as PlacementZoneId,
    label: "Anton mid-band",
    prompt:
      "TYPE VARIANT — Anton / Montserrat Black feel, wide ALL CAPS across mid-frame, high-contrast solid fill on naturally dark or light photo pixels + soft OFFSET shadow. Text DIRECTLY on the photo — NEVER on a bar/box/banner. Zero outline. Even spacing; never double-print.",
  },
  {
    id: "compact-upper-left",
    fontId: "editorial" as YoutubeDisplayFontId,
    zoneId: "upper-left" as PlacementZoneId,
    label: "Compact upper-left",
    prompt:
      "TYPE VARIANT — Condensed display sans, 2–3 words, upper-left corner punch, bold flat fill + soft OFFSET shadow, zero outline — phone-readable, never thin, never overlapping letters.",
  },
  {
    id: "editorial-opposite",
    fontId: "editorial" as YoutubeDisplayFontId,
    zoneId: "opposite-face" as PlacementZoneId,
    label: "Editorial opposite face",
    prompt:
      "TYPE VARIANT — Clean bold condensed documentary caps — solid flat fill + soft OFFSET drop shadow only (zero outline), comfortable tracking, placed opposite the face/product.",
  },
  {
    id: "stacked-lower",
    fontId: "stacked" as YoutubeDisplayFontId,
    zoneId: "lower-left" as PlacementZoneId,
    label: "Stacked power lower",
    prompt:
      "TYPE VARIANT — Two stacked power words (Impact energy), bottom-heavy placement, solid flat fill + soft OFFSET drop shadow (zero outline), top line slightly smaller. One clean render per line — no echo/ghost duplicates.",
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
    `Font energy: ${font.energy}`,
    `Treatment (ONLY legal stack): ${ALLOWED_TREATMENT}`,
    `HARD BANS: ${HARD_BANS.join("; ")}`,
    zone.prompt,
    variant.prompt,
    `Hook text — spell EXACTLY, letter-for-letter, one clean pass, one place: "${hookCheck.normalized}"`,
    "If the hook does not fit: wrap to 2 lines or shrink type — never crop, never misspell, never abbreviate.",
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
