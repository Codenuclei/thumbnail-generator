import type { ScrapedVideo } from "@/lib/apify-youtube";
import { TARGET_RESULTS } from "@/lib/apify-youtube";
import { thumbnailUrlCandidates } from "@/lib/extract-colors";
import type { StyleBrief } from "@/lib/style-intelligence";
import {
  parseChannelHandles,
  scoreTopicMatch,
  videoFromReferenceChannel,
} from "@/lib/title-relevance";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Prefer newest Flash for curation; fall back if a preview id is unavailable. */
const FILTER_MODELS = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
] as const;

/** Light-filter feed size shown to the user after context/vision drops. */
export const LIGHT_FILTER_RESULTS = 8;
/** Fetch this many YouTube hits before context/vision curation in light mode. */
export const LIGHT_FILTER_POOL = 20;

export type GeminiFilterMode = "strict" | "light";

export type TopicContext = {
  whatItIs: string;
  /** Real-world setting / venue for authentic visuals */
  setting: string;
  authenticVisuals: string[];
  /** Settings/subjects that look related in title but are wrong for thumbs */
  rejectVisuals: string[];
  notes: string;
};

export type RejectedVideo = ScrapedVideo & {
  /** Per-video drop reason when Gemini provides one */
  rejectReason?: string;
};

export type GeminiFilterResult = {
  videos: ScrapedVideo[];
  rejectedVideos: RejectedVideo[];
  filterSummary?: string;
  styleBrief: StyleBrief;
  titleSuggestions: string[];
  filteredCount: number;
  channelStats: { kept: number; droppedOffTopic: number };
  qualityRejected: number;
  topicContext?: TopicContext;
};

type GeminiFilterResponse = {
  keptIds?: string[];
  rejectedIds?: string[];
  /** Optional per-id reasons when model returns structured rejects */
  rejected?: Array<{ id?: string; reason?: string }>;
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

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function emptyBrief(topic: string, hook?: string): StyleBrief {
  return {
    summary: `Style for "${topic}". Colors unlock after you like qualified references.`,
    colorPalette: [],
    typography: "Montserrat Bold / Bebas-like ALL-CAPS, open tracking, solid fill — no stroke or shadow",
    composition: "Hero with clean text space",
    emotionalHook: "Clear, high-contrast, on-topic",
    textPatterns: [],
    creativeDirection: `Match the real niche of "${topic}" — no assumed genre.`,
    doList: ["On-topic subject", "Readable hook if present", "Clean layout"],
    avoidList: ["Off-topic subjects", "Clutter", "Low contrast"],
    suggestedHook: hook?.toUpperCase() || undefined,
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

function formatTopicContext(ctx: TopicContext): string {
  return `TOPIC CONTEXT (ground truth for "${ctx.whatItIs}"):
- What it is: ${ctx.whatItIs}
- Authentic setting: ${ctx.setting}
- Authentic visuals: ${ctx.authenticVisuals.join("; ") || "n/a"}
- REJECT these visuals even if the title mentions the topic: ${ctx.rejectVisuals.join("; ") || "n/a"}
- Notes: ${ctx.notes}`;
}

/**
 * Anti-drift: only IDs from the YouTube pool, in the YouTube pool's original order.
 * Gemini may drop — it may not reorder or invent.
 */
function preserveYoutubeOrder(
  pool: ScrapedVideo[],
  keptOrRejected: { keptIds?: string[]; rejectedIds?: string[] }
): ScrapedVideo[] {
  const poolIds = new Set(pool.map((v) => v.videoId));
  const rejected = new Set(
    (keptOrRejected.rejectedIds || []).filter((id) => poolIds.has(id))
  );
  if (keptOrRejected.keptIds?.length) {
    const kept = new Set(keptOrRejected.keptIds.filter((id) => poolIds.has(id)));
    return pool.filter((v) => kept.has(v.videoId));
  }
  return pool.filter((v) => !rejected.has(v.videoId));
}

/** Rejected candidates in original YouTube pool order. */
function getRejectedVideos(
  pool: ScrapedVideo[],
  parsed: GeminiFilterResponse,
  kept: ScrapedVideo[]
): RejectedVideo[] {
  const poolIds = new Set(pool.map((v) => v.videoId));
  const reasonById = new Map<string, string>();
  for (const entry of parsed.rejected || []) {
    const id = String(entry.id || "").trim();
    const reason = String(entry.reason || "").trim();
    if (id && reason && poolIds.has(id)) reasonById.set(id, reason);
  }

  const explicitRejected = (parsed.rejectedIds || []).filter((id) => poolIds.has(id));
  const rejectedIds =
    explicitRejected.length > 0
      ? explicitRejected
      : pool
          .map((v) => v.videoId)
          .filter((id) => !kept.some((k) => k.videoId === id));

  const rejectedSet = new Set(rejectedIds);
  return pool
    .filter((v) => rejectedSet.has(v.videoId))
    .map((v) => ({
      ...v,
      rejectReason: reasonById.get(v.videoId),
    }));
}

async function geminiGenerate(
  apiKey: string,
  parts: GeminiPart[],
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    responseSchema?: Record<string, unknown>;
  }
): Promise<string> {
  let lastErr: Error | null = null;
  for (const model of FILTER_MODELS) {
    const baseConfig: Record<string, unknown> = {
      temperature: options?.temperature ?? 0.1,
      maxOutputTokens: options?.maxOutputTokens ?? 1600,
      responseMimeType: "application/json",
    };
    if (options?.responseSchema) {
      baseConfig.responseSchema = options.responseSchema;
    }

    const attempts: Array<Record<string, unknown>> = [
      { ...baseConfig, thinkingConfig: { thinkingBudget: 0 } },
      baseConfig,
      {
        temperature: baseConfig.temperature,
        maxOutputTokens: baseConfig.maxOutputTokens,
      },
    ];

    for (const generationConfig of attempts) {
      try {
        const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig,
          }),
          signal: AbortSignal.timeout(options?.timeoutMs ?? 45_000),
        });
        if (!res.ok) {
          lastErr = new Error(`gemini ${model} ${res.status}`);
          if (res.status === 400 || res.status === 404) continue;
          throw lastErr;
        }
        const data = await res.json();
        const text = extractGeminiText(data);
        if (!text.trim()) {
          lastErr = new Error(`gemini ${model} empty`);
          continue;
        }
        console.log(`[gemini-filter] model=${model}`);
        return text;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (/timeout|fetch failed/i.test(lastErr.message)) throw lastErr;
      }
    }
    if (lastErr) console.warn(`[gemini-filter] ${model} failed:`, lastErr.message);
  }
  throw lastErr || new Error("All Gemini filter models failed");
}

function extractGeminiText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

function parseJsonObject<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    return JSON.parse(match[0]) as T;
  }
}

async function fetchThumbInline(
  url: string,
  videoId?: string
): Promise<{ mimeType: string; data: string } | null> {
  for (const candidate of thumbnailUrlCandidates(url, videoId)) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(8_000),
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
      let mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      if (!mimeType.startsWith("image/") && !candidate.includes("ytimg.com")) continue;
      if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";

      // Shrink for vision — keep enough detail for setting/venue.
      try {
        const sharp = (await import("sharp")).default;
        const out = await sharp(buf)
          .resize({ width: 480, withoutEnlargement: true })
          .jpeg({ quality: 72 })
          .toBuffer();
        return { mimeType: "image/jpeg", data: out.toString("base64") };
      } catch {
        return { mimeType, data: buf.toString("base64") };
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function buildThumbParts(
  videos: ScrapedVideo[],
  limit = 16
): Promise<{ parts: GeminiPart[]; withThumbs: number }> {
  const parts: GeminiPart[] = [];
  let withThumbs = 0;
  for (const v of videos.slice(0, limit)) {
    const img = await fetchThumbInline(v.thumbnailUrl, v.videoId);
    if (img) {
      withThumbs += 1;
      parts.push({ text: `THUMB id=${v.videoId} | "${v.title}" | ${v.channel}` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    } else {
      parts.push({
        text: `THUMB id=${v.videoId} | "${v.title}" | ${v.channel} | (image unavailable — judge from title only)`,
      });
    }
  }
  return { parts, withThumbs };
}

/**
 * Step 1: understand what the search query actually is (venue, visuals, rejects).
 * Example: hyrox → indoor fitness racing; outdoor athletics track = wrong visual context.
 */
export async function resolveTopicContext(
  apiKey: string,
  query: string,
  hook?: string
): Promise<TopicContext> {
  const prompt = `You are briefing a YouTube thumbnail researcher. Understand the SEARCH QUERY deeply.

SEARCH QUERY: "${query}"
${hook ? `User notes:\n${hook}` : ""}

Return ONLY JSON:
{
  "whatItIs": "1-2 sentence plain definition of what this query refers to",
  "setting": "where authentic visuals happen (venue / environment)",
  "authenticVisuals": ["3-8 concrete visual cues that belong on real thumbnails for this topic"],
  "rejectVisuals": ["3-8 concrete visuals that look related but are WRONG for this topic — wrong venue, wrong sport, wrong format"],
  "notes": "short hard rule for thumbnail curation (e.g. HYROX races are indoors — outdoor running-track thumbs are wrong visual context even if the title says HYROX)"
}

Be specific. Do not invent a documentary/factory/business genre unless the query itself is that.
If the query is a named event/sport/product, encode its real-world constraints (indoor vs outdoor, equipment, attire).`;

  try {
    const text = await geminiGenerate(apiKey, [{ text: prompt }], {
      temperature: 0.1,
      maxOutputTokens: 800,
      timeoutMs: 20_000,
      responseSchema: {
        type: "OBJECT",
        properties: {
          whatItIs: { type: "STRING" },
          setting: { type: "STRING" },
          authenticVisuals: { type: "ARRAY", items: { type: "STRING" } },
          rejectVisuals: { type: "ARRAY", items: { type: "STRING" } },
          notes: { type: "STRING" },
        },
        required: ["whatItIs", "setting", "authenticVisuals", "rejectVisuals", "notes"],
      },
    });
    const parsed = parseJsonObject<Partial<TopicContext>>(text);
    const ctx: TopicContext = {
      whatItIs: String(parsed.whatItIs || query).trim(),
      setting: String(parsed.setting || "").trim() || query.trim() || "topic",
      authenticVisuals: Array.isArray(parsed.authenticVisuals)
        ? parsed.authenticVisuals.map(String).filter(Boolean).slice(0, 10)
        : [],
      rejectVisuals: Array.isArray(parsed.rejectVisuals)
        ? parsed.rejectVisuals.map(String).filter(Boolean).slice(0, 10)
        : [],
      notes: String(parsed.notes || "").trim(),
    };
    console.log(
      `[gemini-filter] topicContext query=${JSON.stringify(query)} setting=${JSON.stringify(ctx.setting)}`
    );
    return ctx;
  } catch (err) {
    console.warn("[gemini-filter] topicContext failed:", err);
    // Local fallback for known indoor-event queries so vision filter still has rules.
    const q = query.toLowerCase();
    if (/\bhyrox\b/.test(q)) {
      return {
        whatItIs:
          "HYROX is an indoor fitness racing competition (functional fitness stations + runs) held in arenas / convention halls.",
        setting: "indoor arena / warehouse / convention-center race floor",
        authenticVisuals: [
          "indoor functional fitness stations",
          "sled push/pull",
          "wall balls",
          "indoor run loops",
          "race bibs and station mats",
        ],
        rejectVisuals: [
          "outdoor athletics/running track",
          "stadium outdoor lanes",
          "beach or road race",
          "generic outdoor cardio with no HYROX stations",
        ],
        notes:
          "HYROX never races outdoors. Outdoor red-track / stadium-lane thumbnails are wrong visual context even if the title says HYROX.",
      };
    }
    return {
      whatItIs: query,
      // Keep setting user-safe: this object is shown in UI status/context.
      // Filtering still has the query in whatItIs + notes.
      setting: query.trim() || "topic",
      authenticVisuals: [],
      rejectVisuals: [],
      notes:
        "Infer authentic venue from the query. Reject thumbnails whose visible setting contradicts that venue.",
    };
  }
}

/**
 * Light mode: YouTube order preserved. Drop off-title AND wrong visual context
 * (using topic context + thumbnail images).
 */
async function filterLightTopResults(
  title: string,
  videos: ScrapedVideo[],
  options: {
    apiKey: string;
    channelHandles: string[];
    hook?: string;
    targetCount: number;
    topicContext: TopicContext;
  }
): Promise<GeminiFilterResult> {
  const { apiKey, channelHandles, hook, targetCount, topicContext } = options;
  // Larger pool so drops still leave a full top-N in YouTube order.
  const pool = videos.slice(0, Math.max(targetCount * 2 + 4, LIGHT_FILTER_POOL));

  if (!pool.length) {
    return {
      videos: [],
      rejectedVideos: [],
      styleBrief: emptyBrief(title, hook),
      titleSuggestions: [],
      filteredCount: videos.length,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      qualityRejected: 0,
      topicContext,
    };
  }

  const { parts: thumbParts, withThumbs } = await buildThumbParts(pool, pool.length);
  console.log(`[gemini-filter] light vision thumbs=${withThumbs}/${pool.length}`);

  const prompt = `You curate YouTube thumbnail REFERENCES for research. First understand the topic, then filter.

USER SEARCH: "${title}"
${hook ? `User notes:\n${hook}` : ""}

${formatTopicContext(topicContext)}

Candidate list (YouTube Relevance order — preserve this order for keptIds):
${buildCatalog(pool, channelHandles)}

Thumbnail images follow, each labeled with id=…

REJECT a candidate if ANY of these are true:
1. Title/subject is clearly NOT about "${title}" / the topic context.
2. The THUMBNAIL IMAGE shows a visual setting listed under rejectVisuals, or clearly contradicts authentic setting
   (example: outdoor athletics track / stadium lanes when the topic is indoor HYROX racing — REJECT even if the title says HYROX).
3. Thumbnail depicts a different sport/event that only loosely shares fitness vibes.

KEEP when:
- On-topic AND the visible setting matches (or is neutral / training that still looks like the real domain).
- Indoor gym / functional-fitness floor for HYROX is OK; outdoor red running track / beach / road race is NOT.

RULES:
- Default is NOT "keep everything" — wrong visual context must go.
- Do NOT reorder. Return keptIds in the SAME YouTube order as the candidate list.
- NEVER invent videoIds.
- Prefer keeping up to ${targetCount} good ones; if fewer qualify, return fewer — never pad with rejects.
- Do not reject only for low views or clickbait style.

Return ONLY JSON:
{
  "keptIds": ["videoId in original YouTube order"],
  "rejectedIds": ["videoId"],
  "rejected": [{"id": "videoId", "reason": "short reason e.g. outdoor track / wrong sport / off-title"}],
  "channelKept": 0,
  "channelDropped": 0,
  "summary": "what you dropped (cite wrong venue/visual when relevant)",
  "colorPalette": [],
  "typography": "fonts seen on kept thumbs if any",
  "composition": "layout notes from kept thumbs",
  "creativeDirection": "grounded only in kept on-topic thumbs",
  "doList": ["up to 5 items from kept thumbs"],
  "avoidList": ["up to 5 items — include wrong venues from rejects"],
  "suggestedHook": "",
  "titleSuggestions": ["up to 4 title ideas about ${title}"]
}`;

  try {
    const text = await geminiGenerate(
      apiKey,
      [{ text: prompt }, ...thumbParts],
      { temperature: 0, maxOutputTokens: 1400, timeoutMs: 55_000 }
    );
    const parsed = parseJsonObject<GeminiFilterResponse>(text);
    // Visual/domain rejects stick — do not restore via title-match score.
    const finalList = preserveYoutubeOrder(pool, parsed).slice(0, targetCount);
    const kept = finalList.length ? finalList : pool.slice(0, targetCount);
    const rejectedVideos = getRejectedVideos(pool, parsed, kept);

    return {
      videos: kept,
      rejectedVideos,
      filterSummary: parsed.summary,
      styleBrief: {
        ...emptyBrief(title, hook),
        summary:
          parsed.summary ||
          `Top ${kept.length || targetCount} context-filtered results for "${title}".`,
        typography: parsed.typography || emptyBrief(title, hook).typography,
        composition: parsed.composition || emptyBrief(title, hook).composition,
        creativeDirection:
          parsed.creativeDirection ||
          `${topicContext.whatItIs}. Setting: ${topicContext.setting}.`,
        doList: parsed.doList?.length
          ? parsed.doList
          : [...topicContext.authenticVisuals.slice(0, 3), ...emptyBrief(title, hook).doList],
        avoidList: parsed.avoidList?.length
          ? parsed.avoidList
          : [...topicContext.rejectVisuals.slice(0, 4), ...emptyBrief(title, hook).avoidList],
        suggestedHook: parsed.suggestedHook || hook?.toUpperCase() || undefined,
      },
      titleSuggestions:
        parsed.titleSuggestions?.filter((t) => t.trim()).slice(0, 5) ||
        kept.slice(0, 3).map((v) => v.title),
      filteredCount: videos.length - kept.length,
      qualityRejected: rejectedVideos.length,
      channelStats: {
        kept: kept.filter((v) => videoFromReferenceChannel(v, channelHandles)).length,
        droppedOffTopic: rejectedVideos.length,
      },
      topicContext,
    };
  } catch (err) {
    console.error("Gemini light filter error:", err);
    const fallback = pool.slice(0, targetCount);
    return {
      videos: fallback,
      rejectedVideos: [],
      styleBrief: {
        ...emptyBrief(title, hook),
        creativeDirection: `${topicContext.whatItIs}. Setting: ${topicContext.setting}.`,
        avoidList: topicContext.rejectVisuals.slice(0, 5),
      },
      titleSuggestions: pool.slice(0, 3).map((v) => v.title),
      filteredCount: videos.length - Math.min(pool.length, targetCount),
      qualityRejected: 0,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      topicContext,
    };
  }
}

export async function filterAndCurateWithGemini(
  topic: string,
  videos: ScrapedVideo[],
  options?: {
    channelsRaw?: string;
    hook?: string;
    strict?: boolean;
    /** strict = tight title+context curation; light = YouTube order + context/vision drops */
    mode?: GeminiFilterMode;
    targetCount?: number;
    similaritySeed?: {
      title: string;
      channel: string;
      comment?: string;
      thumbnailUrl?: string;
      videoId?: string;
    };
    /** Skip context resolve if already fetched (pipeline can pass it). */
    topicContext?: TopicContext;
  }
): Promise<GeminiFilterResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const channelHandles = parseChannelHandles(options?.channelsRaw);
  const hook = options?.hook;
  const mode: GeminiFilterMode =
    options?.mode || (options?.strict === false ? "light" : "strict");
  const strict = mode === "strict";
  const targetCount =
    options?.targetCount ?? (mode === "light" ? LIGHT_FILTER_RESULTS : TARGET_RESULTS);
  const seed = options?.similaritySeed;
  const title = topic.trim();

  if (!videos.length) {
    return {
      videos: [],
      rejectedVideos: [],
      styleBrief: emptyBrief(title, hook),
      titleSuggestions: [],
      filteredCount: 0,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      qualityRejected: 0,
    };
  }

  if (!apiKey) {
    const sorted = videos.slice(0, targetCount);
    return {
      videos: sorted,
      rejectedVideos: [],
      styleBrief: emptyBrief(title, hook),
      titleSuggestions: sorted.slice(0, 3).map((v) => v.title),
      filteredCount: videos.length - sorted.length,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      qualityRejected: 0,
    };
  }

  const topicContext =
    options?.topicContext || (await resolveTopicContext(apiKey, title, hook));

  if (mode === "light") {
    return filterLightTopResults(title, videos, {
      apiKey,
      channelHandles,
      hook,
      targetCount,
      topicContext,
    });
  }

  const channelNote = channelHandles.length
    ? `Reference channels: ${channelHandles.join(", ")}. [REFERENCE CHANNEL] videos still MUST match the title "${title}" and topic context or be rejected.`
    : "";

  const similarityNote = seed
    ? `SIMILARITY MODE — seed: "${seed.title}" by ${seed.channel}.
Compare each candidate thumbnail to the SEED reference (image attached when available).
The seed represents the REAL subject/format of "${title}" — not any video that merely mentions the name.

HARD REJECT (even if title mentions "${title}"):
- Relationship / couple / lifestyle / daily vlog where the topic is only backdrop, event name-drop, or location tag
- Boyfriend/girlfriend surprise, "what I did for my partner", couple travel, family vlog, personal diary framing
- Thumbnail primary hook is personal/relationship drama while topic branding appears incidentally in background
- Channel or title signals lifestyle creator (couple, vlog, daily life) rather than race/training/competition/education about the topic
- Example REJECT: "HYROX Delhi Vlog: See What I Did for My Boyfriend" with thumb text "I Surprised MY BOYFRIEND!" — relationship vlog, not HYROX race content

KEEP only when primary subject AND thumbnail match the seed's actual domain:
- Same content format as seed (race coverage, training, technique, competition highlights, event recap focused on the sport/activity)
- Thumbnail shows athletes, stations, training, race action, or educational focus — not relationship surprise text

Among qualifying matches, prefer similar layout / subject scale / type weight / venue to the seed.
${seed.comment ? `User note on seed: ${seed.comment}` : ""}
Score subjectFormatMatch (0-10): does the video's PRIMARY subject match the topic activity/format (not a name-drop)?
Score visualSimilarity (0-10) against the seed. Never keep off-subject, wrong-venue, or lifestyle name-drop videos.`
    : "";

  const seedParts: GeminiPart[] = [];
  if (seed?.thumbnailUrl) {
    const seedImg = await fetchThumbInline(seed.thumbnailUrl, seed.videoId);
    if (seedImg) {
      seedParts.push({
        text: `SIMILARITY SEED — compare every candidate to this reference for "${seed.title}" by ${seed.channel}:`,
      });
      seedParts.push({ inlineData: { mimeType: seedImg.mimeType, data: seedImg.data } });
    }
  }

  const { parts: thumbParts, withThumbs } = await buildThumbParts(
    videos,
    Math.min(videos.length, 24)
  );
  console.log(
    `[gemini-filter] strict vision thumbs=${withThumbs}/${videos.length} seed=${seedParts.length > 0}`
  );

  const prompt = `You pick YouTube reference thumbnails that match the user's SEARCH and its real-world visual context.

USER SEARCH: "${title}"
${formatTopicContext(topicContext)}
${channelNote}
${hook ? `Extra notes from the user:\n${hook}` : ""}
${similarityNote}

Candidates (landscape / non-Shorts) — YouTube order:
${buildCatalog(videos, channelHandles)}

Thumbnail images follow, each labeled with id=…

YOUR JOB:
1. Keep only if TITLE matches the topic AND the thumbnail visual setting fits authentic setting / authenticVisuals.
2. REJECT wrong visual context from rejectVisuals even when the title mentions the topic
   (e.g. outdoor track / stadium athletics for indoor HYROX → REJECT).
3. Reject off-title subjects even if premium.
4. Do NOT invent unrelated genres (documentary/factory) unless the query is that.
${seed ? `5. HARD REJECT lifestyle/relationship vlogs that only name-drop "${title}" — primary subject must be the topic activity/format (race, training, competition), NOT boyfriend/girlfriend surprise, couple travel, or daily vlog with event branding as backdrop. titleMatch alone is NOT enough for name-drop vlogs.` : ""}

Score EACH video: titleMatch (0-10), contextMatch (0-10), productionQuality (0-10)${seed ? ", subjectFormatMatch (0-10), visualSimilarity (0-10)" : ""}.

KEEP rules:
- titleMatch >= ${strict ? 8 : 7}
- contextMatch >= ${strict ? 7 : 6}  (hard gate — venue/visual domain)
- productionQuality >= ${strict ? 6 : 5}
${seed ? "- subjectFormatMatch >= 7 (hard gate — primary subject must be the topic activity, not lifestyle name-drop)" : ""}
${seed ? "- Among matches, prefer higher visualSimilarity" : ""}
- NEVER keep off-title, wrong-venue, or lifestyle name-drop videos to fill the quota

Keep up to ${targetCount} in the SAME YouTube candidate order — never reorder.
NEVER invent videoIds.

Also generate titleSuggestions — 6 YouTube title ideas clearly about "${title}" only.

IMPORTANT: Do NOT invent a color palette. Leave colorPalette as [].

Return ONLY JSON:
{
  "keptIds": ["videoId in YouTube candidate order"],
  "rejectedIds": ["videoId"],
  "rejected": [{"id": "videoId", "reason": "short reason e.g. lifestyle vlog name-drop / outdoor track / wrong sport / off-title"}],
  "channelKept": 0,
  "channelDropped": 0,
  "summary": "which matched and which wrong venues you dropped",
  "colorPalette": [],
  "typography": "fonts/weight/case/outline seen on kept thumbs",
  "composition": "layout patterns from kept thumbs",
  "creativeDirection": "direction grounded only in kept on-topic thumbs",
  "doList": ["5 items from kept thumbs"],
  "avoidList": ["5 items — include wrong venues"],
  "suggestedHook": "ALL CAPS HOOK or empty",
  "titleSuggestions": ["title idea 1", "title idea 2", "title idea 3", "title idea 4"]
}`;

  try {
    const text = await geminiGenerate(
      apiKey,
      [{ text: prompt }, ...seedParts, ...thumbParts],
      { temperature: 0.1, maxOutputTokens: 1800, timeoutMs: 60_000 }
    );
    const parsed = parseJsonObject<GeminiFilterResponse>(text);
    // Visual/domain rejects stick; only soft title-score for leftover noise.
    const orderedKept = preserveYoutubeOrder(videos, parsed);
    // Domain/visual rejects already applied — do not resurrect them via title score.
    const kept = orderedKept.slice(0, targetCount);
    const rejectedVideos = getRejectedVideos(videos, parsed, kept);
    const rejectedCount = rejectedVideos.length || parsed.rejectedIds?.length || videos.length - kept.length;

    if (!kept.length) {
      throw new Error("Gemini rejected all candidates for title/context match");
    }

    const styleBrief: StyleBrief = {
      summary: parsed.summary || emptyBrief(title, hook).summary,
      colorPalette: [],
      typography: parsed.typography || "Montserrat Bold / Bebas-like ALL-CAPS, open tracking, solid fill — no stroke or shadow",
      composition: parsed.composition || "Hero with clean text space",
      emotionalHook: "Clear, high-contrast, on-title",
      textPatterns: [],
      creativeDirection:
        parsed.creativeDirection ||
        `${topicContext.whatItIs}. Setting: ${topicContext.setting}.`,
      doList: parsed.doList || emptyBrief(title, hook).doList,
      avoidList: parsed.avoidList?.length
        ? parsed.avoidList
        : [...topicContext.rejectVisuals.slice(0, 4), ...emptyBrief(title, hook).avoidList],
      suggestedHook: parsed.suggestedHook || hook?.toUpperCase() || undefined,
    };

    const titleSuggestions =
      parsed.titleSuggestions?.filter((t) => t.trim()).slice(0, 5) ||
      kept.slice(0, 3).map((v) => v.title);

    return {
      videos: kept,
      rejectedVideos,
      filterSummary: parsed.summary,
      styleBrief,
      titleSuggestions,
      filteredCount: videos.length - kept.length,
      qualityRejected: rejectedCount,
      channelStats: {
        kept:
          parsed.channelKept ??
          kept.filter((v) => videoFromReferenceChannel(v, channelHandles)).length,
        droppedOffTopic: parsed.channelDropped ?? 0,
      },
      topicContext,
    };
  } catch (err) {
    console.error("Gemini filter error:", err);
    const fallback = videos
      .filter((v) => scoreTopicMatch(title, v) > 0)
      .slice(0, targetCount);
    const safe = fallback.length ? fallback : videos.slice(0, targetCount);
    return {
      videos: safe,
      rejectedVideos: [],
      styleBrief: {
        ...emptyBrief(title, hook),
        creativeDirection: `${topicContext.whatItIs}. Setting: ${topicContext.setting}.`,
        avoidList: topicContext.rejectVisuals.slice(0, 5),
      },
      titleSuggestions: safe.map((v) => v.title).slice(0, 3),
      filteredCount: videos.length - safe.length,
      qualityRejected: 0,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      topicContext,
    };
  }
}
