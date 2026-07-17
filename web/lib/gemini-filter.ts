import type { ScrapedVideo } from "@/lib/apify-youtube";
import type { StyleBrief } from "@/lib/style-intelligence";
import { parseChannelHandles, videoFromReferenceChannel } from "@/lib/title-relevance";
import { TARGET_RESULTS } from "@/lib/apify-youtube";
import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const FILTER_MODEL = "gemini-2.5-flash";

export type GeminiFilterResult = {
  videos: ScrapedVideo[];
  styleBrief: StyleBrief;
  titleSuggestions: string[];
  filteredCount: number;
  channelStats: { kept: number; droppedOffTopic: number };
  qualityRejected: number;
};

type GeminiFilterResponse = {
  keptIds?: string[];
  rejectedIds?: string[];
  channelKept?: number;
  channelDropped?: number;
  summary?: string;
  colorPalette?: string[];
  typography?: string;
  composition?: string;
  creativeDirection?: string;
  doList?: string[];
  avoidList?: string[];
  suggestedHook?: string;
  titleSuggestions?: string[];
};

function emptyBrief(topic: string, hook?: string): StyleBrief {
  return {
    summary: `Premium style for "${topic}". Colors unlock after you like qualified references.`,
    colorPalette: [],
    typography: "Bold ALL-CAPS sans-serif",
    composition: "Hero with clean text space",
    emotionalHook: "Optimistic, authoritative, premium",
    textPatterns: [],
    creativeDirection: "Optimistic business-documentary thumbnail.",
    doList: ["Premium polish", "One bold hook", "Clean layout"],
    avoidList: ["Cheap clickbait", "Clutter", "Low contrast"],
    suggestedHook: hook?.toUpperCase() || "HOW IT'S MADE",
  };
}

function buildCatalog(videos: ScrapedVideo[], channelHandles: string[]): string {
  return videos
    .slice(0, 40)
    .map((v, i) => {
      const ref = videoFromReferenceChannel(v, channelHandles) ? " [REFERENCE CHANNEL]" : "";
      const desc = v.description ? ` | DESC: ${v.description.slice(0, 120)}` : "";
      return `${i + 1}. id=${v.videoId}${ref} | TITLE: ${v.title} | CHANNEL: ${v.channel} | VIEWS: ${v.viewCount}${desc}`;
    })
    .join("\n");
}

export async function filterAndCurateWithGemini(
  topic: string,
  videos: ScrapedVideo[],
  options?: { channelsRaw?: string; hook?: string; strict?: boolean; targetCount?: number }
): Promise<GeminiFilterResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const channelHandles = parseChannelHandles(options?.channelsRaw);
  const hook = options?.hook;
  const strict = options?.strict !== false;
  const targetCount = options?.targetCount ?? TARGET_RESULTS;

  if (!videos.length) {
    return {
      videos: [],
      styleBrief: emptyBrief(topic, hook),
      titleSuggestions: [],
      filteredCount: 0,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      qualityRejected: 0,
    };
  }

  if (!apiKey) {
    const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, targetCount);
    return {
      videos: sorted,
      styleBrief: emptyBrief(topic, hook),
      titleSuggestions: sorted.slice(0, 3).map((v) => v.title),
      filteredCount: videos.length - sorted.length,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      qualityRejected: 0,
    };
  }

  const channelNote = channelHandles.length
    ? `Reference channels: ${channelHandles.join(", ")}. [REFERENCE CHANNEL] videos MUST match "${topic}" semantically or be rejected.`
    : "";

  const prompt = `You are an elite YouTube thumbnail curator. ZERO tolerance for cheap, amateur, or low-quality content.

Topic: "${topic}"
${channelNote}
${hook ? `Hook: "${hook}"` : ""}

Candidates (already filtered to landscape / non-Shorts videos via YouTube search):
${buildCatalog(videos, channelHandles)}

Score EACH video: topicRelevance (0-10), productionQuality (0-10), brandImpression (0-10).

KEEP rules:
- topicRelevance >= ${strict ? 7 : 6}
- productionQuality >= ${strict ? 7 : 6}
- brandImpression >= ${strict ? 7 : 6}
- Must feel premium business/documentary — optimistic, professional, trustworthy
- NEVER keep: clickbait, shock faces, pranks, reactions, amateur layout, muddy colors, off-topic, low-effort thumbnails

Reference channel videos: topicRelevance >= 7 or REJECT.

Keep exactly ${targetCount} of the highest-scoring premium thumbnails. If fewer qualify, keep all that pass — never pad with low quality.

Also generate titleSuggestions — 6 YouTube video title ideas inspired by the BEST kept videos (same quality bar, searchable, premium tone).

IMPORTANT: Do NOT invent a color palette yet. Colors are extracted later from user-liked thumbnails only.
Leave colorPalette as an empty array [].

Return ONLY JSON:
{
  "keptIds": ["videoId"],
  "rejectedIds": ["videoId"],
  "channelKept": 0,
  "channelDropped": 0,
  "summary": "quality curation note (no color advice)",
  "colorPalette": [],
  "typography": "rules",
  "composition": "rules",
  "creativeDirection": "art direction without specific hex colors",
  "doList": ["5 items"],
  "avoidList": ["5 items"],
  "suggestedHook": "ALL CAPS HOOK",
  "titleSuggestions": ["title idea 1", "title idea 2", "title idea 3", "title idea 4"]
}`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${FILTER_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1600 },
      }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!res.ok) throw new Error(`gemini filter ${res.status}`);

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json");

    const parsed = JSON.parse(jsonMatch[0]) as GeminiFilterResponse;
    const idSet = new Set(parsed.keptIds || []);
    const kept = videos.filter((v) => idSet.has(v.videoId));
    const rejectedCount = (parsed.rejectedIds?.length ?? videos.length - kept.length);

    if (!kept.length) {
      throw new Error("Gemini rejected all candidates for quality");
    }

    const styleBrief: StyleBrief = {
      summary: parsed.summary || emptyBrief(topic, hook).summary,
      // Colors deferred until user likes qualified thumbs
      colorPalette: [],
      typography: parsed.typography || "Bold ALL-CAPS sans-serif",
      composition: parsed.composition || "Hero with clean text space",
      emotionalHook: "Optimistic, authoritative, premium",
      textPatterns: [],
      creativeDirection: parsed.creativeDirection || "",
      doList: parsed.doList || emptyBrief(topic, hook).doList,
      avoidList: parsed.avoidList || emptyBrief(topic, hook).avoidList,
      suggestedHook: parsed.suggestedHook || hook?.toUpperCase() || "HOW IT'S MADE",
    };

    const titleSuggestions =
      parsed.titleSuggestions?.filter((t) => t.trim()).slice(0, 5) ||
      kept.slice(0, 3).map((v) => v.title);

    return {
      videos: kept.slice(0, targetCount),
      styleBrief,
      titleSuggestions,
      filteredCount: videos.length - kept.length,
      qualityRejected: rejectedCount,
      channelStats: {
        kept: parsed.channelKept ?? kept.filter((v) => videoFromReferenceChannel(v, channelHandles)).length,
        droppedOffTopic: parsed.channelDropped ?? 0,
      },
    };
  } catch (err) {
    console.error("Gemini filter error:", err);
    const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, targetCount);
    return {
      videos: sorted,
      styleBrief: emptyBrief(topic, hook),
      titleSuggestions: sorted.map((v) => v.title).slice(0, 3),
      filteredCount: videos.length - sorted.length,
      qualityRejected: 0,
      channelStats: { kept: 0, droppedOffTopic: 0 },
    };
  }
}
