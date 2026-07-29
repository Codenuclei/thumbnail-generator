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
 * Build 4 visually DISTINCT palettes from pooled swatches (liked thumbs / media).
 * Each box must lead with a different accent and not reshuffle the same 4 hexes.
 */
export function buildPalettesFromSwatches(
  swatches: ExtractedSwatch[],
  sourceLabel: string
): BuiltPalette[] {
  if (!swatches.length) return [];

  const pool = [...swatches].sort((a, b) => b.count - a.count);
  const byLum = [...pool].sort(
    (a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b)
  );
  const bySat = [...pool].sort(
    (a, b) => saturation(b.r, b.g, b.b) - saturation(a.r, a.g, a.b)
  );

  const darkest = byLum[0];
  const lightest = byLum[byLum.length - 1];
  const mid = byLum[Math.floor(byLum.length / 2)] || pool[0];

  // Distinct accent leads — greedily spaced so palette boxes don't look identical
  const accentLeads: ExtractedSwatch[] = [];
  for (const candidate of bySat) {
    if (colorDistance(candidate, darkest) < 40) continue;
    if (colorDistance(candidate, lightest) < 40) continue;
    if (accentLeads.every((picked) => colorDistance(picked, candidate) > 55)) {
      accentLeads.push(candidate);
    }
    if (accentLeads.length >= 4) break;
  }
  // Fallback fill if we don't have 4 distant accents
  for (const candidate of pool) {
    if (accentLeads.length >= 4) break;
    if (accentLeads.some((p) => p.hex === candidate.hex)) continue;
    accentLeads.push(candidate);
  }
  while (accentLeads.length < 4) {
    accentLeads.push(accentLeads[accentLeads.length - 1] || mid);
  }

  function pickCompanion(
    lead: ExtractedSwatch,
    used: Set<string>,
    prefer: "dark" | "light" | "sat" | "mid"
  ): ExtractedSwatch {
    const ordered =
      prefer === "dark"
        ? byLum
        : prefer === "light"
          ? [...byLum].reverse()
          : prefer === "sat"
            ? bySat
            : [mid, ...pool];
    for (const c of ordered) {
      if (used.has(c.hex)) continue;
      if (colorDistance(c, lead) < 35) continue;
      return c;
    }
    for (const c of pool) {
      if (!used.has(c.hex)) return c;
    }
    return mid;
  }

  function makePalette(
    id: string,
    name: string,
    lead: ExtractedSwatch,
    order: Array<"lead" | "dark" | "light" | "sat" | "mid">,
    rationale: string
  ): BuiltPalette {
    const used = new Set<string>([lead.hex]);
    const colors: string[] = [];
    for (const slot of order) {
      if (slot === "lead") {
        colors.push(lead.hex);
        continue;
      }
      const next = pickCompanion(lead, used, slot);
      used.add(next.hex);
      colors.push(next.hex);
    }
    // Ensure 4 slots
    while (colors.length < 4) {
      const next = pool.find((s) => !used.has(s.hex)) || mid;
      used.add(next.hex);
      colors.push(next.hex);
    }
    return { id, name, colors: colors.slice(0, 4), rationale };
  }

  const recipes: BuiltPalette[] = [
    makePalette(
      "extracted-dominant",
      "From thumbs",
      accentLeads[0],
      ["dark", "light", "lead", "sat"],
      `Dark/light anchors + lead accent from ${sourceLabel}.`
    ),
    makePalette(
      "extracted-high-key",
      "High key pull",
      accentLeads[1],
      ["light", "lead", "dark", "mid"],
      `Light-first grade with a different accent lead from ${sourceLabel}.`
    ),
    makePalette(
      "extracted-accent-lead",
      "Accent lead",
      accentLeads[2],
      ["lead", "dark", "light", "sat"],
      `Accent-forward palette — different lead hue than the other boxes.`
    ),
    makePalette(
      "extracted-dual-accent",
      "Dual accent",
      accentLeads[3],
      ["lead", "sat", "dark", "light"],
      `Second accent family from ${sourceLabel} — not a reshuffle of box 1.`
    ),
  ];

  return ensureDistinctPaletteSets(recipes, pool);
}

/** Push palettes apart when two boxes share too many of the same hexes. */
export function ensureDistinctPaletteSets(
  palettes: BuiltPalette[],
  pool: ExtractedSwatch[] = []
): BuiltPalette[] {
  const result = palettes.map((p) => ({
    ...p,
    colors: [...p.colors],
  }));

  const signature = (colors: string[]) =>
    colors.map((c) => c.toUpperCase()).sort().join("|");

  const overlapCount = (a: string[], b: string[]) => {
    const setB = new Set(b.map((c) => c.toUpperCase()));
    return a.filter((c) => setB.has(c.toUpperCase())).length;
  };

  const unusedFromPool = (used: Set<string>, salt: number) => {
    const candidates = pool.filter((s) => !used.has(s.hex.toUpperCase()));
    if (!candidates.length) return pool[salt % Math.max(pool.length, 1)];
    return candidates[salt % candidates.length];
  };

  const seen = new Set<string>();
  for (let i = 0; i < result.length; i++) {
    let guard = 0;
    while (guard < 6) {
      const sig = signature(result[i].colors);
      const tooSimilar = result
        .slice(0, i)
        .some((prev) => overlapCount(prev.colors, result[i].colors) >= 3);
      if (!seen.has(sig) && !tooSimilar) {
        seen.add(sig);
        break;
      }
      const used = new Set(result[i].colors.map((c) => c.toUpperCase()));
      const swap = unusedFromPool(used, i + guard);
      if (swap) {
        const slot = (i + guard) % 4;
        result[i].colors[slot] = swap.hex;
      } else {
        result[i].colors = [
          result[i].colors[1],
          result[i].colors[2],
          result[i].colors[3],
          result[i].colors[0],
        ];
      }
      guard += 1;
    }
    seen.add(signature(result[i].colors));
  }

  return result;
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
