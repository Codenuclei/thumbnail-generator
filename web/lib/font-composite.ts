/**
 * Post-render hook typography.
 *
 * Gemini returns a TEXTLESS plate; this module draws the exact hook as SVG
 * glyph paths (no host fontconfig dependency) with:
 *  - fit-to-safe-area sizing + wrapping (letters can never leave the frame)
 *  - contrast-aware solid ink sampled from the pixels under the text
 *  - calmest-zone placement (fallback) OR orchestrator-resolved box
 *
 * Never draws a stroke, outline, border, plate, or shadow.
 * Gemini may propose placement; this module only draws exact glyphs.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  DEFAULT_FONT_WEIGHT,
  DEFAULT_TRACKING_EM,
  type CompositeTextOptions,
  type PlacementZoneId,
} from "@/lib/font-engine";

type OtGlyph = {
  advanceWidth: number;
  getPath: (
    x: number,
    y: number,
    fontSize: number
  ) => { toPathData: (digits: number) => string };
};

type OtFont = {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  charToGlyph: (ch: string) => OtGlyph;
};

type OtModule = { parse: (buffer: ArrayBuffer) => OtFont };

const SYSTEM_FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial Bold.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

/** Text must stay inside this fraction of the canvas on every side. */
const SAFE_MARGIN = 0.05;
/** Below this the hook stops being phone-readable, so we wrap instead of shrink. */
const MIN_FONT_RATIO = 0.045;
const MAX_FONT_RATIO = 0.095;
const MAX_LINES = 2;
/** A pixel this bright cannot carry white ink. */
const BRIGHT_PIXEL = 0.5;
/**
 * Prefer white ink unless a clear majority of the text band is bright —
 * otherwise mixed grass+clothing bands flip to black and glyphs vanish
 * on dark jackets.
 */
const BRIGHT_FRACTION_LIMIT = 0.55;
/**
 * Near-zero variance usually means a Gemini-painted solid color panel
 * (cutout plate), not calm photo negative space. Prefer a slightly
 * textured calm zone instead.
 */
const FLAT_PLATE_BUSYNESS = 0.055;
const MAX_HONOR_BUSYNESS = 0.2;

const INK_LIGHT = "#FFFFFF";
const INK_DARK = "#101014";

type ZoneBox = { x: number; y: number; w: number; h: number; align: "start" | "end" };

/** Relative candidate boxes per zone (fractions of canvas). */
const ZONE_BOXES: Record<string, ZoneBox> = {
  "lower-left": { x: 0.05, y: 0.58, w: 0.52, h: 0.34, align: "start" },
  "lower-right": { x: 0.43, y: 0.56, w: 0.52, h: 0.30, align: "end" },
  "upper-left": { x: 0.05, y: 0.07, w: 0.52, h: 0.30, align: "start" },
  "upper-right": { x: 0.43, y: 0.07, w: 0.52, h: 0.30, align: "end" },
  "mid-band": { x: 0.06, y: 0.38, w: 0.88, h: 0.26, align: "start" },
};

/** Zones the auto-picker may choose from, in preference order. */
const AUTO_ZONES = ["lower-left", "upper-right", "upper-left", "lower-right"] as const;

let cachedOt: OtModule | null | undefined;
let cachedFont: OtFont | null | undefined;

export function resolveThumbnailFontPath(): string | undefined {
  const bundled = [
    join(process.cwd(), "assets", "fonts", "Montserrat-Bold.ttf"),
    join(process.cwd(), "web", "assets", "fonts", "Montserrat-Bold.ttf"),
  ];
  return [...bundled, ...SYSTEM_FONT_CANDIDATES].find((path) => existsSync(path));
}

/**
 * Dynamic import only — a static default import makes webpack emit a broken
 * interop shim for this CJS package and the compositor silently no-ops.
 */
async function loadOpentype(): Promise<OtModule | null> {
  if (cachedOt !== undefined) return cachedOt;
  try {
    const mod = (await import("opentype.js")) as unknown as OtModule & {
      default?: OtModule;
    };
    cachedOt = typeof mod.parse === "function" ? mod : mod.default ?? null;
    if (!cachedOt) console.error("opentype.js loaded but exposes no parse()");
    return cachedOt;
  } catch (err) {
    console.error("opentype.js import failed:", err);
    cachedOt = null;
    return null;
  }
}

async function loadFont(): Promise<OtFont | null> {
  if (cachedFont !== undefined) return cachedFont;
  const ot = await loadOpentype();
  const path = resolveThumbnailFontPath();
  if (!ot || !path) {
    cachedFont = null;
    return null;
  }
  try {
    const buf = readFileSync(path);
    cachedFont = ot.parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    );
    console.log(`Hook compositor font: ${path}`);
    return cachedFont;
  } catch (err) {
    console.error("Failed to parse thumbnail font:", err);
    cachedFont = null;
    return null;
  }
}

function measureLine(
  font: OtFont,
  line: string,
  fontSize: number,
  trackingPx: number
): number {
  let width = 0;
  for (const ch of line) {
    width +=
      (font.charToGlyph(ch).advanceWidth / font.unitsPerEm) * fontSize + trackingPx;
  }
  return Math.max(0, width - trackingPx);
}

/** Split into `count` lines at the word boundary that minimises the widest line. */
function splitLines(words: string[], count: number): string[] {
  if (count <= 1 || words.length < 2) return [words.join(" ")];
  let best: string[] = [words.join(" ")];
  let bestSpread = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const spread = Math.abs(a.length - b.length);
    if (spread < bestSpread) {
      bestSpread = spread;
      best = [a, b];
    }
  }
  return best;
}

type Layout = { lines: string[]; fontSize: number; widest: number };

/** Shrink then wrap until the block fits the safe box in both axes. */
function layoutHook(
  font: OtFont,
  hook: string,
  box: { w: number; h: number },
  canvasWidth: number,
  trackingEm: number,
  preferredLines?: 1 | 2
): Layout {
  const words = hook.split(" ").filter(Boolean);
  const maxSize = Math.round(canvasWidth * MAX_FONT_RATIO);
  const minSize = Math.round(canvasWidth * MIN_FONT_RATIO);

  let fallback: Layout | null = null;
  const startLines =
    preferredLines === 2 && words.length >= 2 ? 2 : 1;

  // Try preferred line count first, then the other allowed count.
  const order =
    startLines === 2
      ? ([2, 1] as const)
      : ([1, 2] as const);

  for (const lineCount of order) {
    if (lineCount > MAX_LINES || lineCount > words.length) continue;
    const lines = splitLines(words, lineCount);
    for (let size = maxSize; size >= minSize; size -= 2) {
      const trackingPx = trackingEm * size;
      const widest = Math.max(...lines.map((l) => measureLine(font, l, size, trackingPx)));
      const blockHeight = lines.length * size * 1.12;
      if (widest <= box.w && blockHeight <= box.h) {
        return { lines, fontSize: size, widest };
      }
      if (!fallback || size === minSize) {
        fallback = { lines, fontSize: size, widest };
      }
    }
  }

  // Nothing fit cleanly: keep the smallest readable size on the widest wrap so
  // the hook is still complete and inside the box.
  const lines = splitLines(words, Math.min(MAX_LINES, words.length));
  const trackingPx = trackingEm * minSize;
  const widest = Math.max(...lines.map((l) => measureLine(font, l, minSize, trackingPx)));
  return fallback && fallback.widest <= box.w
    ? fallback
    : { lines, fontSize: minSize, widest };
}

type RegionStats = { luma: number; busyness: number; brightFraction: number };

/**
 * Mean luminance alone picks the wrong ink on mixed backgrounds (white text on
 * a half-bright band), so we also measure how much of the band is bright.
 */
async function regionStats(
  image: Buffer,
  box: { left: number; top: number; width: number; height: number }
): Promise<RegionStats | null> {
  try {
    const { data, info } = await sharp(image)
      .extract(box)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const total = info.width * info.height;
    if (!total) return null;

    let sum = 0;
    let sumSq = 0;
    let bright = 0;
    for (let i = 0; i < total; i++) {
      const v = data[i] / 255;
      sum += v;
      sumSq += v * v;
      if (v > BRIGHT_PIXEL) bright++;
    }
    const luma = sum / total;
    return {
      luma,
      busyness: Math.sqrt(Math.max(0, sumSq / total - luma * luma)),
      brightFraction: bright / total,
    };
  } catch {
    return null;
  }
}

function pixelBox(
  zone: ZoneBox,
  width: number,
  height: number
): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, Math.round(zone.x * width));
  const top = Math.max(0, Math.round(zone.y * height));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(zone.w * width))),
    height: Math.max(1, Math.min(height - top, Math.round(zone.h * height))),
  };
}

/**
 * Prefer the requested zone, but move to a calmer one when it is busy —
 * this is what keeps type off faces and detailed subjects.
 */
async function chooseZone(
  image: Buffer,
  requested: PlacementZoneId | undefined,
  width: number,
  height: number
): Promise<{ id: string; zone: ZoneBox; stats: RegionStats | null }> {
  const requestedBox = requested ? ZONE_BOXES[requested] : undefined;

  // An explicit mid-band request is a deliberate layout, so honour it as-is
  // only when it is calm enough.
  if (requested === "mid-band" && requestedBox) {
    const stats = await regionStats(image, pixelBox(requestedBox, width, height));
    if ((stats?.busyness ?? 1) < 0.22) {
      return { id: requested, zone: requestedBox, stats };
    }
  }

  const candidateIds = Array.from(
    new Set([
      ...(requested && ZONE_BOXES[requested] ? [requested] : []),
      ...AUTO_ZONES,
    ])
  );

  let best:
    | { id: string; zone: ZoneBox; stats: RegionStats | null; score: number }
    | null = null;
  for (let i = 0; i < candidateIds.length; i++) {
    const id = candidateIds[i];
    const zone = ZONE_BOXES[id];
    if (!zone) continue;
    const stats = await regionStats(image, pixelBox(zone, width, height));
    const busyness = stats?.busyness ?? 1;
    // Penalise ultra-flat synthetic panels; small bonus keeps preferred zone.
    const flatPenalty = busyness < FLAT_PLATE_BUSYNESS ? 0.18 : 0;
    const score = busyness + flatPenalty + (i === 0 ? -0.02 : 0);
    if (!best || score < best.score) best = { id, zone, stats, score };
  }

  return best
    ? { id: best.id, zone: best.zone, stats: best.stats }
    : {
        id: requested || "lower-left",
        zone: requestedBox || ZONE_BOXES["lower-left"],
        stats: null,
      };
}

/** Exported for the orchestrator — pick calmest zone with optional preference. */
export async function pickCalmZone(
  image: Buffer,
  preferred?: PlacementZoneId
): Promise<{ id: string; zone: ZoneBox; stats: RegionStats | null }> {
  const metadata = await sharp(image).metadata();
  const width = metadata.width || 1280;
  const height = metadata.height || 720;
  return chooseZone(image, preferred, width, height);
}

function buildPathSvg(
  font: OtFont,
  layout: Layout,
  options: {
    box: { left: number; top: number; width: number; height: number };
    align: "start" | "end";
    trackingEm: number;
    fill: string;
    canvasWidth: number;
    canvasHeight: number;
  }
): string {
  const { fontSize, lines } = layout;
  const trackingPx = options.trackingEm * fontSize;
  const blockHeight = lines.length * fontSize * 1.12;
  const capOffset = (font.ascender / font.unitsPerEm) * fontSize * 0.82;
  const blockTop = options.box.top + Math.max(0, (options.box.height - blockHeight) / 2);

  const groups = lines.map((line, index) => {
    const lineWidth = measureLine(font, line, fontSize, trackingPx);
    const originX =
      options.align === "end"
        ? options.box.left + options.box.width - lineWidth
        : options.box.left;
    const baseline = blockTop + capOffset + index * fontSize * 1.12;

    let cursor = 0;
    const paths: string[] = [];
    for (const ch of line) {
      const glyph = font.charToGlyph(ch);
      paths.push(glyph.getPath(cursor, 0, fontSize).toPathData(2));
      cursor += (glyph.advanceWidth / font.unitsPerEm) * fontSize + trackingPx;
    }
    return `<g transform="translate(${originX.toFixed(2)} ${baseline.toFixed(2)})">${paths
      .map((d) => `<path d="${d}"/>`)
      .join("")}</g>`;
  });

  // Solid fill only: no stroke, no filter, no rect behind the text.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.canvasWidth}" height="${options.canvasHeight}"><g fill="${options.fill}">${groups.join("")}</g></svg>`;
}

export type CompositeResult = {
  buffer: Buffer;
  applied: boolean;
  detail: string;
};

/** Draw the hook onto a plate. Fail-open: returns the plate on any error. */
export async function compositeHookTextDetailed(
  image: Buffer,
  options: CompositeTextOptions
): Promise<CompositeResult> {
  const hook = options.hook.replace(/\s+/g, " ").trim().toUpperCase();
  if (!hook) return { buffer: image, applied: false, detail: "no hook" };

  const font = await loadFont();
  if (!font) {
    return { buffer: image, applied: false, detail: "font unavailable" };
  }

  const metadata = await sharp(image).metadata();
  const width = metadata.width || options.width || 1280;
  const height = metadata.height || options.height || 720;

  const honorRequested =
    Boolean(options.honorPlacementBox && options.placementBox) &&
    Number.isFinite(options.placementBox!.x) &&
    Number.isFinite(options.placementBox!.y);

  let zoneUsed: string;
  let zone: ZoneBox;
  let stats: RegionStats | null;
  let honorBox = false;

  if (honorRequested && options.placementBox) {
    const pb = options.placementBox;
    const candidate: ZoneBox = {
      x: pb.x,
      y: pb.y,
      w: pb.w,
      h: pb.h,
      align: pb.align,
    };
    const candidateStats = await regionStats(
      image,
      pixelBox(candidate, width, height)
    );
    // Master control: Gemini intent wins only on calm photographic bands —
    // not on busy faces, and not on ultra-flat cutout color plates.
    const busy = candidateStats?.busyness ?? 1;
    if (busy <= MAX_HONOR_BUSYNESS && busy >= FLAT_PLATE_BUSYNESS) {
      zoneUsed = options.zoneId || "orchestrator";
      zone = candidate;
      stats = candidateStats;
      honorBox = true;
    } else {
      const chosen = await chooseZone(image, options.zoneId, width, height);
      zoneUsed = chosen.id;
      zone = chosen.zone;
      stats = chosen.stats;
      console.log(
        `Placement override: Gemini box busyness=${busy.toFixed(2)} (${
          busy < FLAT_PLATE_BUSYNESS ? "flat-plate" : "busy"
        }) → zone=${zoneUsed}`
      );
    }
  } else {
    const chosen = await chooseZone(image, options.zoneId, width, height);
    zoneUsed = chosen.id;
    zone = chosen.zone;
    stats = chosen.stats;
  }

  // Clamp the drawing box to the safe area so glyphs can never touch an edge.
  const safeLeft = width * SAFE_MARGIN;
  const safeTop = height * SAFE_MARGIN;
  const rawBox = pixelBox(zone, width, height);
  const box = {
    left: Math.max(safeLeft, rawBox.left),
    top: Math.max(safeTop, rawBox.top),
    width: 0,
    height: 0,
  };
  box.width = Math.max(
    width * 0.3,
    Math.min(rawBox.left + rawBox.width, width - safeLeft) - box.left
  );
  box.height = Math.max(
    height * 0.12,
    Math.min(rawBox.top + rawBox.height, height - safeTop) - box.top
  );

  const trackingEm = Math.max(0.04, options.trackingEm ?? DEFAULT_TRACKING_EM);
  const layout = layoutHook(
    font,
    hook,
    { w: box.width, h: box.height },
    width,
    trackingEm,
    options.preferredLines
  );

  // If the measured block is still wider than the box (extreme hooks), widen
  // toward the opposite safe edge without leaving the frame.
  if (layout.widest > box.width) {
    const maxRight = width - safeLeft;
    if (zone.align === "end") {
      const right = box.left + box.width;
      box.left = Math.max(safeLeft, right - layout.widest);
      box.width = right - box.left;
    } else {
      box.width = Math.min(layout.widest, maxRight - box.left);
    }
  }

  // Sample only the strip the glyphs will actually cover for the ink decision.
  const bandWidth = Math.round(
    Math.min(box.width, Math.max(layout.widest, width * 0.2))
  );
  const bandHeight = Math.round(
    Math.min(box.height, layout.lines.length * layout.fontSize * 1.12)
  );
  const bandTop = Math.round(box.top + Math.max(0, (box.height - bandHeight) / 2));
  const inkStats =
    (await regionStats(image, {
      left: Math.round(zone.align === "end" ? box.left + box.width - bandWidth : box.left),
      top: bandTop,
      width: Math.max(1, bandWidth),
      height: Math.max(1, bandHeight),
    })) || stats;
  const fill =
    options.fill ||
    ((inkStats?.brightFraction ?? 0) > BRIGHT_FRACTION_LIMIT ? INK_DARK : INK_LIGHT);

  const svg = buildPathSvg(font, layout, {
    box,
    align: zone.align,
    trackingEm,
    fill,
    canvasWidth: width,
    canvasHeight: height,
  });

  const overlay = await sharp(Buffer.from(svg, "utf8"), { density: 144 })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  const buffer = await sharp(image)
    .composite([{ input: overlay }])
    .png()
    .toBuffer();

  return {
    buffer,
    applied: true,
    detail: `zone=${zoneUsed} size=${layout.fontSize} lines=${layout.lines.length} tracking=${trackingEm} ink=${fill} bright=${(inkStats?.brightFraction ?? 0).toFixed(2)} busyness=${(stats?.busyness ?? 0).toFixed(2)} honor=${honorBox ? "yes" : "no"}`,
  };
}

export async function compositeHookText(
  image: Buffer,
  options: CompositeTextOptions
): Promise<Buffer> {
  const result = await compositeHookTextDetailed(image, options);
  if (!result.applied) {
    console.warn(`Hook compositor skipped (${result.detail})`);
  }
  return result.buffer;
}

/** Weight is capped by the engine; exported for tests/tooling. */
export const COMPOSITOR_MAX_WEIGHT = Math.min(700, DEFAULT_FONT_WEIGHT);
