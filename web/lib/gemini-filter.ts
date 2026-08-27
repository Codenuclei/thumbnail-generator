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

/** Minimum research thumbs shown (YouTube order, no Gemini cull). */
export const LIGHT_FILTER_RESULTS = 56;
/** Fetch at least this many YouTube hits for the research grid. */
export const LIGHT_FILTER_POOL = 64;

function sortByViewsDescending(videos: ScrapedVideo[]): ScrapedVideo[] {
  return [...videos].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
}

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
  /** Present when the display safety gate ran. */
  contentGate?: ContentGateSummary;
};

/** Display-gate codes returned by Gemini vision / heuristics. */
export type ContentGateCode = "nsfw" | "irrelevant" | "other";

export type ImageContentVerdict = {
  id: string;
  allow: boolean;
  reasons: string[];
  codes: ContentGateCode[];
  /** Relevance / "other" drops only when high; NSFW always hard when flagged. */
  confidence?: "high" | "low";
};

/**
 * Fail-open / fail-closed policy (display gate):
 * - NSFW on non-adult query: fail-closed — hide on NSFW verdict OR check error.
 * - NSFW on adult query: allow matching adult imagery; still drop confident off-topic.
 * - Irrelevant / other: soft-drop only on confident (high) verdicts; fail-open on errors
 *   so a flaky check does not empty the research grid.
 */
export type ContentGateSummary = {
  adultQuery: boolean;
  allowed: ScrapedVideo[];
  rejected: RejectedVideo[];
  nsfwDropped: number;
  irrelevantDropped: number;
  otherDropped: number;
  checkErrors: number;
};

/** Clear adult-intent phrases — ambiguous topics default to non-adult (safer). */
const ADULT_QUERY_RE =
  /\b(nsfw|porn(?:o|ography)?|xxx|onlyfans|hentai|erotica?|nude\b|nudity|naked\b|strip(?:per|ping|tease)?|sex\s*tape|adult\s*(?:content|video|film|movie|thumb|thumbnail)|explicit\s*(?:sex|nude|content)|lingerie\s*(?:haul|try[- ]?on)|softcore|hardcore\s*sex)\b/i;

const NSFW_TITLE_RE =
  /\b(nsfw|porn(?:o|ography)?|xxx|onlyfans|hentai|nude\b|nudity|naked\b|sex\s*tape|explicit\s*(?:sex|nude)|strip(?:per|tease)|softcore)\b/i;

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
 * Fast local adult-query detector. Ambiguous topics return false (safer —
 * NSFW imagery stays banned unless the query is clearly adult-oriented).
 */
export function isAdultOrientedQueryHeuristic(topic: string, hook?: string): boolean {
  const text = `${topic}\n${hook || ""}`.trim();
  if (!text) return false;
  return ADULT_QUERY_RE.test(text);
}

/** Title/description NSFW heuristic when vision is unavailable. */
export function looksLikeNsfwMetadata(title: string, description?: string): boolean {
  return NSFW_TITLE_RE.test(`${title}\n${description || ""}`);
}

/**
 * Detect whether the user topic/hook is adult-oriented.
 * Uses heuristics first; optional Gemini text pass only when ambiguous and keyed.
 * On Gemini failure → false (err toward safety / NSFW blocked).
 */
export async function detectAdultOrientedQuery(
  apiKey: string | undefined,
  topic: string,
  hook?: string
): Promise<boolean> {
  if (isAdultOrientedQueryHeuristic(topic, hook)) return true;
  if (!apiKey) return false;

  const text = `${topic}\n${hook || ""}`.trim();
  // Skip Gemini when clearly non-adult everyday topics (saves latency).
  if (text.length < 3) return false;

  try {
    const prompt = `Is this YouTube thumbnail RESEARCH QUERY clearly requesting adult / NSFW / erotic / pornographic content?

QUERY: "${topic}"
${hook ? `Notes: ${hook}` : ""}

Return ONLY JSON: { "adultQuery": boolean, "reason": "short" }

Rules:
- true ONLY when the user clearly wants adult/NSFW/erotic imagery.
- Sex education, anatomy, romance movies, fitness in gym clothes, beachwear fashion → false unless explicitly erotic/NSFW.
- If ambiguous, return false.`;

    const raw = await geminiGenerate(apiKey, [{ text: prompt }], {
      temperature: 0,
      maxOutputTokens: 120,
      timeoutMs: 12_000,
      responseSchema: {
        type: "OBJECT",
        properties: {
          adultQuery: { type: "BOOLEAN" },
          reason: { type: "STRING" },
        },
        required: ["adultQuery"],
      },
    });
    const parsed = parseJsonObject<{ adultQuery?: boolean }>(raw);
    return parsed.adultQuery === true;
  } catch (err) {
    console.warn("[gemini-filter] adultQuery detect failed — treating as non-adult:", err);
    return false;
  }
}

function normalizeGateCodes(raw: unknown): ContentGateCode[] {
  if (!Array.isArray(raw)) return [];
  const out: ContentGateCode[] = [];
  for (const c of raw) {
    const s = String(c).toLowerCase();
    if (s === "nsfw" || s === "irrelevant" || s === "other") out.push(s);
  }
  return [...new Set(out)];
}

/**
 * Apply fail-open/fail-closed policy to a single verdict.
 * Returns whether the image may be shown.
 */
export function shouldAllowGatedImage(
  verdict: ImageContentVerdict,
  adultQuery: boolean
): boolean {
  const codes = verdict.codes || [];
  const confidence = verdict.confidence === "high" ? "high" : "low";
  const hasNsfw = codes.includes("nsfw");
  const hasIrrelevant = codes.includes("irrelevant");
  const hasOther = codes.includes("other");

  // Hard ban NSFW unless the query itself is adult-oriented.
  if (hasNsfw && !adultQuery) return false;

  // Soft-drop only confident irrelevance / other (fail-open when low confidence).
  if (hasIrrelevant && confidence === "high") return false;
  if (hasOther && confidence === "high") return false;

  // Adult query + NSFW (and not confidently irrelevant/other): allow.
  if (hasNsfw && adultQuery) return true;

  if (verdict.allow === false && confidence === "high") return false;

  return true;
}

type GateBatchParsed = {
  results?: Array<{
    id?: string;
    allow?: boolean;
    reasons?: string[];
    codes?: string[];
    confidence?: string;
  }>;
};

async function visionGateBatch(
  apiKey: string,
  batch: ScrapedVideo[],
  options: {
    topic: string;
    hook?: string;
    topicContext?: TopicContext;
    adultQuery: boolean;
  }
): Promise<Map<string, ImageContentVerdict>> {
  const { topic, hook, topicContext, adultQuery } = options;
  const out = new Map<string, ImageContentVerdict>();

  const { parts: thumbParts, withThumbs } = await buildThumbParts(batch, batch.length);
  const ctxBlock = topicContext ? formatTopicContext(topicContext) : `TOPIC: "${topic}"`;

  const prompt = `You are a YouTube thumbnail DISPLAY SAFETY gate. Decide allow/deny for each candidate BEFORE it is shown to the user.

USER QUERY: "${topic}"
${hook ? `User notes:\n${hook}` : ""}
adultQuery=${adultQuery} (if true, adult/NSFW imagery matching the query is allowed; if false, hard-ban NSFW)

${ctxBlock}

For EACH thumbnail (images follow, labeled with id=…), return a verdict.

HARD RULES:
1. codes may include: "nsfw" | "irrelevant" | "other"
2. NSFW = sexual/pornographic/explicit adult content, graphic nudity, fetish, explicit genital focus, porn thumbnails.
   - When adultQuery=false: allow=false and include "nsfw" for any NSFW image.
   - When adultQuery=true: do NOT ban NSFW solely for being adult; still ban if unrelated to the query ("irrelevant").
3. irrelevant = thumbnail has no meaningful relation to the query/topic (wrong subject/domain). Use confidence="high" only when clearly unrelated.
4. other = gore, extreme violence, hate symbols, or otherwise inappropriate for a thumbnail research tool — confidence="high" when clear.
5. Beachwear, gym clothes, kissing in a romance trailer, medical anatomy diagrams → NOT nsfw unless clearly erotic/pornographic.
6. NEVER invent ids. Judge only the provided candidates.
7. Prefer allow=true when unsure about relevance (soft). Prefer allow=false when unsure about NSFW and adultQuery=false.

Return ONLY JSON:
{
  "results": [
    { "id": "videoId", "allow": true, "reasons": [], "codes": [], "confidence": "high"|"low" }
  ]
}`;

  try {
    const text = await geminiGenerate(
      apiKey,
      [{ text: prompt }, ...thumbParts],
      { temperature: 0, maxOutputTokens: 2048, timeoutMs: 35_000 }
    );
    const parsed = parseJsonObject<GateBatchParsed>(text);
    const byId = new Map<string, ImageContentVerdict>();
    for (const row of parsed.results || []) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      byId.set(id, {
        id,
        allow: row.allow !== false,
        reasons: Array.isArray(row.reasons)
          ? row.reasons.map(String).filter(Boolean).slice(0, 4)
          : [],
        codes: normalizeGateCodes(row.codes),
        confidence: row.confidence === "high" ? "high" : "low",
      });
    }

    for (const v of batch) {
      const found = byId.get(v.videoId);
      if (found) {
        out.set(v.videoId, found);
        continue;
      }
      // Model omitted id — title heuristic for NSFW; relevance fail-open.
      const nsfwMeta = looksLikeNsfwMetadata(v.title, v.description);
      out.set(v.videoId, {
        id: v.videoId,
        allow: !(nsfwMeta && !adultQuery),
        reasons: nsfwMeta && !adultQuery ? ["nsfw metadata heuristic"] : ["model omitted — kept"],
        codes: nsfwMeta && !adultQuery ? ["nsfw"] : [],
        confidence: "low",
      });
    }
    console.log(
      `[gemini-filter] contentGate batch=${batch.length} thumbs=${withThumbs} adultQuery=${adultQuery}`
    );
  } catch (err) {
    console.warn("[gemini-filter] contentGate batch failed:", err);
    // Batch API error: do not wipe the grid. Fall back to metadata NSFW
    // heuristic (fail-closed only for clear NSFW titles); relevance fail-open.
    for (const v of batch) {
      const nsfwMeta = looksLikeNsfwMetadata(v.title, v.description);
      if (!adultQuery && nsfwMeta) {
        out.set(v.videoId, {
          id: v.videoId,
          allow: false,
          reasons: ["nsfw metadata after check error"],
          codes: ["nsfw"],
          confidence: "low",
        });
      } else {
        out.set(v.videoId, {
          id: v.videoId,
          allow: true,
          reasons: ["batch check failed — metadata fallback"],
          codes: [],
          confidence: "low",
        });
      }
    }
  }

  return out;
}

/**
 * Gate research / inspiration thumbnails before display.
 * Batches vision checks; applies NSFW fail-closed (non-adult) and relevance soft-drop.
 */
export async function gateThumbnailContent(
  videos: ScrapedVideo[],
  options: {
    topic: string;
    hook?: string;
    topicContext?: TopicContext;
    adultQuery?: boolean;
    /** Max candidates to vision-check; remainder uses metadata NSFW heuristic only. */
    visionLimit?: number;
    batchSize?: number;
    apiKey?: string;
    /** Stop vision batches after this many ms and fail-open the rest (metadata NSFW only). */
    deadlineMs?: number;
  }
): Promise<ContentGateSummary> {
  const topic = options.topic.trim();
  const hook = options.hook;
  const apiKey =
    options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const adultQuery =
    options.adultQuery ?? (await detectAdultOrientedQuery(apiKey, topic, hook));
  const visionLimit = Math.min(options.visionLimit ?? 24, videos.length);
  const batchSize = Math.max(4, Math.min(options.batchSize ?? 8, 12));
  const deadlineAt =
    typeof options.deadlineMs === "number"
      ? Date.now() + Math.max(8_000, options.deadlineMs)
      : Date.now() + 45_000;

  const allowed: ScrapedVideo[] = [];
  const rejected: RejectedVideo[] = [];
  let nsfwDropped = 0;
  let irrelevantDropped = 0;
  let otherDropped = 0;
  let checkErrors = 0;

  const visionPool = videos.slice(0, visionLimit);
  const remainder = videos.slice(visionLimit);
  const verdicts = new Map<string, ImageContentVerdict>();

  if (apiKey && visionPool.length) {
    for (let i = 0; i < visionPool.length; i += batchSize) {
      if (Date.now() >= deadlineAt) {
        console.warn(
          `[gemini-filter] contentGate deadline — metadata fail-open for ${visionPool.length - i} remaining`
        );
        for (const v of visionPool.slice(i)) {
          const nsfwMeta = looksLikeNsfwMetadata(v.title, v.description);
          verdicts.set(v.videoId, {
            id: v.videoId,
            allow: !(nsfwMeta && !adultQuery),
            reasons: nsfwMeta && !adultQuery ? ["nsfw metadata (deadline)"] : ["deadline fail-open"],
            codes: nsfwMeta && !adultQuery ? ["nsfw"] : [],
            confidence: "low",
          });
        }
        break;
      }
      const batch = visionPool.slice(i, i + batchSize);
      const batchVerdicts = await visionGateBatch(apiKey, batch, {
        topic,
        hook,
        topicContext: options.topicContext,
        adultQuery,
      });
      for (const [id, v] of batchVerdicts) {
        verdicts.set(id, v);
        if (v.reasons.some((r) => /check failed/i.test(r))) checkErrors += 1;
      }
    }
  } else {
    // No API key — metadata NSFW heuristic only.
    for (const v of visionPool) {
      const nsfwMeta = looksLikeNsfwMetadata(v.title, v.description);
      verdicts.set(v.videoId, {
        id: v.videoId,
        allow: !(nsfwMeta && !adultQuery),
        reasons: nsfwMeta && !adultQuery ? ["nsfw metadata (no vision key)"] : [],
        codes: nsfwMeta && !adultQuery ? ["nsfw"] : [],
        confidence: "low",
      });
    }
  }

  // Remainder: metadata only (relevance fail-open).
  for (const v of remainder) {
    const nsfwMeta = looksLikeNsfwMetadata(v.title, v.description);
    verdicts.set(v.videoId, {
      id: v.videoId,
      allow: !(nsfwMeta && !adultQuery),
      reasons: nsfwMeta && !adultQuery ? ["nsfw metadata beyond vision limit"] : [],
      codes: nsfwMeta && !adultQuery ? ["nsfw"] : [],
      confidence: "low",
    });
  }

  for (const v of videos) {
    const verdict = verdicts.get(v.videoId) || {
      id: v.videoId,
      allow: true,
      reasons: [],
      codes: [] as ContentGateCode[],
      confidence: "low" as const,
    };
    if (shouldAllowGatedImage(verdict, adultQuery)) {
      allowed.push(v);
      continue;
    }
    const reason =
      verdict.reasons[0] ||
      (verdict.codes.includes("nsfw")
        ? "nsfw blocked"
        : verdict.codes.includes("irrelevant")
          ? "irrelevant to topic"
          : "blocked by content gate");
    rejected.push({ ...v, rejectReason: reason });
    if (verdict.codes.includes("nsfw")) nsfwDropped += 1;
    else if (verdict.codes.includes("irrelevant")) irrelevantDropped += 1;
    else otherDropped += 1;
  }

  console.log(
    `[gemini-filter] contentGate done adultQuery=${adultQuery} kept=${allowed.length}/${videos.length} nsfw=${nsfwDropped} irrelevant=${irrelevantDropped} other=${otherDropped} errors=${checkErrors}`
  );

  return {
    adultQuery,
    allowed,
    rejected,
    nsfwDropped,
    irrelevantDropped,
    otherDropped,
    checkErrors,
  };
}

/**
 * NSFW-only gate for generated (or inline base64) images before display.
 * Relevance is not scored — generation is user-initiated from their topic.
 * Policy: NSFW fail-closed when non-adult query; adult query allows matching NSFW.
 */
export async function gateGeneratedImages(
  images: Array<{ id: string; mimeType?: string; dataBase64: string }>,
  options: { topic: string; hook?: string; adultQuery?: boolean; apiKey?: string }
): Promise<{
  adultQuery: boolean;
  allowedIds: string[];
  rejected: Array<{ id: string; reasons: string[]; codes: ContentGateCode[] }>;
}> {
  const apiKey =
    options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const adultQuery =
    options.adultQuery ??
    (await detectAdultOrientedQuery(apiKey, options.topic, options.hook));

  if (!images.length) {
    return { adultQuery, allowedIds: [], rejected: [] };
  }

  if (!apiKey) {
    // Cannot vision-check — fail-open for generated (user-initiated) but log.
    console.warn("[gemini-filter] gateGeneratedImages skipped — no API key");
    return { adultQuery, allowedIds: images.map((i) => i.id), rejected: [] };
  }

  if (adultQuery) {
    return { adultQuery, allowedIds: images.map((i) => i.id), rejected: [] };
  }

  const parts: GeminiPart[] = [
    {
      text: `You gate GENERATED YouTube thumbnails for NSFW before display.

TOPIC: "${options.topic}"
${options.hook ? `Notes: ${options.hook}` : ""}
adultQuery=false — hard-ban explicit/adult/pornographic imagery.

For each image (labeled id=…), return allow + codes.
codes: "nsfw" if explicit/adult; "other" for gore/hate; else [].
If unsure about NSFW, set allow=false and codes=["nsfw"] (fail-closed).

Return ONLY JSON:
{ "results": [{ "id": "id", "allow": true, "reasons": [], "codes": [] }] }`,
    },
  ];

  for (const img of images) {
    parts.push({ text: `IMAGE id=${img.id}` });
    parts.push({
      inlineData: {
        mimeType: img.mimeType || "image/png",
        data: img.dataBase64,
      },
    });
  }

  try {
    const text = await geminiGenerate(apiKey, parts, {
      temperature: 0,
      maxOutputTokens: 800,
      timeoutMs: 30_000,
    });
    const parsed = parseJsonObject<GateBatchParsed>(text);
    const allowedIds: string[] = [];
    const rejected: Array<{ id: string; reasons: string[]; codes: ContentGateCode[] }> =
      [];
    const seen = new Set<string>();
    for (const row of parsed.results || []) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      seen.add(id);
      const codes = normalizeGateCodes(row.codes);
      const allow =
        row.allow !== false && !codes.includes("nsfw") && !codes.includes("other");
      if (allow) allowedIds.push(id);
      else {
        rejected.push({
          id,
          reasons: Array.isArray(row.reasons)
            ? row.reasons.map(String)
            : ["blocked by NSFW gate"],
          codes: codes.length ? codes : ["nsfw"],
        });
      }
    }
    // Omitted ids → fail-closed (non-adult).
    for (const img of images) {
      if (seen.has(img.id)) continue;
      rejected.push({
        id: img.id,
        reasons: ["omitted from safety response — hidden"],
        codes: ["nsfw"],
      });
    }
    console.log(
      `[gemini-filter] gateGenerated kept=${allowedIds.length}/${images.length} dropped=${rejected.length}`
    );
    return { adultQuery, allowedIds, rejected };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Timeouts / 5xx are not NSFW evidence. User already asked to generate this
    // topic — hide-everything on timeout was dropping valid thumbs (e.g. trains).
    const timeout = /timeout|aborted|AbortError|timed out/i.test(msg);
    if (timeout) {
      console.warn(
        "[gemini-filter] gateGenerated timed out — fail-open (user-initiated generate):",
        msg
      );
      return { adultQuery, allowedIds: images.map((i) => i.id), rejected: [] };
    }
    console.warn("[gemini-filter] gateGenerated failed — fail-closed:", err);
    return {
      adultQuery,
      allowedIds: [],
      rejected: images.map((img) => ({
        id: img.id,
        reasons: ["safety check failed — hidden (fail-closed NSFW)"],
        codes: ["nsfw" as const],
      })),
    };
  }
}

/**
 * Light mode: relevance/context filter, then sort kept results by views descending.
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
  // Larger pool so relevance drops still leave ~40–50 kept refs after view sort.
  const pool = videos.slice(0, Math.max(targetCount * 2, LIGHT_FILTER_POOL));

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

  // Cap vision attachments for latency; remaining candidates are judged from title/catalog.
  const visionLimit = Math.min(36, pool.length);
  const { parts: thumbParts, withThumbs } = await buildThumbParts(pool, visionLimit);
  console.log(`[gemini-filter] light vision thumbs=${withThumbs}/${pool.length}`);

  const prompt = `You curate YouTube thumbnail REFERENCES for research. First understand the topic, then filter.

USER SEARCH: "${title}"
${hook ? `User notes:\n${hook}` : ""}

${formatTopicContext(topicContext)}

Candidate list (YouTube Relevance order — filter for relevance only; server will re-sort kept by views):
${buildCatalog(pool, channelHandles)}

Thumbnail images follow for the first ${visionLimit} candidates, each labeled with id=…
Judge the rest from title/channel/views in the catalog.

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
- Prefer keeping up to ${targetCount} relevant ones (aim for 40–50 when enough qualify).
- NEVER invent videoIds.
- If fewer qualify, return fewer — never pad with rejects.
- Do not reject only for low views or clickbait style (views are used for sorting after you filter).

Return ONLY JSON:
{
  "keptIds": ["videoId of relevant candidates"],
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
      { temperature: 0, maxOutputTokens: 4096, timeoutMs: 90_000 }
    );
    const parsed = parseJsonObject<GeminiFilterResponse>(text);
    // Keep relevance order from Gemini, then rank by views high → low for the UI.
    const relevant = preserveYoutubeOrder(pool, parsed);
    const kept = sortByViewsDescending(relevant.length ? relevant : pool).slice(
      0,
      targetCount
    );
    const rejectedVideos = getRejectedVideos(pool, parsed, kept);

    return {
      videos: kept,
      rejectedVideos,
      filterSummary: parsed.summary,
      styleBrief: {
        ...emptyBrief(title, hook),
        summary:
          parsed.summary ||
          `Top ${kept.length || targetCount} relevant results for "${title}" (views descending).`,
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
    const fallback = sortByViewsDescending(pool).slice(0, targetCount);
    return {
      videos: fallback,
      rejectedVideos: [],
      styleBrief: {
        ...emptyBrief(title, hook),
        creativeDirection: `${topicContext.whatItIs}. Setting: ${topicContext.setting}.`,
        avoidList: topicContext.rejectVisuals.slice(0, 5),
      },
      titleSuggestions: fallback.slice(0, 3).map((v) => v.title),
      filteredCount: videos.length - fallback.length,
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
    const sorted = sortByViewsDescending(videos).slice(0, targetCount);
    return applyContentGateToFilterResult(
      {
        videos: sorted,
        rejectedVideos: [],
        styleBrief: emptyBrief(title, hook),
        titleSuggestions: sorted.slice(0, 3).map((v) => v.title),
        filteredCount: videos.length - sorted.length,
        channelStats: { kept: 0, droppedOffTopic: 0 },
        qualityRejected: 0,
      },
      { topic: title, hook }
    );
  }

  const topicContext =
    options?.topicContext || (await resolveTopicContext(apiKey, title, hook));

  if (mode === "light") {
    const light = await filterLightTopResults(title, videos, {
      apiKey,
      channelHandles,
      hook,
      targetCount,
      topicContext,
    });
    return applyContentGateToFilterResult(light, {
      topic: title,
      hook,
      topicContext,
      apiKey,
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
    // Relevance first, then views high → low for the research grid.
    const kept = sortByViewsDescending(orderedKept).slice(0, targetCount);
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

    return applyContentGateToFilterResult(
      {
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
      },
      { topic: title, hook, topicContext, apiKey }
    );
  } catch (err) {
    console.error("Gemini filter error:", err);
    const fallback = sortByViewsDescending(
      videos.filter((v) => scoreTopicMatch(title, v) > 0)
    ).slice(0, targetCount);
    const safe = fallback.length
      ? fallback
      : sortByViewsDescending(videos).slice(0, targetCount);
    return applyContentGateToFilterResult(
      {
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
      },
      { topic: title, hook, topicContext, apiKey }
    );
  }
}

/** Final display safety pass on curated results. */
async function applyContentGateToFilterResult(
  result: GeminiFilterResult,
  options: {
    topic: string;
    hook?: string;
    topicContext?: TopicContext;
    apiKey?: string;
  }
): Promise<GeminiFilterResult> {
  if (!result.videos.length) return result;

  const gate = await gateThumbnailContent(result.videos, {
    topic: options.topic,
    hook: options.hook,
    topicContext: options.topicContext || result.topicContext,
    apiKey: options.apiKey,
  });

  const gateRejected = gate.rejected;
  const summaryBits = [
    result.filterSummary,
    gate.nsfwDropped ? `blocked ${gate.nsfwDropped} NSFW` : null,
    gate.irrelevantDropped
      ? `dropped ${gate.irrelevantDropped} irrelevant`
      : null,
    gate.adultQuery ? "adult query — NSFW allowed when on-topic" : null,
  ].filter(Boolean);

  return {
    ...result,
    videos: gate.allowed,
    rejectedVideos: [...result.rejectedVideos, ...gateRejected],
    filterSummary: summaryBits.join(" · ") || result.filterSummary,
    filteredCount: result.filteredCount + gateRejected.length,
    qualityRejected: result.qualityRejected + gateRejected.length,
    contentGate: gate,
  };
}
