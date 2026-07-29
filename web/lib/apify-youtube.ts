import type { InspirationVideo } from "@/lib/inspiration";
import { isYouTubeShort } from "@/lib/shorts-filter";
import { runtimeEnv } from "@/lib/runtime-env";

const ACTOR_ID = "streamers~youtube-scraper";
const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_TIMEOUT_MS = 40_000;
export const TARGET_RESULTS = 6;
/** How many landscape Apify candidates to pass into Gemini quality filter. */
export const APIFY_POOL_SIZE = 25;

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

export function parseDurationSeconds(duration?: string): number | null {
  if (!duration?.trim()) return null;
  const raw = duration.trim();

  if (/^PT/i.test(raw)) {
    const h = raw.match(/(\d+)H/i)?.[1];
    const m = raw.match(/(\d+)M/i)?.[1];
    const s = raw.match(/(\d+)S/i)?.[1];
    return (h ? parseInt(h, 10) * 3600 : 0) + (m ? parseInt(m, 10) * 60 : 0) + (s ? parseInt(s, 10) : 0);
  }

  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const parts = raw.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function bestThumb(item: ApifyItem): string {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  const thumbs = item.thumbnails || [];
  return thumbs[thumbs.length - 1]?.url || "";
}

function toScrapedVideo(item: ApifyItem): ScrapedVideo | null {
  const videoId = item.id || "";
  const thumbnailUrl = bestThumb(item);
  const url = item.url || `https://www.youtube.com/watch?v=${videoId}`;
  if (!videoId || !thumbnailUrl) return null;
  if (
    isYouTubeShort({
      videoId,
      title: item.title,
      url,
      duration: item.duration,
      description: item.description,
      thumbnailUrl,
    })
  ) {
    return null;
  }

  return {
    videoId,
    title: item.title || "Untitled",
    channel: item.channelName || "Unknown channel",
    viewCount: parseViews(item.viewCount),
    thumbnailUrl,
    description: (item.description || "").slice(0, 500),
    duration: item.duration,
    publishedAt: item.date,
    url,
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

function dedupeSort(videos: ScrapedVideo[]): ScrapedVideo[] {
  const seen = new Set<string>();
  return videos
    .filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    })
    .sort((a, b) => b.viewCount - a.viewCount);
}

export async function scrapeYouTubeWithApify(
  topic: string,
  options?: { channels?: string; maxResults?: number }
): Promise<ScrapedVideo[]> {
  const token = runtimeEnv("APIFY_API_TOKEN");
  if (!token) throw new Error("APIFY_API_TOKEN not configured");

  const channelUrls = parseChannelUrls(options?.channels);
  const input: ApifyRunInput = {
    maxResults: options?.maxResults ?? 30,
    maxResultsShorts: 0,
    maxResultStreams: 0,
    sortingOrder: "relevance",
  };

  if (channelUrls.length) {
    input.startUrls = channelUrls.map((url) => ({ url }));
    input.searchQueries = [topic.trim()];
  } else {
    input.searchQueries = [
      topic.trim(),
      `${topic.trim()} explained`,
      `${topic.trim()} highlights`,
      `${topic.trim()} full`,
      `${topic.trim()} review`,
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
  return dedupeSort(
    items.map(toScrapedVideo).filter((v): v is ScrapedVideo => v !== null)
  );
}

export async function tryApifyScrape(
  topic: string,
  options?: { channels?: string; maxResults?: number }
): Promise<ScrapedVideo[] | null> {
  if (!runtimeEnv("APIFY_API_TOKEN")) return null;
  try {
    return await scrapeYouTubeWithApify(topic, options);
  } catch (err) {
    console.error("Apify failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Apify-only search: landscape videos (no Shorts), top N by views. */
export async function searchLongFormViaApify(
  topic: string,
  options?: { channels?: string; target?: number }
): Promise<ScrapedVideo[]> {
  const target = options?.target ?? TARGET_RESULTS;
  let videos = await scrapeYouTubeWithApify(topic, {
    channels: options?.channels,
    maxResults: 35,
  });

  if (videos.length < target) {
    const more = await scrapeYouTubeWithApify(topic, {
      channels: options?.channels,
      maxResults: 50,
    });
    const seen = new Set(videos.map((v) => v.videoId));
    for (const v of more) {
      if (!seen.has(v.videoId)) {
        seen.add(v.videoId);
        videos.push(v);
      }
    }
    videos = dedupeSort(videos);
  }

  return videos.slice(0, target);
}
