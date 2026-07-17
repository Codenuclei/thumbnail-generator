import {
  searchLongFormViaYtsr,
  SEARCH_POOL_SIZE,
} from "@/lib/ytsr-search";
import { TARGET_RESULTS, type ScrapedVideo } from "@/lib/apify-youtube";
import { filterAndCurateWithGemini } from "@/lib/gemini-filter";
import { buildVideoMappings, type VideoContentMapping } from "@/lib/video-mapping";
import type { StyleBrief } from "@/lib/style-intelligence";
import { buildExpandedSearchQueries } from "@/lib/search-queries";

export type SearchProgressEvent =
  | { type: "status"; step: string; message: string }
  | { type: "candidates"; count: number; videos: ScrapedVideo[] }
  | { type: "mappings"; mappings: VideoContentMapping[] }
  | {
      type: "complete";
      results: ScrapedVideo[];
      styleBrief: StyleBrief;
      titleSuggestions: string[];
      filteredCount: number;
      qualityRejected: number;
      channelStats: { kept: number; droppedOffTopic: number };
      source: string;
      queries: string[];
    }
  | { type: "error"; message: string };

export async function runSearchPipeline(
  title: string,
  options?: { channels?: string; hook?: string; onProgress?: (e: SearchProgressEvent) => void }
): Promise<Extract<SearchProgressEvent, { type: "complete" }>> {
  const emit = options?.onProgress || (() => {});
  const channels = options?.channels;
  const hook = options?.hook;
  const queries = buildExpandedSearchQueries(title, hook);

  emit({
    type: "status",
    step: "search",
    message: "YouTube search — landscape videos only…",
  });

  const pool = await searchLongFormViaYtsr(title, {
    channels,
    hook,
    target: SEARCH_POOL_SIZE,
  });

  if (!pool.length) {
    throw new Error(
      channels
        ? "No landscape videos found for that topic and channel — try a broader topic or check the channel URL."
        : "No landscape videos found — try a broader topic."
    );
  }

  emit({
    type: "candidates",
    count: pool.length,
    videos: pool.slice(0, 20),
  });

  emit({ type: "status", step: "map", message: "Mapping thumbnails to opening scripts…" });
  const mappings = await buildVideoMappings(pool, title, 8);
  emit({ type: "mappings", mappings });

  emit({
    type: "status",
    step: "filter",
    message: `Gemini quality filter — picking ${TARGET_RESULTS} premium thumbnails…`,
  });

  const result = await filterAndCurateWithGemini(title, pool, {
    channelsRaw: channels,
    hook,
    strict: false,
    targetCount: TARGET_RESULTS,
  });

  const complete = {
    type: "complete" as const,
    results: result.videos,
    styleBrief: result.styleBrief,
    titleSuggestions: result.titleSuggestions,
    filteredCount: result.filteredCount,
    qualityRejected: result.qualityRejected,
    channelStats: result.channelStats,
    source: "ytsr-landscape+gemini-quality",
    queries,
  };
  emit(complete);
  return complete;
}
