import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { StyleBrief } from "@/lib/style-intelligence";
import type { ColorPaletteOption } from "@/lib/palette-types";
import {
  buildPalettesFromSwatches,
  extractDominantColors,
  thumbnailUrlCandidates,
  type ExtractedSwatch,
} from "@/lib/extract-colors";
import { runtimeEnv } from "@/lib/runtime-env";

export type { ColorPaletteOption } from "@/lib/palette-types";
export { applyPaletteToBrief } from "@/lib/palette-types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

export type PaletteSuggestionResult = {
  palettes: ColorPaletteOption[];
  styleBrief: StyleBrief;
  source: "pixels" | "pixels+gemini" | "fallback";
};

async function fetchThumbnailBuffer(
  url: string,
  videoId?: string
): Promise<{ mimeType: string; data: string; buffer: Buffer } | null> {
  for (const candidate of thumbnailUrlCandidates(url, videoId)) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.youtube.com/",
        },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) continue;
      const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      if (!mimeType.startsWith("image/") && !candidate.includes("ytimg.com")) continue;
      return {
        mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
        data: buf.toString("base64"),
        buffer: buf,
      };
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function sampleLikedSwatches(
  liked: InspirationVideo[]
): Promise<{
  swatches: ExtractedSwatch[];
  imageParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }>;
  fetchedCount: number;
}> {
  const pooled: ExtractedSwatch[] = [];
  const imageParts: Array<
    { inlineData: { mimeType: string; data: string } } | { text: string }
  > = [];
  let fetchedCount = 0;

  for (const video of liked.slice(0, 6)) {
    const img = await fetchThumbnailBuffer(video.thumbnailUrl, video.videoId);
    if (!img) continue;
    fetchedCount += 1;
    imageParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    imageParts.push({
      text: `Liked reference: "${video.title}" by ${video.channel} (id=${video.videoId})`,
    });
    try {
      const colors = await extractDominantColors(img.buffer, 8);
      pooled.push(...colors);
    } catch (err) {
      console.error("Color extract failed for", video.videoId, err);
    }
  }

  // Merge near-duplicates across images by re-ranking on count
  const merged = new Map<string, ExtractedSwatch>();
  for (const s of pooled) {
    const key = s.hex.slice(0, 5); // coarse merge
    const existing = merged.get(key);
    if (!existing || s.count > existing.count) merged.set(key, s);
  }
  const swatches = [...merged.values()].sort((a, b) => b.count - a.count).slice(0, 16);

  return { swatches, imageParts, fetchedCount };
}

function styleBriefFromPalettes(
  topic: string,
  palettes: ColorPaletteOption[],
  hook?: string,
  extras?: Partial<StyleBrief>
): StyleBrief {
  return {
    summary:
      extras?.summary ||
      `Color directions sampled from liked thumbnail pixels for "${topic}".`,
    colorPalette: palettes[0]?.colors || [],
    typography: extras?.typography || "Bold ALL-CAPS sans-serif, high contrast",
    composition: extras?.composition || "Hero subject with clean text space",
    emotionalHook: extras?.emotionalHook || "Optimistic, authoritative, grounded",
    textPatterns: extras?.textPatterns || [],
    creativeDirection:
      extras?.creativeDirection ||
      "Match liked thumbnail DNA; camera-real documentary look, not CGI polish.",
    doList: extras?.doList || ["Use selected palette from thumbs", "One bold hook", "Clean layout"],
    avoidList: extras?.avoidList || ["Cheap clickbait", "Clutter", "Invented neon not in refs"],
    suggestedHook: extras?.suggestedHook || hook?.toUpperCase() || "HOW IT'S MADE",
  };
}

function pixelPalettes(
  topic: string,
  liked: InspirationVideo[],
  swatches: ExtractedSwatch[],
  hook?: string
): PaletteSuggestionResult {
  const ids = liked.map((v) => v.videoId);
  const label =
    liked.length === 1
      ? `"${liked[0].title.slice(0, 40)}"`
      : `${liked.length} liked thumbnails`;

  const built = buildPalettesFromSwatches(swatches, label);
  const palettes: ColorPaletteOption[] = built.map((p) => ({
    ...p,
    sourceVideoIds: ids.slice(0, 3),
  }));

  return {
    palettes,
    styleBrief: styleBriefFromPalettes(topic, palettes, hook),
    source: "pixels",
  };
}

/** Last-resort only — should almost never run if thumbs fetch. */
function emergencyFallback(
  topic: string,
  liked: InspirationVideo[],
  hook?: string
): PaletteSuggestionResult {
  const ids = liked.map((v) => v.videoId);
  console.warn("Palette emergency fallback — thumbnail fetch/extract failed");
  const palettes: ColorPaletteOption[] = [
    {
      id: "emergency-neutral",
      name: "Neutral doc",
      colors: ["#1A1A1A", "#F5F5F5", "#C45C26", "#4A5568"],
      rationale: "Emergency fallback — could not read liked thumbnail pixels.",
      sourceVideoIds: ids.slice(0, 2),
    },
  ];
  return {
    palettes,
    styleBrief: styleBriefFromPalettes(topic, palettes, hook, {
      summary: `Could not sample pixels for "${topic}"; using emergency neutrals.`,
    }),
    source: "fallback",
  };
}

/**
 * Suggest 3–4 color palettes AFTER the user has liked qualified thumbnails.
 * Primary path: sample real hex from liked thumbnail pixels.
 * Gemini only names/refines — never invents the color set from scratch.
 */
export async function suggestPalettesFromLiked(
  topic: string,
  likedVideos: InspirationVideo[],
  feedback: ThumbnailFeedback[] = [],
  options?: { hook?: string; previousPalettes?: ColorPaletteOption[]; paletteFeedback?: string }
): Promise<PaletteSuggestionResult> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!likedVideos.length) {
    return emergencyFallback(topic, [], options?.hook);
  }

  const { swatches, imageParts, fetchedCount } = await sampleLikedSwatches(likedVideos);
  console.log(
    `Palette pipeline: fetched ${fetchedCount}/${likedVideos.length} thumbs, ${swatches.length} swatches`
  );

  if (!swatches.length) {
    return emergencyFallback(topic, likedVideos, options?.hook);
  }

  const pixelResult = pixelPalettes(topic, likedVideos, swatches, options?.hook);

  // If no Gemini key, return pixel palettes as-is (still real colors)
  if (!apiKey || !imageParts.length) {
    return pixelResult;
  }

  const likedNotes = feedback
    .filter((f) => f.rating === "like")
    .map((f) => `- "${f.title}" (${f.channel}): ${f.comment || "liked"}`)
    .join("\n");

  const dislikeNotes = feedback
    .filter((f) => f.rating === "dislike")
    .map((f) => `- "${f.title}": avoid because ${f.comment || "disliked"}`)
    .join("\n");

  const measured = swatches
    .slice(0, 12)
    .map((s) => s.hex)
    .join(", ");

  const prompt = `You are a YouTube thumbnail color strategist.

Topic: "${topic}"
${options?.hook ? `Hook: "${options.hook}"` : ""}

CRITICAL: Colors were MEASURED from the liked thumbnail pixels. You must use ONLY these hex values (or very close ±8 RGB):
MEASURED SWATCHES: ${measured}

Base palettes already built from pixels (refine names/rationale; you may reorder the 4 hexes but do NOT invent new hues outside the measured set):
${pixelResult.palettes.map((p) => `${p.name}: ${p.colors.join(", ")}`).join("\n")}

Liked notes:
${likedNotes || "(no written notes)"}

Disliked (avoid):
${dislikeNotes || "(none)"}

${options?.paletteFeedback ? `User feedback on previous palettes: ${options.paletteFeedback}` : ""}
${
  options?.previousPalettes?.length
    ? `Previous options (vary names/order, stay in measured swatches):\n${options.previousPalettes
        .map((p) => `${p.name}: ${p.colors.join(", ")}`)
        .join("\n")}`
    : ""
}

Return ONLY JSON:
{
  "palettes": [
    {
      "id": "short-kebab-id",
      "name": "2-4 word name",
      "colors": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"],
      "rationale": "one sentence citing the liked thumbs",
      "sourceVideoIds": ["videoId"]
    }
  ],
  "summary": "2 sentence style synthesis from liked refs",
  "typography": "rules",
  "composition": "rules",
  "creativeDirection": "camera-real art direction",
  "doList": ["5 items"],
  "avoidList": ["5 items"],
  "suggestedHook": "ALL CAPS HOOK"
}

Provide exactly 4 palettes. Every hex MUST appear in MEASURED SWATCHES (case-insensitive).`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [...imageParts, { text: prompt }],
          },
        ],
        generationConfig: { temperature: 0.25, maxOutputTokens: 2000 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) throw new Error(`palette suggest ${res.status}`);

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json");

    const parsed = JSON.parse(jsonMatch[0]) as {
      palettes?: ColorPaletteOption[];
      summary?: string;
      typography?: string;
      composition?: string;
      creativeDirection?: string;
      doList?: string[];
      avoidList?: string[];
      suggestedHook?: string;
    };

    const measuredSet = new Set(swatches.map((s) => s.hex.toUpperCase()));
    const nearestMeasured = (hex: string): string => {
      const clean = hex.toUpperCase().replace(/[^0-9A-F#]/g, "");
      const normalized = clean.startsWith("#") ? clean : `#${clean}`;
      if (measuredSet.has(normalized)) return normalized;
      // snap to nearest measured swatch by RGB distance
      const parse = (h: string) => ({
        r: parseInt(h.slice(1, 3), 16),
        g: parseInt(h.slice(3, 5), 16),
        b: parseInt(h.slice(5, 7), 16),
      });
      try {
        const target = parse(normalized.padEnd(7, "0").slice(0, 7));
        let best = swatches[0];
        let bestDist = Infinity;
        for (const s of swatches) {
          const d = Math.hypot(s.r - target.r, s.g - target.g, s.b - target.b);
          if (d < bestDist) {
            bestDist = d;
            best = s;
          }
        }
        return best.hex;
      } catch {
        return swatches[0].hex;
      }
    };

    const ids = likedVideos.map((v) => v.videoId);
    const palettes = (parsed.palettes || [])
      .filter((p) => p?.colors?.length)
      .slice(0, 4)
      .map((p, i) => ({
        id: p.id || pixelResult.palettes[i]?.id || `palette-${i + 1}`,
        name: p.name || pixelResult.palettes[i]?.name || `Option ${i + 1}`,
        colors: p.colors.map((c) => nearestMeasured(String(c))).slice(0, 6),
        rationale: p.rationale || pixelResult.palettes[i]?.rationale || "",
        sourceVideoIds: p.sourceVideoIds?.length
          ? p.sourceVideoIds
          : ids.slice(0, 3),
      }));

    if (!palettes.length) throw new Error("empty palettes");

    return {
      palettes,
      styleBrief: styleBriefFromPalettes(topic, palettes, options?.hook, {
        summary: parsed.summary,
        typography: parsed.typography,
        composition: parsed.composition,
        creativeDirection: parsed.creativeDirection,
        doList: parsed.doList,
        avoidList: parsed.avoidList,
        suggestedHook: parsed.suggestedHook,
      }),
      source: "pixels+gemini",
    };
  } catch (err) {
    console.error("Palette Gemini refine failed — using pixel palettes:", err);
    return pixelResult;
  }
}

/** Attach liked thumbnail images as generation reference assets (max 4). */
export async function likedThumbsAsAssets(
  videos: InspirationVideo[]
): Promise<Array<{ mimeType: string; data: string; label: string }>> {
  const assets: Array<{ mimeType: string; data: string; label: string }> = [];
  for (const v of videos.slice(0, 4)) {
    const img = await fetchThumbnailBuffer(v.thumbnailUrl, v.videoId);
    if (img) {
      assets.push({
        mimeType: img.mimeType,
        data: img.data,
        label: `Liked ref: ${v.title.slice(0, 60)}`,
      });
    }
  }
  return assets;
}
