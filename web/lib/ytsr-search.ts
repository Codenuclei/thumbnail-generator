import type { ScrapedVideo } from "@/lib/apify-youtube";
import { TARGET_RESULTS, tryApifyScrape } from "@/lib/apify-youtube";
import { fetchChannelPublicVideos } from "@/lib/channel-videos";
import { buildExpandedSearchQueries } from "@/lib/search-queries";
import { filterOutShortsDeep, isYouTubeShort } from "@/lib/shorts-filter";
import {
  filterByTopicRelevance,
  parseChannelHandles,
  rankByTopicThenViews,
  scoreTopicMatch,
  videoFromChannelFetch,
  videoFromReferenceChannel,
} from "@/lib/title-relevance";

const BASE_API_URL = "https://www.youtube.com/youtubei/v1/search";
const CLIENT_VERSION = "2.20250313.01.00";
const SEARCH_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * YouTube India + Relevance (default Prioritise filter).
 * sp=CAA%253D → Relevance; gl=IN → India results.
 * @see YouTube search filter URL params
 */
const YT_INDIA_RELEVANCE_SP = "CAA%253D";
const YT_INDIA_COOKIE = "PREF=gl=IN&hl=en; SOCS=CAI";

/** Candidate pool passed to Gemini quality filter. */
export const SEARCH_POOL_SIZE = 80;
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
      // India locale — matches youtube.com/IN relevance ranking.
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
    // Collect EVERY itemSection — YouTube often splits results across sections.
    for (const block of sectionList.contents) {
      if ("itemSectionRenderer" in block) {
        const section = block as {
          itemSectionRenderer?: { contents?: Record<string, unknown>[] };
        };
        rawItems.push(...(section.itemSectionRenderer?.contents || []));
      }
      if ("continuationItemRenderer" in block) {
        const cont = block as {
          continuationItemRenderer?: {
            continuationEndpoint?: { continuationCommand?: { token?: string } };
          };
        };
        continuationToken =
          cont.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
          continuationToken;
      }
    }
  }

  const richGrid = primaryContents.richGridRenderer as { contents?: Record<string, unknown>[] } | undefined;
  // Prefer sectionList (classic search). Only use richGrid when sectionList had nothing.
  if (richGrid?.contents && rawItems.length === 0) {
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
      "Accept-Language": "en-IN,en;q=0.9",
      Cookie: YT_INDIA_COOKIE,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
  return res.json();
}

async function fetchSearchPage(query: string, limit: number): Promise<ParsedVideo[]> {
  const context = buildContext();
  // Empty/default params = Relevance prioritise (YouTube default).
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

function dedupeVideos(videos: ScrapedVideo[]): ScrapedVideo[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}

function dedupeSort(videos: ScrapedVideo[], topic?: string): ScrapedVideo[] {
  const unique = dedupeVideos(videos);
  return topic ? rankByTopicThenViews(topic, unique) : unique.sort((a, b) => b.viewCount - a.viewCount);
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
    // Prefer HTML (IN + Relevance) — closer to youtube.com UI than anonymous InnerTube.
    try {
      const htmlHits = await fetchSearchViaYoutubeHtml(query, perQueryLimit);
      if (htmlHits.length) return htmlHits;
    } catch {
      /* fall through to InnerTube */
    }
    const parsed = await fetchSearchPage(query, perQueryLimit);
    // Preserve YouTube result order — only drop Shorts / live / upcoming.
    return parsed.filter(isLandscapeCandidate).map(toScrapedVideo);
  } catch (err) {
    console.error(`ytsr "${query}" failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Parse youtube.com/results HTML (ytInitialData) — India + Relevance.
 * Closer to the public UI ranking than anonymous InnerTube alone.
 */
async function fetchSearchViaYoutubeHtml(query: string, limit: number): Promise<ScrapedVideo[]> {
  // India + explicit Relevance (Prioritise → Relevance).
  const htmlUrl =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` +
    `&sp=${YT_INDIA_RELEVANCE_SP}&gl=IN&hl=en`;

  const html = await fetch(htmlUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-IN,hi-IN,en;q=0.8",
      Cookie: YT_INDIA_COOKIE,
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  }).then((r) => {
    if (!r.ok) throw new Error(`youtube html search ${r.status}`);
    return r.text();
  });

  const match =
    html.match(/var ytInitialData = (\{[\s\S]+?\});<\/script>/) ||
    html.match(/ytInitialData"\] = (\{[\s\S]+?\});<\/script>/);
  if (!match?.[1]) throw new Error("ytInitialData missing");

  const data = JSON.parse(match[1]) as Record<string, unknown>;
  const primary = (
    data.contents as {
      twoColumnSearchResultsRenderer?: { primaryContents?: Record<string, unknown> };
    }
  )?.twoColumnSearchResultsRenderer?.primaryContents;
  if (!primary) throw new Error("search primaryContents missing");

  const { rawItems } = parseWrapper(primary);
  const collected: ScrapedVideo[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (collected.length >= limit) break;
    const parsed = parseItem(item);
    if (!parsed) continue;
    if (seen.has(parsed.videoId)) continue;
    if (!isLandscapeCandidate(parsed)) continue;
    seen.add(parsed.videoId);
    collected.push(toScrapedVideo(parsed));
  }

  console.log(
    `[youtube-html] query=${JSON.stringify(query)} gl=IN relevance kept=${collected.length}`
  );
  return collected;
}

/**
 * Exact YouTube search: sends the user text as-is, returns hits in YouTube UI order.
 * Prefers youtube.com HTML ranking for the first page, then fills to `target` via
 * InnerTube continuations (no relevance re-rank, no Gemini).
 */
export async function searchYouTubeExact(
  query: string,
  options?: { target?: number }
): Promise<{
  videos: ScrapedVideo[];
  query: string;
  source: "youtube-html" | "innertube" | "youtube-html+innertube";
}> {
  const q = query.trim();
  if (!q) return { videos: [], query: q, source: "youtube-html" };

  const target = Math.max(options?.target ?? 56, 50);
  const fetchLimit = Math.max(target + 24, 80);

  let videos: ScrapedVideo[] = [];
  let source: "youtube-html" | "innertube" | "youtube-html+innertube" = "innertube";

  try {
    videos = await fetchSearchViaYoutubeHtml(q, fetchLimit);
    if (videos.length) source = "youtube-html";
  } catch (err) {
    console.warn(
      `[youtube-exact] html failed, falling back to innertube:`,
      err instanceof Error ? err.message : err
    );
  }

  if (videos.length < target) {
    try {
      const parsed = await fetchSearchPage(q, fetchLimit);
      const innertube = parsed.filter(isLandscapeCandidate).map(toScrapedVideo);
      const seen = new Set(videos.map((v) => v.videoId));
      for (const video of innertube) {
        if (seen.has(video.videoId)) continue;
        seen.add(video.videoId);
        videos.push(video);
        if (videos.length >= fetchLimit) break;
      }
      if (source === "youtube-html" && innertube.length) {
        source = "youtube-html+innertube";
      } else if (!videos.length) {
        source = "innertube";
      }
    } catch (err) {
      console.warn(
        `[youtube-exact] innertube fill failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[youtube-exact] source=${source} query=${JSON.stringify(q)} returned=${videos.length} target=${target}`
  );
  return {
    videos: videos.slice(0, Math.max(target, videos.length)),
    query: q,
    source,
  };
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
  return dedupeSort(merged, topic);
}

/**
 * Run exact YouTube search strings without re-expanding them.
 * Used by /api/similar so each curated query is not polluted by factory templates.
 */
export async function searchYouTubeQueries(
  queries: string[],
  options?: { channels?: string; target?: number; topic?: string }
): Promise<ScrapedVideo[]> {
  const topic = (options?.topic || queries[0] || "").trim();
  const target = options?.target ?? SEARCH_POOL_SIZE;
  const channelsRaw = options?.channels?.trim() || "";
  const channelVideoIds = new Set<string>();
  let videos: ScrapedVideo[] = [];

  if (channelsRaw) {
    const channelVideos = await fetchChannelPublicVideos(channelsRaw, { limit: target });
    for (const video of channelVideos) channelVideoIds.add(video.videoId);
    videos = dedupeSort(channelVideos, topic);
  }

  const uniqueQueries = [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 8);
  if (!uniqueQueries.length) return videos.slice(0, target);

  const perQueryLimit = Math.ceil(target / Math.max(uniqueQueries.length, 1)) + 12;
  const batches = await Promise.all(
    uniqueQueries.map((q, i) =>
      // First query (usually raw topic) gets a larger slice — YT relevance lives there.
      searchQuery(q, i === 0 ? perQueryLimit + 20 : perQueryLimit)
    )
  );

  const seen = new Set(videos.map((v) => v.videoId));
  for (const batch of batches) {
    for (const video of batch) {
      if (seen.has(video.videoId)) continue;
      if (!matchesChannelScope(video, channelsRaw, channelVideoIds)) continue;
      seen.add(video.videoId);
      videos.push(video);
    }
  }

  videos = filterByTopicRelevance(topic, dedupeSort(videos, topic));
  videos = await applyLandscapeFilter(videos, target);
  return videos.slice(0, target);
}

/**
 * Fast YouTube search via InnerTube (ytsr-style parsing).
 * Topic search is primary; reference channels supplement rather than replace it.
 */
export async function searchLongFormViaYtsr(
  topic: string,
  options?: {
    channels?: string;
    target?: number;
    hook?: string;
    /** Pre-built queries — skips buildExpandedSearchQueries when provided. */
    queries?: string[];
    /** Skip topic-score cull and view re-rank — keep fetch order (for 50+ unfiltered research). */
    unfiltered?: boolean;
  }
): Promise<ScrapedVideo[]> {
  const target = options?.target ?? SEARCH_POOL_SIZE;
  const unfiltered = Boolean(options?.unfiltered);
  const channelsRaw = options?.channels?.trim() || "";
  const handles = channelsRaw ? parseChannelHandles(channelsRaw) : [];

  const channelVideoIds = new Set<string>();
  let videos: ScrapedVideo[] = [];

  if (channelsRaw) {
    const channelVideos = await fetchChannelPublicVideos(channelsRaw, { limit: target });
    for (const video of channelVideos) {
      channelVideoIds.add(video.videoId);
    }
    videos = dedupeSort(channelVideos, topic);
  }

  const queries = (
    options?.queries?.length
      ? options.queries
      : buildExpandedSearchQueries(topic, options?.hook)
  )
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 6);

  // Weight the raw topic query: fetch more from it than from expansions.
  const primary = queries[0] || topic.trim();
  const expansions = queries.filter((q) => q.toLowerCase() !== primary.toLowerCase());
  const primaryLimit = Math.ceil(target * 0.7) + 20;
  const expansionLimit = Math.ceil(target / Math.max(expansions.length, 1)) + 10;

  const batches = await Promise.all([
    searchQuery(primary, primaryLimit),
    ...expansions.map((q) => searchQuery(q, expansionLimit)),
  ]);

  const seen = new Set(videos.map((v) => v.videoId));
  for (const batch of batches) {
    for (const video of batch) {
      if (seen.has(video.videoId)) continue;
      if (!matchesChannelScope(video, channelsRaw, channelVideoIds)) continue;
      seen.add(video.videoId);
      videos.push(video);
    }
  }
  videos = dedupeSort(videos, topic);

  // Only soft-expand with topic-faithful fallbacks when the pool is thin.
  if (videos.filter((v) => scoreTopicMatch(topic, v) >= 0.34).length < MIN_POOL_BEFORE_GEMINI) {
    const fallbackQueries = [`${topic} explained`, `${topic} full`, `${topic} highlights`];
    for (const query of fallbackQueries) {
      if (videos.length >= target) break;
      const extra = await searchQuery(query, expansionLimit + 10);
      const extraSeen = new Set(videos.map((v) => v.videoId));
      for (const video of extra) {
        if (extraSeen.has(video.videoId)) continue;
        if (!matchesChannelScope(video, channelsRaw, channelVideoIds)) continue;
        extraSeen.add(video.videoId);
        videos.push(video);
      }
      videos = dedupeSort(videos, topic);
    }
  }

  if (videos.length < MIN_POOL_BEFORE_GEMINI) {
    videos = await supplementWithApify(topic, channelsRaw || undefined, videos, channelVideoIds);
  }

  if (!unfiltered) {
    videos = filterByTopicRelevance(topic, videos);
  }
  videos = await applyLandscapeFilter(videos, target);

  if (videos.length < MIN_POOL_BEFORE_GEMINI && !handles.length) {
    videos = await supplementWithApify(topic, undefined, videos, channelVideoIds);
    if (!unfiltered) {
      videos = filterByTopicRelevance(topic, videos);
    }
    videos = await applyLandscapeFilter(videos, target);
  }

  if (unfiltered) {
    return dedupeVideos(videos).slice(0, Math.max(target, videos.length));
  }
  return dedupeSort(videos, topic).slice(0, target);
}
