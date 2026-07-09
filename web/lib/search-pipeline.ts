import { tryApifyScrape, type ScrapedVideo } from "@/lib/apify-youtube";
import { searchReferenceChannels } from "@/lib/channel-search";
import { filterAndCurateWithGemini } from "@/lib/gemini-filter";
import { parseChannelHandles } from "@/lib/title-relevance";
import { buildExpandedSearchQueries } from "@/lib/search-queries";
import { searchInnerTube } from "@/lib/youtube-search";
import { buildVideoMappings, type VideoContentMapping } from "@/lib/video-mapping";
import type { InspirationVideo } from "@/lib/inspiration";

export type SearchProgressEvent =
  | { type: "status"; step: string; message: string }
  | { type: "candidates"; count: number; videos: ScrapedVideo[] }
  | { type: "mappings"; mappings: VideoContentMapping[] }
  | {
      type: "complete";
      results: InspirationVideo[];
      styleBrief: Awaited<ReturnType<typeof filterAndCurateWithGemini>>["styleBrief"];
      titleSuggestions: string[];
      filteredCount: number;
      qualityRejected: number;
      channelStats: { kept: number; droppedOffTopic: number };
      source: string;
      queries: string[];
    }
  | { type: "error"; message: string };

function toScraped(
  results: Array<{
    videoId: string;
    title: string;
    channel: string;
    viewCount: number;
    thumbnailUrl: string;
  }>
): ScrapedVideo[] {
  return results.map((r) => ({
    ...r,
    description: "",
    url: `https://www.youtube.com/watch?v=${r.videoId}`,
  }));
}

function mergeVideos(...lists: ScrapedVideo[][]): ScrapedVideo[] {
  const seen = new Set<string>();
  const merged: ScrapedVideo[] = [];
  for (const list of lists) {
    for (const v of list) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      merged.push(v);
    }
  }
  return merged;
}

export async function runSearchPipeline(
  title: string,
  options?: { channels?: string; hook?: string; onProgress?: (e: SearchProgressEvent) => void }
): Promise<Extract<SearchProgressEvent, { type: "complete" }>> {
  const emit = options?.onProgress || (() => {});
  const channels = options?.channels;
  const hook = options?.hook;
  const hasChannels = Boolean(parseChannelHandles(channels).length);
  const queries = buildExpandedSearchQueries(title, hook);

  emit({ type: "status", step: "search", message: "Searching Apify, channels, and YouTube…" });

  const innerBatches = await Promise.all(
    queries.slice(0, 4).map((q) =>
      searchInnerTube(q).catch(() => [])
    )
  );
  const innerTube = innerBatches.flat();

  emit({
    type: "candidates",
    count: innerTube.length,
    videos: toScraped(innerTube).slice(0, 12),
  });

  const [apifyVideos, channelVideos] = await Promise.all([
    tryApifyScrape(title, { channels }),
    hasChannels && channels ? searchReferenceChannels(title, channels) : Promise.resolve([]),
  ]);

  const merged = mergeVideos(
    apifyVideos || [],
    channelVideos,
    toScraped(innerTube)
  );

  if (!merged.length) {
    throw new Error("No thumbnails found — try a shorter title.");
  }

  emit({
    type: "candidates",
    count: merged.length,
    videos: merged.slice(0, 20),
  });

  emit({ type: "status", step: "map", message: "Mapping thumbnails to opening scripts…" });
  const mappings = await buildVideoMappings(merged, title, 8);
  emit({ type: "mappings", mappings });

  emit({ type: "status", step: "filter", message: "Gemini quality filter…" });
  const result = await filterAndCurateWithGemini(title, merged, { channelsRaw: channels, hook });

  const sourceParts: string[] = [];
  if (apifyVideos?.length) sourceParts.push("apify");
  if (channelVideos.length) sourceParts.push("channels");
  sourceParts.push("expanded-search", "gemini-dynamic-filter");

  const complete = {
    type: "complete" as const,
    results: result.videos,
    styleBrief: result.styleBrief,
    titleSuggestions: result.titleSuggestions,
    filteredCount: result.filteredCount,
    qualityRejected: result.qualityRejected,
    channelStats: result.channelStats,
    source: sourceParts.join("+"),
    queries,
  };
  emit(complete);
  return complete;
}
