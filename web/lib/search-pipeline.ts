import {
  searchLongFormViaYtsr,
  searchYouTubeExact,
  SEARCH_POOL_SIZE,
} from "@/lib/ytsr-search";
import { TARGET_RESULTS, type ScrapedVideo } from "@/lib/apify-youtube";
import {
  filterAndCurateWithGemini,
  LIGHT_FILTER_POOL,
  LIGHT_FILTER_RESULTS,
  type GeminiFilterMode,
  type RejectedVideo,
  type TopicContext,
} from "@/lib/gemini-filter";
import { buildVideoMappings } from "@/lib/video-mapping";
import type { StyleBrief } from "@/lib/style-intelligence";
import { expandQueriesForTopic } from "@/lib/search-queries";

export type SearchProgressEvent =
  | { type: "status"; step: string; message: string }
  | { type: "candidates"; count: number; videos: ScrapedVideo[] }
  | { type: "mappings"; mappings: import("@/lib/video-mapping").VideoContentMapping[] }
  | {
      type: "complete";
      results: ScrapedVideo[];
      rejectedResults: RejectedVideo[];
      filterSummary?: string;
      styleBrief: StyleBrief;
      titleSuggestions: string[];
      filteredCount: number;
      qualityRejected: number;
      channelStats: { kept: number; droppedOffTopic: number };
      topicContext?: TopicContext;
      source: string;
      queries: string[];
      youtubeQuery: string;
      filterMode: GeminiFilterMode;
    }
  | { type: "error"; message: string };

export async function runSearchPipeline(
  title: string,
  options?: {
    channels?: string;
    hook?: string;
    /** light = exact user query, YouTube order top 8; strict = expanded + title curation */
    filterMode?: GeminiFilterMode;
    onProgress?: (e: SearchProgressEvent) => void;
  }
): Promise<Extract<SearchProgressEvent, { type: "complete" }>> {
  const emit = options?.onProgress || (() => {});
  const channels = options?.channels;
  const hook = options?.hook;
  const filterMode: GeminiFilterMode = options?.filterMode === "strict" ? "strict" : "light";
  const userQuery = title.trim();

  let pool: ScrapedVideo[] = [];
  let queries: string[] = [userQuery];
  let youtubeQuery = userQuery;

  if (filterMode === "light") {
    // Exact user text → YouTube India/Relevance order → Gemini topic context + vision filter.
    emit({
      type: "status",
      step: "search",
      message: `YouTube India · Relevance: "${userQuery}"`,
    });
    console.log(`[search] light mode youtubeQuery=${JSON.stringify(userQuery)}`);
    const exact = await searchYouTubeExact(userQuery, { target: LIGHT_FILTER_POOL });
    pool = exact.videos.slice(0, LIGHT_FILTER_POOL);
    youtubeQuery = exact.query;
    queries = [exact.query];

    emit({
      type: "candidates",
      count: pool.length,
      videos: pool.slice(0, LIGHT_FILTER_RESULTS),
    });

    if (!pool.length) {
      throw new Error(`No landscape videos found for YouTube query "${youtubeQuery}".`);
    }

    emit({
      type: "status",
      step: "filter",
      message: `Understanding "${youtubeQuery}" then filtering wrong visual context…`,
    });

    const result = await filterAndCurateWithGemini(title, pool, {
      channelsRaw: channels,
      hook,
      mode: "light",
      targetCount: LIGHT_FILTER_RESULTS,
    });

    const complete = {
      type: "complete" as const,
      results: result.videos,
      rejectedResults: result.rejectedVideos,
      filterSummary: result.filterSummary,
      styleBrief: result.styleBrief,
      titleSuggestions: result.titleSuggestions,
      filteredCount: result.filteredCount,
      qualityRejected: result.qualityRejected,
      channelStats: result.channelStats,
      topicContext: result.topicContext,
      source: `${exact.source}+context-vision`,
      queries,
      youtubeQuery,
      filterMode,
    };
    emit(complete);
    return complete;
  }

  queries = await expandQueriesForTopic(title, hook);
  youtubeQuery = queries[0] || userQuery;
  emit({
    type: "status",
    step: "search",
    message: `YouTube search (strict) — primary query: "${youtubeQuery}"`,
  });
  pool = await searchLongFormViaYtsr(title, {
    channels,
    hook,
    target: SEARCH_POOL_SIZE,
    queries,
  });

  if (!pool.length) {
    throw new Error(
      channels
        ? "No landscape videos found for that topic and channel — try a broader topic or check the channel URL."
        : `No landscape videos found for YouTube query "${youtubeQuery}".`
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
    message: `Gemini title filter — keeping thumbnails that match "${title}"…`,
  });

  const result = await filterAndCurateWithGemini(title, pool, {
    channelsRaw: channels,
    hook,
    mode: "strict",
    strict: true,
    targetCount: TARGET_RESULTS,
  });

  const complete = {
    type: "complete" as const,
    results: result.videos,
    rejectedResults: result.rejectedVideos,
    filterSummary: result.filterSummary,
    styleBrief: result.styleBrief,
    titleSuggestions: result.titleSuggestions,
    filteredCount: result.filteredCount,
    qualityRejected: result.qualityRejected,
    channelStats: result.channelStats,
    topicContext: result.topicContext,
    source: "ytsr-landscape+gemini-title",
    queries,
    youtubeQuery,
    filterMode,
  };
  emit(complete);
  return complete;
}
