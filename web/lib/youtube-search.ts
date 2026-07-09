import type { InspirationVideo } from "@/lib/inspiration";

export type { InspirationVideo } from "@/lib/inspiration";
export { formatViews } from "@/lib/inspiration";

const DOCUMENTARY_HINTS = [
  "documentary",
  "explained",
  "explainer",
  "analysis",
  "investigation",
  "story",
  "news",
  "deep dive",
  "factory",
  "how it's made",
  "how its made",
  "inside",
  "process",
  "india",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.yt",
];

const SEARCH_TIMEOUT_MS = 12_000;

function parseViewCount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function videoIdFromUrl(url: string): string {
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/\/shorts\/([^/?]+)/);
  return match?.[1] || url.split("/").pop() || url;
}

function bestThumbnailUrl(thumbnails?: {
  maxres?: { url?: string };
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
}): string {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    ""
  );
}

function nicheScore(title: string, channel: string): number {
  const blob = `${title} ${channel}`.toLowerCase();
  return DOCUMENTARY_HINTS.reduce(
    (score, hint) => (blob.includes(hint) ? score + 1 : score),
    0
  );
}

function rankResults(items: InspirationVideo[]): InspirationVideo[] {
  return [...items]
    .sort((a, b) => {
      const nicheDiff = nicheScore(b.title, b.channel) - nicheScore(a.title, a.channel);
      if (nicheDiff !== 0) return nicheDiff;
      return b.viewCount - a.viewCount;
    })
    .slice(0, 20);
}

function dedupe(items: InspirationVideo[]): InspirationVideo[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.videoId)) return false;
    seen.add(item.videoId);
    return Boolean(item.thumbnailUrl);
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function searchYouTubeApi(apiKey: string, query: string): Promise<InspirationVideo[]> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", "15");
  searchUrl.searchParams.set("order", "viewCount");
  searchUrl.searchParams.set("relevanceLanguage", "en");
  searchUrl.searchParams.set("regionCode", "IN");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await withTimeout(
    fetch(searchUrl.toString(), { next: { revalidate: 0 } }),
    SEARCH_TIMEOUT_MS,
    "YouTube API search"
  );
  if (!searchRes.ok) throw new Error(`YouTube API search failed (${searchRes.status})`);

  const searchData = await searchRes.json();
  const ids = (searchData.items || [])
    .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
    .filter(Boolean);
  if (!ids.length) return [];

  const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  statsUrl.searchParams.set("part", "statistics,snippet");
  statsUrl.searchParams.set("id", ids.join(","));
  statsUrl.searchParams.set("key", apiKey);

  const statsRes = await withTimeout(
    fetch(statsUrl.toString(), { next: { revalidate: 0 } }),
    SEARCH_TIMEOUT_MS,
    "YouTube API stats"
  );
  if (!statsRes.ok) throw new Error(`YouTube API videos failed (${statsRes.status})`);

  const statsData = await statsRes.json();
  return (statsData.items || []).map(
    (item: {
      id: string;
      snippet?: {
        title?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: Parameters<typeof bestThumbnailUrl>[0];
      };
      statistics?: { viewCount?: string };
    }) => ({
      videoId: item.id,
      title: item.snippet?.title || "Untitled",
      channel: item.snippet?.channelTitle || "Unknown channel",
      viewCount: parseViewCount(item.statistics?.viewCount),
      thumbnailUrl: bestThumbnailUrl(item.snippet?.thumbnails),
      publishedAt: item.snippet?.publishedAt,
    })
  );
}

function parseViewCountText(text: string): number {
  const normalized = text.toLowerCase().replace(/,/g, "").replace(/ views?/g, "").trim();
  const match = normalized.match(/([\d.]+)\s*([kmb])?/i);
  if (!match) return parseViewCount(normalized);
  const num = parseFloat(match[1]);
  const suffix = match[2]?.toLowerCase();
  if (suffix === "k") return Math.round(num * 1_000);
  if (suffix === "m") return Math.round(num * 1_000_000);
  if (suffix === "b") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function extractInnerTubeVideos(payload: unknown): InspirationVideo[] {
  const found: InspirationVideo[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;

    if (record.videoRenderer && typeof record.videoRenderer === "object") {
      const v = record.videoRenderer as Record<string, unknown>;
      const videoId = String(v.videoId || "");
      const titleRuns = (v.title as { runs?: Array<{ text?: string }> })?.runs;
      const title =
        titleRuns?.[0]?.text ||
        (v.title as { simpleText?: string })?.simpleText ||
        "Untitled";
      const channelRuns =
        (v.ownerText as { runs?: Array<{ text?: string }> })?.runs ||
        (v.shortBylineText as { runs?: Array<{ text?: string }> })?.runs;
      const channel = channelRuns?.[0]?.text || "Unknown channel";
      const viewsText =
        (v.viewCountText as { simpleText?: string })?.simpleText ||
        (v.shortViewCountText as { simpleText?: string })?.simpleText ||
        "0";
      const thumbs = (v.thumbnail as { thumbnails?: Array<{ url?: string }> })?.thumbnails;
      const thumbnailUrl = thumbs?.[thumbs.length - 1]?.url || "";

      if (videoId && thumbnailUrl) {
        found.push({
          videoId,
          title,
          channel,
          viewCount: parseViewCountText(viewsText),
          thumbnailUrl: thumbnailUrl.startsWith("//") ? `https:${thumbnailUrl}` : thumbnailUrl,
        });
      }
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    Object.values(record).forEach(walk);
  }

  walk(payload);
  return found;
}

export async function searchInnerTube(query: string): Promise<InspirationVideo[]> {
  const res = await withTimeout(
    fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: { hl: "en", gl: "IN", clientName: "WEB", clientVersion: "2.20240228.01.00" },
        },
        query,
      }),
      next: { revalidate: 0 },
    }),
    SEARCH_TIMEOUT_MS,
    `InnerTube "${query}"`
  );

  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
  return extractInnerTubeVideos(await res.json());
}

async function searchPiped(query: string): Promise<InspirationVideo[]> {
  let lastError = "Piped search failed";
  for (const base of PIPED_INSTANCES) {
    try {
      const url = `${base}/search?q=${encodeURIComponent(query)}&filter=videos`;
      const res = await withTimeout(
        fetch(url, { headers: { "User-Agent": "thumbnail-generator/1.0" }, next: { revalidate: 0 } }),
        8_000,
        "Piped"
      );
      if (!res.ok) continue;
      const data = await res.json();
      const items = (data.items || data.results || []) as Array<{
        title?: string;
        uploaderName?: string;
        uploader?: string;
        views?: number | string;
        thumbnail?: string;
        url?: string;
      }>;
      return items.map((item) => ({
        videoId: videoIdFromUrl(item.url || ""),
        title: item.title || "Untitled",
        channel: item.uploaderName || item.uploader || "Unknown channel",
        viewCount: parseViewCount(item.views),
        thumbnailUrl: item.thumbnail || "",
      }));
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  throw new Error(lastError);
}

function buildSearchQueries(title: string, fast = false): string[] {
  const trimmed = title.trim();
  if (fast) return [trimmed, `${trimmed} factory how it's made`, `${trimmed} documentary`];
  return [
    trimmed,
    `${trimmed} documentary explained`,
    `${trimmed} factory`,
    `${trimmed} inside`,
    `${trimmed} process`,
  ];
}

export type SearchResult = {
  results: InspirationVideo[];
  queries: string[];
  source: "youtube-api" | "youtube-search" | "piped" | "mixed";
};

export async function searchTopThumbnails(
  title: string,
  options?: { fast?: boolean }
): Promise<SearchResult> {
  if (!title.trim()) return { results: [], queries: [], source: "youtube-search" };

  const fast = options?.fast ?? false;
  const queries = buildSearchQueries(title, fast);
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey) {
    try {
      const batches = await Promise.all(
        queries.map((q) =>
          searchYouTubeApi(apiKey, q).catch((err) => {
            console.error(`YouTube API "${q}" failed:`, err);
            return [] as InspirationVideo[];
          })
        )
      );
      const results = rankResults(dedupe(batches.flat()));
      if (results.length) return { results, queries, source: "youtube-api" };
    } catch (err) {
      console.error("YouTube API search failed, falling back:", err);
    }
  }

  const innerBatches = await Promise.all(
    queries.map((q) =>
      searchInnerTube(q).catch((err) => {
        console.error(`InnerTube "${q}" failed:`, err);
        return [] as InspirationVideo[];
      })
    )
  );
  let results = rankResults(dedupe(innerBatches.flat()));
  if (results.length) return { results, queries, source: "youtube-search" };

  if (!fast) {
    try {
      const piped = await searchPiped(queries[0]);
      results = rankResults(dedupe(piped));
      if (results.length) return { results, queries, source: "piped" };
    } catch (err) {
      console.error("Piped failed:", err);
    }
  }

  if (!results.length) {
    throw new Error("Could not find YouTube thumbnails. Try a shorter title.");
  }
  return { results, queries, source: "youtube-search" };
}
