import type { InspirationVideo } from "@/lib/inspiration";

const ACTOR_ID = "streamers~youtube-scraper";
const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_TIMEOUT_MS = 40_000;

export type ScrapedVideo = InspirationVideo & {
  description: string;
  duration?: string;
  publishedAt?: string;
  url: string;
};

type ApifyRunInput = {
  searchQueries?: string[];
  startUrls?: Array<{ url: string }>;
  maxResults: number;
  maxResultsShorts: number;
  maxResultStreams: number;
  sortingOrder?: string;
};

type ApifyItem = {
  id?: string;
  url?: string;
  title?: string;
  description?: string;
  channelName?: string;
  channelUrl?: string;
  viewCount?: number | string;
  thumbnailUrl?: string;
  thumbnails?: Array<{ url?: string }>;
  date?: string;
  duration?: string;
};

function parseViews(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function bestThumb(item: ApifyItem): string {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  const thumbs = item.thumbnails || [];
  return thumbs[thumbs.length - 1]?.url || "";
}

function toScrapedVideo(item: ApifyItem): ScrapedVideo | null {
  const videoId = item.id || "";
  const thumbnailUrl = bestThumb(item);
  if (!videoId || !thumbnailUrl) return null;

  return {
    videoId,
    title: item.title || "Untitled",
    channel: item.channelName || "Unknown channel",
    viewCount: parseViews(item.viewCount),
    thumbnailUrl,
    description: (item.description || "").slice(0, 500),
    duration: item.duration,
    publishedAt: item.date,
    url: item.url || `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function parseChannelUrls(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("youtube.com") || s.includes("youtu.be"))
    .slice(0, 4);
}

export async function scrapeYouTubeWithApify(
  topic: string,
  options?: { channels?: string; maxResults?: number }
): Promise<ScrapedVideo[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not configured");

  const channelUrls = parseChannelUrls(options?.channels);
  const input: ApifyRunInput = {
    maxResults: options?.maxResults ?? 15,
    maxResultsShorts: 0,
    maxResultStreams: 0,
    sortingOrder: "viewCount",
  };

  if (channelUrls.length) {
    input.startUrls = channelUrls.map((url) => ({ url }));
    input.searchQueries = [topic.trim()];
  } else {
    input.searchQueries = [
      topic.trim(),
      `${topic.trim()} how it's made`,
      `${topic.trim()} documentary`,
      `${topic.trim()} explained`,
      `${topic.trim()} factory`,
    ].slice(0, 5);
  }

  const runRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?waitForFinish=40&token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
    }
  );

  if (!runRes.ok) {
    const detail = await runRes.text();
    throw new Error(`Apify run failed (${runRes.status}): ${detail.slice(0, 300)}`);
  }

  const run = await runRes.json();
  const datasetId = run.data?.defaultDatasetId;
  if (!datasetId) throw new Error("Apify run returned no dataset");

  const dataRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&clean=true&format=json`,
    { signal: AbortSignal.timeout(12_000) }
  );
  if (!dataRes.ok) throw new Error(`Apify dataset fetch failed (${dataRes.status})`);

  const items = (await dataRes.json()) as ApifyItem[];
  const seen = new Set<string>();
  return items
    .map(toScrapedVideo)
    .filter((v): v is ScrapedVideo => v !== null)
    .filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    })
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 25);
}

export async function tryApifyScrape(
  topic: string,
  options?: { channels?: string }
): Promise<ScrapedVideo[] | null> {
  if (!process.env.APIFY_API_TOKEN) return null;
  try {
    return await scrapeYouTubeWithApify(topic, options);
  } catch (err) {
    console.error("Apify skipped:", err instanceof Error ? err.message : err);
    return null;
  }
}
