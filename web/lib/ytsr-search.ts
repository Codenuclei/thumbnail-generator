import type { ScrapedVideo } from "@/lib/apify-youtube";
import { TARGET_RESULTS, tryApifyScrape } from "@/lib/apify-youtube";
import { fetchChannelPublicVideos } from "@/lib/channel-videos";
import { buildExpandedSearchQueries } from "@/lib/search-queries";
import { filterOutShortsDeep, isYouTubeShort } from "@/lib/shorts-filter";
import {
  parseChannelHandles,
  videoFromChannelFetch,
  videoFromReferenceChannel,
} from "@/lib/title-relevance";

const BASE_API_URL = "https://www.youtube.com/youtubei/v1/search";
const CLIENT_VERSION = "2.20240606.06.00";
const SEARCH_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Candidate pool passed to Gemini quality filter. */
export const SEARCH_POOL_SIZE = 25;
const MIN_POOL_BEFORE_GEMINI = 8;

type YtsrContext = {
  client: {
    utcOffsetMinutes: number;
    gl: string;
    hl: string;
    clientName: string;
    clientVersion: string;
  };
  user: Record<string, unknown>;
};

type ParsedVideo = {
  videoId: string;
  title: string;
  channel: string;
  viewCount: number;
  thumbnailUrl: string;
  description: string;
  duration?: string;
  publishedAt?: string;
  url: string;
  isLive: boolean;
  isUpcoming: boolean;
  hasShortViewCount?: boolean;
};

function buildContext(): YtsrContext {
  return {
    client: {
      utcOffsetMinutes: 330,
      gl: "IN",
      hl: "en",
      clientName: "WEB",
      clientVersion: CLIENT_VERSION,
    },
    user: {},
  };
}

function parseText(txt: unknown): string {
  if (!txt || typeof txt !== "object") return "";
  const t = txt as { simpleText?: string; content?: string; runs?: Array<{ text?: string }> };
  return (
    t.content ||
    t.simpleText ||
    (Array.isArray(t.runs) ? t.runs.map((a) => a.text || "").join("") : "")
  );
}

function parseIntegerFromText(x: unknown): number {
  if (typeof x === "string") return Number(x.replace(/\D+/g, "")) || 0;
  return Number(parseText(x).replace(/\D+/g, "")) || 0;
}

function parseViewCountText(text: string): number {
  const normalized = text.toLowerCase().replace(/,/g, "").replace(/ views?/g, "").trim();
  const match = normalized.match(/([\d.]+)\s*([kmb])?/i);
  if (!match) return parseInt(normalized.replace(/\D/g, ""), 10) || 0;
  const num = parseFloat(match[1]);
  const suffix = match[2]?.toLowerCase();
  if (suffix === "k") return Math.round(num * 1_000);
  if (suffix === "m") return Math.round(num * 1_000_000);
  if (suffix === "b") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function prepImg(thumbs: Array<{ url?: string; width?: number }>): string {
  const sorted = thumbs
    .map((t) => ({
      url: t.url?.startsWith("//") ? `https:${t.url}` : t.url || "",
      width: t.width || 0,
    }))
    .filter((t) => t.url)
    .sort((a, b) => b.width - a.width);
  return sorted[0]?.url || "";
}

function parseLockupViewModel(obj: Record<string, unknown>): ParsedVideo | null {
  const videoId = String(obj.contentId || "");
  if (!videoId || obj.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;

  const metadata = obj.metadata as
    | { lockupMetadataViewModel?: Record<string, unknown> }
    | undefined;
  const meta = metadata?.lockupMetadataViewModel;
  const title = parseText(meta?.title) || "Untitled";

  const image = obj.contentImage as
    | {
        thumbnailViewModel?: {
          image?: { sources?: Array<{ url?: string; width?: number }> };
          overlays?: Array<{
            thumbnailBottomOverlayViewModel?: {
              badges?: Array<{ thumbnailBadgeViewModel?: { text?: string } }>;
            };
          }>;
        };
      }
    | undefined;
  const thumbnailUrl = prepImg(image?.thumbnailViewModel?.image?.sources || []);
  if (!thumbnailUrl) return null;

  const duration =
    image?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]
      ?.thumbnailBadgeViewModel?.text;
  const metadataRows = (
    meta?.metadata as { metadataRows?: Array<{ metadataParts?: Array<{ text?: { content?: string } }> }> }
  )?.metadataRows;
  const viewsText = metadataRows?.[0]?.metadataParts?.[0]?.text?.content || "0";

  return {
    videoId,
    title,
    channel: "Unknown channel",
    viewCount: parseViewCountText(viewsText),
    thumbnailUrl,
    description: "",
    duration,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    isLive: false,
    isUpcoming: false,
  };
}

/** Port of distubejs/ytsr parseItem.js — videoRenderer branch. */
function parseVideoRenderer(obj: Record<string, unknown>): ParsedVideo | null {
  const badges = Array.isArray(obj.badges)
    ? (obj.badges as Array<{ metadataBadgeRenderer?: { label?: string } }>).map(
        (a) => a.metadataBadgeRenderer?.label || ""
      )
    : [];
  const isLive = badges.some((b) => ["LIVE NOW", "LIVE"].includes(b));
  const upcoming = obj.upcomingEventData
    ? Number(`${(obj.upcomingEventData as { startTime?: string }).startTime}000`)
    : null;

  const overlays = Array.isArray(obj.thumbnailOverlays) ? obj.thumbnailOverlays : [];
  const lengthFallback = overlays.find((x) => Object.keys(x as object)[0] === "thumbnailOverlayTimeStatusRenderer") as
    | { thumbnailOverlayTimeStatusRenderer?: { text?: unknown } }
    | undefined;
  const length = obj.lengthText || lengthFallback?.thumbnailOverlayTimeStatusRenderer?.text;
  const duration = parseText(length) || undefined;

  const videoId = String(obj.videoId || "");
  const title = parseText(obj.title) || "Untitled";
  const thumbs = (obj.thumbnail as { thumbnails?: Array<{ url?: string; width?: number }> })?.thumbnails || [];
  const thumbnailUrl = prepImg(thumbs);
  if (!videoId || !thumbnailUrl) return null;

  const ownerRuns = (obj.ownerText as { runs?: Array<{ text?: string }> })?.runs;
  const shortByline = (obj.shortBylineText as { runs?: Array<{ text?: string }> })?.runs;
  if (shortByline?.length && !ownerRuns?.length) return null;

  const channel = ownerRuns?.[0]?.text || shortByline?.[0]?.text || "Unknown channel";
  const hasShortViewCount = !obj.viewCountText && !!obj.shortViewCountText;
  const views = obj.viewCountText
    ? parseIntegerFromText(obj.viewCountText)
    : obj.shortViewCountText
      ? parseIntegerFromText(obj.shortViewCountText)
      : 0;
  const description = parseText(obj.descriptionSnippet);
  const publishedAt = parseText(obj.publishedTimeText) || undefined;

  return {
    videoId,
    title,
    channel,
    viewCount: views,
    thumbnailUrl,
    description: description.slice(0, 500),
    duration,
    publishedAt,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    isLive,
    isUpcoming: !!upcoming,
    hasShortViewCount,
  };
}

function parseItem(item: Record<string, unknown>): ParsedVideo | null {
  if ("videoRenderer" in item) {
    return parseVideoRenderer(item.videoRenderer as Record<string, unknown>);
  }
  if ("gridVideoRenderer" in item) {
    return parseVideoRenderer(item.gridVideoRenderer as Record<string, unknown>);
  }
  if ("richItemRenderer" in item) {
    const content = (item.richItemRenderer as { content?: Record<string, unknown> })?.content;
    if (content) return parseItem(content);
  }
  if ("lockupViewModel" in item) {
    return parseLockupViewModel(item.lockupViewModel as Record<string, unknown>);
  }
  return null;
}

function parseWrapper(primaryContents: Record<string, unknown>): {
  rawItems: Record<string, unknown>[];
  continuationToken: string | null;
} {
  let rawItems: Record<string, unknown>[] = [];
  let continuationToken: string | null = null;

  const sectionList = primaryContents.sectionListRenderer as
    | { contents?: Record<string, unknown>[] }
    | undefined;
  if (sectionList?.contents) {
    const itemSection = sectionList.contents.find((x) => "itemSectionRenderer" in x) as
      | { itemSectionRenderer?: { contents?: Record<string, unknown>[] } }
      | undefined;
    rawItems = itemSection?.itemSectionRenderer?.contents || [];
    const cont = sectionList.contents.find((x) => "continuationItemRenderer" in x) as
      | {
          continuationItemRenderer?: {
            continuationEndpoint?: { continuationCommand?: { token?: string } };
          };
        }
      | undefined;
    continuationToken =
      cont?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
  }

  const richGrid = primaryContents.richGridRenderer as { contents?: Record<string, unknown>[] } | undefined;
  if (richGrid?.contents) {
    rawItems = richGrid.contents
      .filter((x) => !("continuationItemRenderer" in x))
      .map((x) => {
        const rich = x as {
          richItemRenderer?: { content?: Record<string, unknown> };
          richSectionRenderer?: { content?: Record<string, unknown> };
        };
        return rich.richItemRenderer?.content || rich.richSectionRenderer?.content;
      })
      .filter((x): x is Record<string, unknown> => !!x);
    const cont = richGrid.contents.find((x) => "continuationItemRenderer" in x) as
      | {
          continuationItemRenderer?: {
            continuationEndpoint?: { continuationCommand?: { token?: string } };
          };
        }
      | undefined;
    continuationToken =
      cont?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
  }

  return { rawItems, continuationToken };
}

function parsePage2Wrapper(continuationItems: Record<string, unknown>[]): {
  rawItems: Record<string, unknown>[];
  continuationToken: string | null;
} {
  const rawItems: Record<string, unknown>[] = [];
  let continuationToken: string | null = null;

  for (const ci of continuationItems) {
    if ("itemSectionRenderer" in ci) {
      const section = ci.itemSectionRenderer as { contents?: Record<string, unknown>[] };
      rawItems.push(...(section.contents || []));
    } else if ("richItemRenderer" in ci) {
      const rich = ci.richItemRenderer as { content?: Record<string, unknown> };
      if (rich.content) rawItems.push(rich.content);
    } else if ("richSectionRenderer" in ci) {
      const rich = ci.richSectionRenderer as { content?: Record<string, unknown> };
      if (rich.content) rawItems.push(rich.content);
    } else if ("continuationItemRenderer" in ci) {
      const cont = ci.continuationItemRenderer as {
        continuationEndpoint?: { continuationCommand?: { token?: string } };
      };
      continuationToken = cont.continuationEndpoint?.continuationCommand?.token || null;
    }
  }

  return { rawItems, continuationToken };
}

async function postSearch(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_API_URL}?prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Cookie: "SOCS=CAI",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
  return res.json();
}

async function fetchSearchPage(query: string, limit: number): Promise<ParsedVideo[]> {
  const context = buildContext();
  const json = await postSearch({ context, query });
  const contents = json.contents as {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: Record<string, unknown>;
    };
  };
  const primary = contents?.twoColumnSearchResultsRenderer?.primaryContents;
  if (!primary) return [];

  const collected: ParsedVideo[] = [];
  let { rawItems, continuationToken } = parseWrapper(primary);

  const ingest = (items: Record<string, unknown>[]) => {
    for (const item of items) {
      if (collected.length >= limit) break;
      const parsed = parseItem(item);
      if (parsed) collected.push(parsed);
    }
  };

  ingest(rawItems);

  while (continuationToken && collected.length < limit) {
    const contJson = await postSearch({ context, continuation: continuationToken });
    const commands = contJson.onResponseReceivedCommands as Array<{
      appendContinuationItemsAction?: { continuationItems?: Record<string, unknown>[] };
    }>;
    const continuationItems = commands?.[0]?.appendContinuationItemsAction?.continuationItems;
    if (!continuationItems?.length) break;

    const page2 = parsePage2Wrapper(continuationItems);
    ingest(page2.rawItems);
    continuationToken = page2.continuationToken;
  }

  return collected;
}

function isLandscapeCandidate(video: ParsedVideo): boolean {
  if (video.isLive || video.isUpcoming) return false;

  return !isYouTubeShort({
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    duration: video.duration,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    hasShortViewCount: video.hasShortViewCount,
  });
}

function toScrapedVideo(video: ParsedVideo): ScrapedVideo {
  return {
    videoId: video.videoId,
    title: video.title,
    channel: video.channel,
    viewCount: video.viewCount,
    thumbnailUrl: video.thumbnailUrl,
    description: video.description,
    duration: video.duration,
    publishedAt: video.publishedAt,
    url: video.url,
  };
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

function matchesChannelScope(
  video: ScrapedVideo,
  channelsRaw: string | undefined,
  channelVideoIds: Set<string>
): boolean {
  if (!channelsRaw?.trim()) return true;
  if (videoFromChannelFetch(video, channelVideoIds)) return true;

  const handles = parseChannelHandles(channelsRaw);
  const nameHandles = handles.filter((h) => !/^uc[\w-]{10,}$/i.test(h));

  // Channel URL fetch failed — don't block topic search entirely.
  if (channelVideoIds.size === 0 && !nameHandles.length) return true;

  if (!nameHandles.length) return false;

  return videoFromReferenceChannel(video, nameHandles);
}

async function searchQuery(query: string, perQueryLimit: number): Promise<ScrapedVideo[]> {
  try {
    const parsed = await fetchSearchPage(query, perQueryLimit);
    return parsed.filter(isLandscapeCandidate).map(toScrapedVideo);
  } catch (err) {
    console.error(`ytsr "${query}" failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function applyLandscapeFilter(
  videos: ScrapedVideo[],
  target: number
): Promise<ScrapedVideo[]> {
  const metadataFiltered = videos.filter(
    (v) =>
      !isYouTubeShort({
        videoId: v.videoId,
        title: v.title,
        url: v.url,
        duration: v.duration,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
      })
  );

  if (metadataFiltered.length <= target + 2) {
    return metadataFiltered;
  }

  const deepFiltered = await filterOutShortsDeep(metadataFiltered);
  if (deepFiltered.length >= Math.min(MIN_POOL_BEFORE_GEMINI, target)) {
    return deepFiltered;
  }

  return metadataFiltered;
}

async function supplementWithApify(
  topic: string,
  channels: string | undefined,
  existing: ScrapedVideo[],
  channelVideoIds: Set<string>
): Promise<ScrapedVideo[]> {
  const apify = await tryApifyScrape(topic, { channels, maxResults: 40 });
  if (!apify?.length) return existing;

  const seen = new Set(existing.map((v) => v.videoId));
  const merged = [...existing];
  for (const video of apify) {
    if (seen.has(video.videoId)) continue;
    if (!matchesChannelScope(video, channels, channelVideoIds)) continue;
    if (isYouTubeShort(video)) continue;
    seen.add(video.videoId);
    merged.push(video);
  }
  return dedupeSort(merged);
}

/**
 * Fast YouTube search via InnerTube (ytsr-style parsing).
 * Topic search is primary; reference channels supplement rather than replace it.
 */
export async function searchLongFormViaYtsr(
  topic: string,
  options?: { channels?: string; target?: number; hook?: string }
): Promise<ScrapedVideo[]> {
  const target = options?.target ?? SEARCH_POOL_SIZE;
  const channelsRaw = options?.channels?.trim() || "";
  const handles = channelsRaw ? parseChannelHandles(channelsRaw) : [];

  const channelVideoIds = new Set<string>();
  let videos: ScrapedVideo[] = [];

  if (channelsRaw) {
    const channelVideos = await fetchChannelPublicVideos(channelsRaw, { limit: target });
    for (const video of channelVideos) {
      channelVideoIds.add(video.videoId);
    }
    videos = dedupeSort(channelVideos);
  }

  const queries = buildExpandedSearchQueries(topic, options?.hook).slice(0, 5);
  const perQueryLimit = Math.ceil(target / Math.max(queries.length, 1)) + 15;
  const batches = await Promise.all(queries.map((q) => searchQuery(q, perQueryLimit)));

  const seen = new Set(videos.map((v) => v.videoId));
  for (const batch of batches) {
    for (const video of batch) {
      if (seen.has(video.videoId)) continue;
      if (!matchesChannelScope(video, channelsRaw, channelVideoIds)) continue;
      seen.add(video.videoId);
      videos.push(video);
    }
  }
  videos = dedupeSort(videos);

  const fallbackQueries = [
    `${topic} documentary`,
    `${topic} explained`,
    `${topic} full video`,
    `${topic} investigation`,
  ];
  for (const query of fallbackQueries) {
    if (videos.length >= target) break;
    const extra = await searchQuery(query, perQueryLimit + 10);
    const extraSeen = new Set(videos.map((v) => v.videoId));
    for (const video of extra) {
      if (extraSeen.has(video.videoId)) continue;
      if (!matchesChannelScope(video, channelsRaw, channelVideoIds)) continue;
      extraSeen.add(video.videoId);
      videos.push(video);
    }
    videos = dedupeSort(videos);
  }

  if (videos.length < MIN_POOL_BEFORE_GEMINI) {
    videos = await supplementWithApify(topic, channelsRaw || undefined, videos, channelVideoIds);
  }

  videos = await applyLandscapeFilter(videos, target);

  if (videos.length < MIN_POOL_BEFORE_GEMINI && !handles.length) {
    videos = await supplementWithApify(topic, undefined, videos, channelVideoIds);
    videos = await applyLandscapeFilter(videos, target);
  }

  return videos.slice(0, target);
}
