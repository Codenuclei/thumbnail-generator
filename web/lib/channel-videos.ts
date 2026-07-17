import type { ScrapedVideo } from "@/lib/apify-youtube";
import { isYouTubeShort } from "@/lib/shorts-filter";

const BASE_API_URL = "https://www.youtube.com/youtubei/v1";
const CLIENT_VERSION = "2.20240606.06.00";
const CHANNEL_VIDEOS_PARAMS = "EgZ2aWRlb3PyBgQKAjoA";
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type ParsedChannelInput = {
  raw: string;
  resolveUrl: string;
  handle?: string;
  browseId?: string;
};

function buildContext() {
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

function normalizeYoutubeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return "";

  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    if (url.startsWith("@")) url = `https://www.youtube.com/${url}`;
    else if (/^UC[\w-]{10,}$/i.test(url)) url = `https://www.youtube.com/channel/${url}`;
    else if (/^(www\.)?youtube\.com\//i.test(url) || /^youtu\.be\//i.test(url)) {
      url = `https://${url.replace(/^https?:\/\//i, "")}`;
    } else {
      url = `https://www.youtube.com/@${url.replace(/^@/, "")}`;
    }
  }

  try {
    const parsed = new URL(url);
    // Drop tabs/query noise like /videos?view=0
    parsed.search = "";
    parsed.hash = "";
    // Normalize /@Handle/videos → /@Handle for resolve_url
    parsed.pathname = parsed.pathname
      .replace(/\/(videos|featured|streams|shorts|playlists|community|about)\/?$/i, "")
      .replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractHandle(urlOrRaw: string): string | undefined {
  const match = urlOrRaw.match(/@([^/?#\s]+)/i);
  return match?.[1];
}

/** Parse channel URLs, handles, and bare UC ids from user input. */
export function parseChannelInputs(raw?: string): ParsedChannelInput[] {
  if (!raw?.trim()) return [];

  const results: ParsedChannelInput[] = [];
  for (const line of raw.split(/[\n,]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const resolveUrl = normalizeYoutubeUrl(trimmed);
    const browseId =
      trimmed.match(/channel\/(UC[\w-]+)/i)?.[1] ||
      resolveUrl.match(/channel\/(UC[\w-]+)/i)?.[1] ||
      (/^UC[\w-]{10,}$/i.test(trimmed) ? trimmed : undefined);
    const handle = extractHandle(trimmed) || extractHandle(resolveUrl);

    results.push({ raw: trimmed, resolveUrl, browseId, handle });
  }

  return results.slice(0, 5);
}

function parseText(txt: unknown): string {
  if (typeof txt === "string") return txt;
  if (!txt || typeof txt !== "object") return "";
  const t = txt as {
    simpleText?: string;
    content?: string;
    text?: string;
    runs?: Array<{ text?: string }>;
  };
  return (
    t.content ||
    t.simpleText ||
    t.text ||
    (Array.isArray(t.runs) ? t.runs.map((a) => a.text || "").join("") : "")
  );
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

function bestThumb(
  sources?: Array<{ url?: string; width?: number }>
): string {
  const sorted = (sources || [])
    .map((s) => ({
      url: s.url?.startsWith("//") ? `https:${s.url}` : s.url || "",
      width: s.width || 0,
    }))
    .filter((s) => s.url)
    .sort((a, b) => b.width - a.width);
  return sorted[0]?.url || "";
}

async function postInnerTube(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_API_URL}/${endpoint}?prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "SOCS=CAI",
      Origin: "https://www.youtube.com",
      Referer: "https://www.youtube.com/",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube ${endpoint} failed (${res.status})`);
  return res.json();
}

function collectBrowseIds(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectBrowseIds(item, out);
    return;
  }
  const record = node as Record<string, unknown>;
  const browse = record.browseEndpoint as { browseId?: string } | undefined;
  if (browse?.browseId?.startsWith("UC") && !out.includes(browse.browseId)) {
    out.push(browse.browseId);
  }
  for (const value of Object.values(record)) collectBrowseIds(value, out);
}

async function resolveBrowseId(input: ParsedChannelInput): Promise<string | null> {
  if (input.browseId) return input.browseId;

  const candidates = [
    input.resolveUrl,
    input.handle ? `https://www.youtube.com/@${input.handle}` : "",
    input.handle ? `https://www.youtube.com/@${input.handle}/videos` : "",
  ].filter(Boolean);

  for (const url of [...new Set(candidates)]) {
    try {
      const json = await postInnerTube("navigation/resolve_url", {
        context: buildContext(),
        url,
      });
      const ids: string[] = [];
      collectBrowseIds(json, ids);
      if (ids[0]) return ids[0];
    } catch (err) {
      console.error(
        `resolve_url failed for ${url}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Fallback: search for the handle and scrape a UC id from channel results.
  if (input.handle) {
    try {
      const json = await postInnerTube("search", {
        context: buildContext(),
        query: `@${input.handle}`,
      });
      const ids: string[] = [];
      collectBrowseIds(json, ids);
      if (ids[0]) return ids[0];
    } catch (err) {
      console.error(
        `channel search resolve failed for @${input.handle}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return null;
}

function parseVideoRenderer(obj: Record<string, unknown>, channelName: string): ScrapedVideo | null {
  const videoId = String(obj.videoId || "");
  const title = parseText(obj.title) || "Untitled";
  const thumbs =
    (obj.thumbnail as { thumbnails?: Array<{ url?: string; width?: number }> })?.thumbnails ||
    [];
  const thumbnailUrl = bestThumb(thumbs) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
  const duration = parseText(obj.lengthText) || undefined;
  const views = parseViewCountText(parseText(obj.viewCountText) || "0");

  if (!videoId || !thumbnailUrl) return null;
  if (
    isYouTubeShort({
      videoId,
      title,
      duration,
      thumbnailUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    })
  ) {
    return null;
  }

  return {
    videoId,
    title,
    channel: channelName,
    viewCount: views,
    thumbnailUrl,
    description: parseText(obj.descriptionSnippet).slice(0, 500),
    duration,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function parseLockupViewModel(
  lockup: Record<string, unknown>,
  channelName: string
): ScrapedVideo | null {
  const videoId = String(
    lockup.contentId ||
      (lockup.rendererContext as { commandContext?: { onTap?: { innertubeCommand?: { watchEndpoint?: { videoId?: string } } } } })
        ?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId ||
      ""
  );
  const contentType = String(lockup.contentType || "");
  if (!videoId) return null;
  if (contentType && contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;

  const metadata = lockup.metadata as
    | { lockupMetadataViewModel?: Record<string, unknown> }
    | undefined;
  const meta = metadata?.lockupMetadataViewModel;
  const title = parseText(meta?.title) || "Untitled";

  const image = lockup.contentImage as
    | {
        thumbnailViewModel?: {
          image?: { sources?: Array<{ url?: string; width?: number }> };
          overlays?: Array<Record<string, unknown>>;
        };
      }
    | undefined;

  let thumbnailUrl = bestThumb(image?.thumbnailViewModel?.image?.sources);
  if (!thumbnailUrl) {
    thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  let duration: string | undefined;
  for (const overlay of image?.thumbnailViewModel?.overlays || []) {
    const badges = (
      overlay.thumbnailBottomOverlayViewModel as {
        badges?: Array<{ thumbnailBadgeViewModel?: { text?: string } }>;
      }
    )?.badges;
    const badgeText = badges?.[0]?.thumbnailBadgeViewModel?.text;
    if (badgeText) {
      duration = badgeText;
      break;
    }
  }

  const metadataRows = (
    meta?.metadata as {
      contentMetadataViewModel?: {
        metadataRows?: Array<{ metadataParts?: Array<{ text?: unknown }> }>;
      };
      metadataRows?: Array<{ metadataParts?: Array<{ text?: unknown }> }>;
    }
  )?.contentMetadataViewModel?.metadataRows ||
    (meta?.metadata as { metadataRows?: Array<{ metadataParts?: Array<{ text?: unknown }> }> })
      ?.metadataRows;

  const viewsText = parseText(metadataRows?.[0]?.metadataParts?.[0]?.text) || "0";
  const views = parseViewCountText(viewsText);

  if (
    isYouTubeShort({
      videoId,
      title,
      duration,
      thumbnailUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    })
  ) {
    return null;
  }

  return {
    videoId,
    title,
    channel: channelName,
    viewCount: views,
    thumbnailUrl,
    description: "",
    duration,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function extractChannelName(payload: Record<string, unknown>, fallback: string): string {
  const header = payload.header as Record<string, unknown> | undefined;
  const c4Tabbed = header?.c4TabbedHeaderRenderer as Record<string, unknown> | undefined;
  const channelMobile = header?.channelMobileHeaderRenderer as Record<string, unknown> | undefined;
  const channelHeader = header?.channelHeaderRenderer as Record<string, unknown> | undefined;
  const pageHeader = header?.pageHeaderRenderer as Record<string, unknown> | undefined;
  const pageHeaderContent = pageHeader?.content as Record<string, unknown> | undefined;
  const pageHeaderViewModel = pageHeaderContent?.pageHeaderViewModel as Record<string, unknown> | undefined;
  const titleDynamic = pageHeaderViewModel?.title as { dynamicTextViewModel?: { text?: unknown }; dynamicText?: unknown } | undefined;
  const microformat = payload.microformat as {
    microformatDataRenderer?: { title?: string };
  } | undefined;

  return (
    parseText(titleDynamic?.dynamicTextViewModel?.text) ||
    parseText(titleDynamic?.dynamicText) ||
    parseText(c4Tabbed?.title) ||
    parseText(channelMobile?.title) ||
    parseText(channelHeader?.title) ||
    microformat?.microformatDataRenderer?.title ||
    fallback
  );
}

function collectVideosFromNode(
  node: unknown,
  channelName: string,
  out: ScrapedVideo[],
  seen: Set<object> = new Set()
): void {
  if (!node || typeof node !== "object") return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (const item of node) collectVideosFromNode(item, channelName, out, seen);
    return;
  }

  const record = node as Record<string, unknown>;

  if (record.videoRenderer && typeof record.videoRenderer === "object") {
    const parsed = parseVideoRenderer(record.videoRenderer as Record<string, unknown>, channelName);
    if (parsed) out.push(parsed);
  }

  if (record.gridVideoRenderer && typeof record.gridVideoRenderer === "object") {
    const parsed = parseVideoRenderer(record.gridVideoRenderer as Record<string, unknown>, channelName);
    if (parsed) out.push(parsed);
  }

  if (record.lockupViewModel && typeof record.lockupViewModel === "object") {
    const parsed = parseLockupViewModel(record.lockupViewModel as Record<string, unknown>, channelName);
    if (parsed) out.push(parsed);
  }

  if (record.richItemRenderer && typeof record.richItemRenderer === "object") {
    const content = (record.richItemRenderer as { content?: Record<string, unknown> }).content;
    if (content) collectVideosFromNode(content, channelName, out, seen);
  }

  for (const value of Object.values(record)) {
    collectVideosFromNode(value, channelName, out, seen);
  }
}

function dedupeVideos(videos: ScrapedVideo[]): ScrapedVideo[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}

async function fetchChannelVideosViaBrowse(
  browseId: string,
  channelFallback: string,
  limit: number
): Promise<ScrapedVideo[]> {
  const paramSets = [CHANNEL_VIDEOS_PARAMS, undefined];
  for (const params of paramSets) {
    try {
      const json = await postInnerTube("browse", {
        context: buildContext(),
        browseId,
        ...(params ? { params } : {}),
      });

      const channelName = extractChannelName(json, channelFallback);
      const collected: ScrapedVideo[] = [];
      collectVideosFromNode(json, channelName, collected);
      const videos = dedupeVideos(collected)
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, limit);
      if (videos.length) return videos;
    } catch (err) {
      console.error(
        `browse failed for ${browseId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return [];
}

async function fetchChannelVideosViaRss(
  browseId: string,
  channelFallback: string,
  limit: number
): Promise<ScrapedVideo[]> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(browseId)}`,
    {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    }
  );
  if (!res.ok) return [];

  const xml = await res.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const channelName =
    xml.match(/<name>([^<]+)<\/name>/)?.[1]?.trim() || channelFallback;

  const videos: ScrapedVideo[] = [];
  for (const entry of entries.slice(0, limit * 2)) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<media:title>([^<]+)<\/media:title>/)?.[1]
      || entry.match(/<title>([^<]+)<\/title>/)?.[1];
    if (!videoId || !title) continue;

    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    if (
      isYouTubeShort({
        videoId,
        title,
        thumbnailUrl,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      })
    ) {
      continue;
    }

    videos.push({
      videoId,
      title,
      channel: channelName,
      viewCount: 0,
      thumbnailUrl,
      description: "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  return videos.slice(0, limit);
}

async function fetchChannelVideosViaSearch(
  handle: string,
  limit: number
): Promise<ScrapedVideo[]> {
  const queries = [`@${handle}`, `${handle} channel`];
  const collected: ScrapedVideo[] = [];

  for (const query of queries) {
    try {
      const json = await postInnerTube("search", {
        context: buildContext(),
        query,
      });
      collectVideosFromNode(json, handle, collected);
    } catch (err) {
      console.error(
        `search fallback failed for ${query}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return dedupeVideos(collected)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, limit);
}

/** Fetch public landscape videos directly from a channel URL, handle, or UC id. */
export async function fetchChannelPublicVideos(
  channelRaw: string,
  options?: { limit?: number }
): Promise<ScrapedVideo[]> {
  const inputs = parseChannelInputs(channelRaw);
  if (!inputs.length) return [];

  const limit = options?.limit ?? 15;
  const all: ScrapedVideo[] = [];

  for (const input of inputs) {
    const fallbackName = input.handle ? `@${input.handle}` : input.raw;
    try {
      const browseId = await resolveBrowseId(input);

      let videos: ScrapedVideo[] = [];
      if (browseId) {
        videos = await fetchChannelVideosViaBrowse(browseId, fallbackName, limit);
        if (!videos.length) {
          videos = await fetchChannelVideosViaRss(browseId, fallbackName, limit);
        }
      }

      if (!videos.length && input.handle) {
        videos = await fetchChannelVideosViaSearch(input.handle, limit);
      }

      all.push(...videos);
    } catch (err) {
      console.error(
        `Channel fetch failed for "${input.raw}":`,
        err instanceof Error ? err.message : err
      );

      if (input.handle) {
        try {
          const fallback = await fetchChannelVideosViaSearch(input.handle, limit);
          all.push(...fallback);
        } catch {
          // keep going
        }
      }
    }
  }

  // Metadata Shorts filter only — deep thumbnail vision caused false empty results.
  const landscape = dedupeVideos(all).filter(
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

  return landscape.sort((a, b) => b.viewCount - a.viewCount).slice(0, limit);
}
