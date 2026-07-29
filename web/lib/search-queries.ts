import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import { thumbnailUrlCandidates } from "@/lib/extract-colors";
import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const QUERY_MODEL = "gemini-2.5-flash";
/** Explore/similar query generation — same fallback chain as gemini-filter. */
const EXPLORE_QUERY_MODELS = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
] as const;

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

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
      // try next candidate
    }
  }
  return null;
}

/** Topics that actually want documentary / factory / process framing. */
const DOCUMENTARY_SIGNAL =
  /\b(documentary|factory|factories|how\s*it'?s\s*made|manufactur|process|plant|warehouse|assembly|investigation|business|industry|inside\s+the)\b/i;

/** Lifestyle/relationship vlog queries — wrong format for sports/training/race explore. */
const LIFESTYLE_VLOG_SIGNAL =
  /\b(vlog|boyfriend|girlfriend|couple|surprised?\s+my|my\s+boyfriend|my\s+girlfriend|relationship|daily\s+life|what\s+i\s+did\s+for|travel\s+vlog|see\s+what\s+i\s+did)\b/i;

function looksDocumentary(topic: string, hook?: string): boolean {
  return DOCUMENTARY_SIGNAL.test(`${topic} ${hook ?? ""}`);
}

/**
 * YouTube-style expansions: lead with the raw topic (what YT ranks highest),
 * then light, genre-neutral variants. Documentary/factory templates only when
 * the topic itself signals that niche — otherwise they pollute results
 * (e.g. "hyrox factory how it's made").
 */
export function buildExpandedSearchQueries(topic: string, hook?: string): string[] {
  const t = topic.trim();
  if (!t) return [];

  const short = t.split("|")[0].trim();
  const queries: string[] = [t];

  if (hook?.trim()) {
    queries.push(`${t} ${hook.trim()}`);
  }

  if (looksDocumentary(t, hook)) {
    queries.push(
      `${t} documentary`,
      `${t} explained`,
      `${t} how it's made`,
      `${t} inside the factory`,
      `${short} process`
    );
  } else {
    // Neutral expansions — niche-specific terms come from expandQueriesForTopic().
    queries.push(
      short,
      `${t} explained`,
      `${short} highlights`,
      `${short} review`,
      `${short} full`,
      `${short} 2025`
    );
  }

  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 8);
}

/**
 * Ask Gemini for literal YouTube search strings for this topic's real niche.
 * Falls back to heuristic expansions on timeout/error.
 */
export async function expandQueriesForTopic(
  topic: string,
  hook?: string
): Promise<string[]> {
  const fallback = buildExpandedSearchQueries(topic, hook);
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey || !topic.trim()) return fallback;

  const prompt = `You write YouTube SEARCH queries that return the same kind of videos YouTube recommends for a topic.

Topic: "${topic.trim()}"
${hook?.trim() ? `Optional hook / angle: "${hook.trim()}"` : ""}

Return 6 short YouTube search strings people actually type for this topic.
Rules:
- First query MUST be the topic itself (or a tiny cleanup)
- Stay in the topic's real niche (fitness/race/gaming/finance/etc.) — do NOT force documentary, factory, "how it's made", or India process unless the topic is about that
- Prefer relevance over buzzwords like "premium"
- No clickbait, no hashtags

Return ONLY a JSON array of 6 strings.`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${QUERY_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 350 },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ||
      "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as string[];
    const cleaned = parsed.map((q) => String(q).trim()).filter(Boolean);
    if (!cleaned.length) return fallback;
    // Always keep raw topic first so relevance ranking has a strong anchor batch.
    return [...new Set([topic.trim(), ...cleaned, ...fallback])].slice(0, 8);
  } catch {
    return fallback;
  }
}

async function geminiExploreQueryGenerate(
  apiKey: string,
  parts: GeminiPart[]
): Promise<string> {
  let lastErr: Error | null = null;
  for (const model of EXPLORE_QUERY_MODELS) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.25, maxOutputTokens: 280 },
        }),
        signal: AbortSignal.timeout(14_000),
      });
      if (!res.ok) {
        lastErr = new Error(`gemini explore query ${model} ${res.status}`);
        if (res.status === 400 || res.status === 404) continue;
        throw lastErr;
      }
      const data = await res.json();
      const text =
        data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ||
        "";
      if (!text.trim()) {
        lastErr = new Error(`gemini explore query ${model} empty`);
        continue;
      }
      console.log(`[search-queries] explore model=${model}`);
      return text;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (/timeout|fetch failed/i.test(lastErr.message)) throw lastErr;
    }
  }
  throw lastErr || new Error("All explore query models failed");
}

function buildSimilarExploreFallback(
  topic: string,
  seed: Pick<InspirationVideo, "title" | "channel">,
  comment?: string
): string[] {
  const queries = buildSimilarQueries(topic, seed, comment);
  const filtered = looksDocumentary(topic, comment)
    ? queries
    : queries.filter((q) => !DOCUMENTARY_SIGNAL.test(q));
  return [...new Set(filtered.map((q) => q.trim()).filter(Boolean))].slice(0, 3);
}

/**
 * Compass Explore: vision + title → 1–3 precise YouTube queries for similar landscape refs.
 * No documentary/factory template expansion unless the topic itself signals that niche.
 */
export async function buildSimilarExploreQueries(input: {
  topic: string;
  seed: Pick<InspirationVideo, "title" | "channel" | "thumbnailUrl" | "videoId">;
  comment?: string;
  feedback?: ThumbnailFeedback[];
}): Promise<string[]> {
  const fallback = buildSimilarExploreFallback(input.topic, input.seed, input.comment);
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey || !input.topic.trim() || !input.seed.title.trim()) return fallback;

  const likedNotes = (input.feedback || [])
    .filter((f) => f.rating === "like" && (f.comment || f.videoId !== input.seed.videoId))
    .map((f) => `- LIKED "${f.title}"${f.comment ? `: ${f.comment}` : ""}`)
    .join("\n");
  const dislikedNotes = (input.feedback || [])
    .filter((f) => f.rating === "dislike")
    .map((f) => `- AVOID "${f.title}"${f.comment ? `: ${f.comment}` : ""}`)
    .join("\n");

  const parts: GeminiPart[] = [];
  const seedImg = input.seed.thumbnailUrl
    ? await fetchThumbInline(input.seed.thumbnailUrl, input.seed.videoId)
    : null;
  if (seedImg) {
    parts.push({
      text: `SEED THUMBNAIL to match (composition, color energy, subject scale, typography):\n"${input.seed.title}" by ${input.seed.channel}`,
    });
    parts.push({ inlineData: seedImg });
  }

  parts.push({
    text: `You write 1–3 YouTube SEARCH queries to find landscape videos with thumbnails visually and topically similar to the seed.

Research topic: "${input.topic.trim()}"
Seed video: "${input.seed.title}" by ${input.seed.channel}
${input.comment?.trim() ? `User note on seed: "${input.comment.trim()}"` : ""}
${likedNotes ? `Other liked refs:\n${likedNotes}` : ""}
${dislikedNotes ? `Disliked / avoid:\n${dislikedNotes}` : ""}

Rules:
- Return 1–3 short, concrete YouTube search strings (what people actually type)
- Match the seed's ACTUAL content format — race, training, competition, technique, event coverage — not personal vlogs
- Target thumbnails whose PRIMARY subject is the topic activity (athletes, stations, race action, training, format) matching seed layout/palette/subject scale
- Prefer format-specific queries: "[topic] race highlights", "[topic] training workout", "[topic] competition recap", "[topic] athlete"
- Do NOT write queries that surface lifestyle/relationship vlogs: no "vlog", "boyfriend", "girlfriend", "couple", "surprise", "what I did for", "daily life"
- Do NOT force documentary, factory, "how it's made", or process framing unless the topic is about that
- Do NOT drift into unrelated niches or wrong venues (e.g. outdoor athletics track for indoor HYROX)
- No hashtags, no clickbait

Return ONLY a JSON array of 1–3 strings.`,
  });

  try {
    const text = await geminiExploreQueryGenerate(apiKey, parts);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as string[];
    const cleaned = parsed.map((q) => String(q).trim()).filter(Boolean);
    if (!cleaned.length) return fallback;
    const noDoc = looksDocumentary(input.topic, input.comment)
      ? cleaned
      : cleaned.filter((q) => !DOCUMENTARY_SIGNAL.test(q));
    const noLifestyle = noDoc.filter((q) => !LIFESTYLE_VLOG_SIGNAL.test(q));
    const final = noLifestyle.length ? noLifestyle : noDoc;
    return [...new Set(final)].slice(0, 3);
  } catch (err) {
    console.warn("[search-queries] buildSimilarExploreQueries failed:", err);
    return fallback;
  }
}

export function buildSimilarQueries(
  topic: string,
  seed: Pick<InspirationVideo, "title" | "channel">,
  feedbackComment?: string
): string[] {
  const shortTitle = seed.title.split("|")[0].trim();
  const titleWords = shortTitle
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ");
  const commentBits = (feedbackComment || "")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .join(" ");

  const queries = [
    topic.trim(),
    `${seed.channel} ${topic}`,
    `${topic} ${titleWords || shortTitle}`,
    `${titleWords || shortTitle}`,
    `${seed.channel} ${titleWords}`.trim(),
    commentBits ? `${topic} ${commentBits}` : "",
    commentBits ? `${seed.channel} ${commentBits}` : "",
  ];

  if (looksDocumentary(topic, feedbackComment)) {
    queries.push(`${shortTitle} documentary`, `${topic} explained`);
  }

  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 8);
}

export async function expandQueriesFromFeedback(input: {
  topic: string;
  seed?: Pick<InspirationVideo, "title" | "channel">;
  feedback: ThumbnailFeedback[];
}): Promise<string[]> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  const liked = input.feedback.filter((f) => f.rating === "like");
  const notes = input.feedback
    .filter((f) => f.comment || f.rating === "like")
    .map((f) => `[${f.rating}] ${f.title}: ${f.comment || "liked"}`)
    .join("\n");

  const fallback = input.seed
    ? buildSimilarQueries(input.topic, input.seed, liked[0]?.comment)
    : buildExpandedSearchQueries(input.topic);

  if (!apiKey || !notes.trim()) return fallback;

  const prompt = `You are a YouTube research assistant. Generate 6 YouTube SEARCH queries to find thumbnails on the SAME TOPIC the user is researching, similar to what they liked.

Topic: "${input.topic}"
${input.seed ? `Seed video: "${input.seed.title}" by ${input.seed.channel}` : ""}

User feedback on liked thumbnails:
${notes}

Rules:
- Queries must be searchable on YouTube (short, concrete)
- Stay on-topic for "${input.topic}" — do not drift into unrelated niches
- Incorporate what the user praised (colors, composition, subject) without forcing documentary/factory framing unless the topic is that
- Mix broad and specific queries

Return ONLY a JSON array of 6 strings.`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${QUERY_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ||
      "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as string[];
    const cleaned = parsed.map((q) => String(q).trim()).filter(Boolean);
    return cleaned.length ? cleaned.slice(0, 6) : fallback;
  } catch {
    return fallback;
  }
}
