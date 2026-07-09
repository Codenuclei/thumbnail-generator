import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { StyleBrief } from "@/lib/style-intelligence";
import type { ColorPaletteOption } from "@/lib/palette-types";

export type { ColorPaletteOption } from "@/lib/palette-types";
export { applyPaletteToBrief } from "@/lib/palette-types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

export type PaletteSuggestionResult = {
  palettes: ColorPaletteOption[];
  styleBrief: StyleBrief;
};

async function fetchThumbnailAsBase64(
  url: string
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "ThumbnailStudio/1.0" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    return { mimeType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

function fallbackPalettes(
  topic: string,
  liked: InspirationVideo[],
  hook?: string
): PaletteSuggestionResult {
  const ids = liked.map((v) => v.videoId);
  const palettes: ColorPaletteOption[] = [
    {
      id: "warm-premium",
      name: "Warm premium",
      colors: ["#FFFFFF", "#1E3A5F", "#F5A623", "#2ECC71"],
      rationale: "Bright documentary grade with amber accent for hooks.",
      sourceVideoIds: ids.slice(0, 2),
    },
    {
      id: "cool-industrial",
      name: "Cool industrial",
      colors: ["#0F172A", "#38BDF8", "#F8FAFC", "#64748B"],
      rationale: "Steel blues and crisp whites for factory / process topics.",
      sourceVideoIds: ids.slice(0, 2),
    },
    {
      id: "high-contrast",
      name: "High contrast",
      colors: ["#111111", "#FFFFFF", "#FF3E00", "#FFA600"],
      rationale: "Maximum mobile readability with ember accent.",
      sourceVideoIds: ids.slice(0, 2),
    },
    {
      id: "soft-mint",
      name: "Soft mint",
      colors: ["#FAFAFA", "#181925", "#33C758", "#DEF6E4"],
      rationale: "Clean SaaS-like optimism pulled from liked energy.",
      sourceVideoIds: ids.slice(0, 2),
    },
  ];

  return {
    palettes,
    styleBrief: {
      summary: `Color directions derived from liked references for "${topic}".`,
      colorPalette: palettes[0].colors,
      typography: "Bold ALL-CAPS sans-serif, high contrast",
      composition: "Hero subject with clean text space",
      emotionalHook: "Optimistic, authoritative, premium",
      textPatterns: [],
      creativeDirection: "Match liked thumbnail DNA; keep premium polish.",
      doList: ["Use selected palette", "One bold hook", "Clean layout"],
      avoidList: ["Cheap clickbait", "Clutter", "Muddy contrast"],
      suggestedHook: hook?.toUpperCase() || "HOW IT'S MADE",
    },
  };
}

/**
 * Suggest 3–4 color palettes AFTER the user has liked qualified thumbnails.
 * Uses liked thumbnail images + feedback notes — not the raw search pool.
 */
export async function suggestPalettesFromLiked(
  topic: string,
  likedVideos: InspirationVideo[],
  feedback: ThumbnailFeedback[] = [],
  options?: { hook?: string; previousPalettes?: ColorPaletteOption[]; paletteFeedback?: string }
): Promise<PaletteSuggestionResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!likedVideos.length) {
    return fallbackPalettes(topic, [], options?.hook);
  }

  if (!apiKey) {
    return fallbackPalettes(topic, likedVideos, options?.hook);
  }

  const likedNotes = feedback
    .filter((f) => f.rating === "like")
    .map((f) => `- "${f.title}" (${f.channel}): ${f.comment || "liked"}`)
    .join("\n");

  const dislikeNotes = feedback
    .filter((f) => f.rating === "dislike")
    .map((f) => `- "${f.title}": avoid because ${f.comment || "disliked"}`)
    .join("\n");

  const imageParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> =
    [];

  for (const video of likedVideos.slice(0, 4)) {
    const img = await fetchThumbnailAsBase64(video.thumbnailUrl);
    if (img) {
      imageParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      imageParts.push({
        text: `Liked reference: "${video.title}" by ${video.channel} (id=${video.videoId})`,
      });
    }
  }

  const prompt = `You are a YouTube thumbnail color strategist.

Topic: "${topic}"
${options?.hook ? `Hook: "${options.hook}"` : ""}

The user LIKED these qualified premium thumbnails. Extract real color DNA from the attached images.

Liked notes:
${likedNotes || "(no written notes)"}

Disliked (avoid):
${dislikeNotes || "(none)"}

${options?.paletteFeedback ? `User feedback on previous palettes: ${options.paletteFeedback}` : ""}
${
  options?.previousPalettes?.length
    ? `Previous options (do not repeat exactly):\n${options.previousPalettes
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
      "rationale": "one sentence why this fits the liked thumbs",
      "sourceVideoIds": ["videoId"]
    }
  ],
  "summary": "2 sentence style synthesis from liked refs",
  "typography": "rules",
  "composition": "rules",
  "creativeDirection": "art direction",
  "doList": ["5 items"],
  "avoidList": ["5 items"],
  "suggestedHook": "ALL CAPS HOOK"
}

Provide exactly 4 distinct palette options. Colors must be real hex from the liked images (or close variants).`;

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
        generationConfig: { temperature: 0.35, maxOutputTokens: 1800 },
      }),
      signal: AbortSignal.timeout(28_000),
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

    const palettes = (parsed.palettes || [])
      .filter((p) => p?.colors?.length)
      .slice(0, 4)
      .map((p, i) => ({
        id: p.id || `palette-${i + 1}`,
        name: p.name || `Option ${i + 1}`,
        colors: p.colors.map(String).slice(0, 6),
        rationale: p.rationale || "",
        sourceVideoIds: p.sourceVideoIds || likedVideos.slice(0, 2).map((v) => v.videoId),
      }));

    if (!palettes.length) throw new Error("empty palettes");

    const styleBrief: StyleBrief = {
      summary: parsed.summary || `Derived from ${likedVideos.length} liked references.`,
      colorPalette: palettes[0].colors,
      typography: parsed.typography || "Bold ALL-CAPS sans-serif",
      composition: parsed.composition || "Hero with clean text space",
      emotionalHook: "Optimistic, authoritative, premium",
      textPatterns: [],
      creativeDirection: parsed.creativeDirection || "",
      doList: parsed.doList || ["Match liked DNA", "One bold hook", "Clean layout"],
      avoidList: parsed.avoidList || ["Cheap clickbait", "Clutter"],
      suggestedHook: parsed.suggestedHook || options?.hook?.toUpperCase() || "HOW IT'S MADE",
    };

    return { palettes, styleBrief };
  } catch (err) {
    console.error("Palette suggestion error:", err);
    return fallbackPalettes(topic, likedVideos, options?.hook);
  }
}

/** Attach liked thumbnail images as generation reference assets (max 4). */
export async function likedThumbsAsAssets(
  videos: InspirationVideo[]
): Promise<Array<{ mimeType: string; data: string; label: string }>> {
  const assets: Array<{ mimeType: string; data: string; label: string }> = [];
  for (const v of videos.slice(0, 4)) {
    const img = await fetchThumbnailAsBase64(v.thumbnailUrl);
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
