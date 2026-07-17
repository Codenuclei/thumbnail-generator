import sharp from "sharp";

export type ExtractedSwatch = {
  hex: string;
  r: number;
  g: number;
  b: number;
  count: number;
};

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === 0) return 0;
  return (max - min) / max;
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Quantize RGB into coarse buckets so we can count dominant colors. */
function bucketKey(r: number, g: number, b: number, step = 24): string {
  const qr = Math.round(r / step) * step;
  const qg = Math.round(g / step) * step;
  const qb = Math.round(b / step) * step;
  return `${qr},${qg},${qb}`;
}

/**
 * Extract dominant colors from a thumbnail image buffer.
 * Pure pixel sampling — no LLM. Returns up to `limit` distinct hex colors.
 */
export async function extractDominantColors(
  buffer: Buffer,
  limit = 8
): Promise<ExtractedSwatch[]> {
  const { data, info } = await sharp(buffer)
    .resize(64, 36, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = channels >= 4 ? data[i + 3] : 255;
    if (a < 128) continue;

    const key = bucketKey(r, g, b);
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const averaged: ExtractedSwatch[] = [...buckets.values()]
    .map((bucket) => {
      const r = bucket.r / bucket.count;
      const g = bucket.g / bucket.count;
      const b = bucket.b / bucket.count;
      return {
        hex: rgbToHex(r, g, b),
        r,
        g,
        b,
        count: bucket.count,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Greedy pick: keep colors that are visually distinct
  const picked: ExtractedSwatch[] = [];
  for (const swatch of averaged) {
    if (picked.every((p) => colorDistance(p, swatch) > 42)) {
      picked.push(swatch);
    }
    if (picked.length >= limit) break;
  }

  return picked;
}

export type BuiltPalette = {
  id: string;
  name: string;
  colors: string[];
  rationale: string;
};

/**
 * Build 4 distinct palettes from pooled swatches sampled from liked thumbs.
 * Each palette: dark/light anchor + 2 accents pulled from real pixels.
 */
export function buildPalettesFromSwatches(
  swatches: ExtractedSwatch[],
  sourceLabel: string
): BuiltPalette[] {
  if (!swatches.length) return [];

  const bySat = [...swatches].sort(
    (a, b) => saturation(b.r, b.g, b.b) - saturation(a.r, a.g, a.b)
  );
  const byLum = [...swatches].sort(
    (a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b)
  );

  const darkest = byLum[0];
  const lightest = byLum[byLum.length - 1];
  const accents = bySat.filter(
    (s) =>
      colorDistance(s, darkest) > 50 &&
      colorDistance(s, lightest) > 50 &&
      saturation(s.r, s.g, s.b) > 0.12
  );
  const mid = byLum[Math.floor(byLum.length / 2)] || swatches[0];

  const a1 = accents[0] || bySat[0] || mid;
  const a2 = accents[1] || bySat[1] || mid;
  const a3 = accents[2] || bySat[2] || a1;
  const a4 = accents[3] || bySat[Math.min(3, bySat.length - 1)] || a2;

  const darkHex = darkest.hex;
  const lightHex = lightest.hex;

  return [
    {
      id: "extracted-dominant",
      name: "From thumbs",
      colors: [darkHex, lightHex, a1.hex, a2.hex],
      rationale: `Dominant + accent colors sampled from ${sourceLabel}.`,
    },
    {
      id: "extracted-high-key",
      name: "High key pull",
      colors: [lightHex, darkHex, a2.hex, a3.hex],
      rationale: `Light-first grade using real swatches from ${sourceLabel}.`,
    },
    {
      id: "extracted-accent-lead",
      name: "Accent lead",
      colors: [a1.hex, darkHex, lightHex, a3.hex],
      rationale: `Lead accent from liked thumbs, anchored with real dark/light.`,
    },
    {
      id: "extracted-dual-accent",
      name: "Dual accent",
      colors: [darkHex, a1.hex, a4.hex, lightHex],
      rationale: `Two competing accents pulled from the same liked frames.`,
    },
  ];
}

/** Resolve YouTube thumbnail URL variants when the primary URL fails. */
export function thumbnailUrlCandidates(url: string, videoId?: string): string[] {
  const urls: string[] = [];
  if (url) urls.push(url);

  const id =
    videoId ||
    url.match(/\/vi\/([^/]+)\//)?.[1] ||
    url.match(/[?&]v=([^&]+)/)?.[1] ||
    "";

  if (id) {
    for (const name of ["maxresdefault", "sddefault", "hqdefault", "mqdefault"]) {
      urls.push(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
    }
  }

  // Dedupe preserving order
  return [...new Set(urls)];
}
