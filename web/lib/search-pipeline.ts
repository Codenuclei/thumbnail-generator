import {
  searchLongFormViaYtsr,
  searchYouTubeExact,
  SEARCH_POOL_SIZE,
} from "@/lib/ytsr-search";
import type { ScrapedVideo } from "@/lib/apify-youtube";
import {
  LIGHT_FILTER_POOL,
  LIGHT_FILTER_RESULTS,
  resolveTopicContext,
  type GeminiFilterMode,
  type RejectedVideo,
  type TopicContext,
} from "@/lib/gemini-filter";
import { buildVideoMappings } from "@/lib/video-mapping";
import type { StyleBrief } from "@/lib/style-intelligence";
import { expandQueriesForTopic } from "@/lib/search-queries";
import { runtimeEnv } from "@/lib/runtime-env";

function passthroughStyleBrief(topic: string, hook?: string): StyleBrief {
  return {
    summary: `YouTube search results for "${topic}" (unfiltered — like youtube.com). Colors unlock after you like references.`,
    colorPalette: [],
    typography:
      "Montserrat Bold / Bebas-like ALL-CAPS, open tracking, solid fill — no stroke or shadow",
    composition: "Hero with clean text space",
    emotionalHook: "Clear, high-contrast, on-topic",
    textPatterns: [],
    creativeDirection: `Match the real niche of "${topic}" — no assumed genre.`,
    doList: ["On-topic subject", "Readable hook if present", "Clean layout"],
    avoidList: [
      "Off-topic subjects",
      "Clutter",
      "Low contrast",
      "1:1 copy of any research thumbnail",
    ],
    suggestedHook: hook?.toUpperCase() || undefined,
  };
}

/** Ground style brief in topicContext + top titles — still unfiltered thumbs. */
function styleBriefFromContext(
  topic: string,
  hook: string | undefined,
  ctx: TopicContext | undefined,
  titles: string[]
): StyleBrief {
  const base = passthroughStyleBrief(topic, hook);
  if (!ctx?.whatItIs) {
    return {
      ...base,
      textPatterns: titles.slice(0, 6),
    };
  }
  return {
    ...base,
    summary: `${ctx.whatItIs} Setting: ${ctx.setting}. Research titles inform mood only — invent original staging (never clone a competitor thumb).`,
    creativeDirection: [
      `Authentic venue: ${ctx.setting}.`,
      ctx.authenticVisuals.length
        ? `Cue visuals: ${ctx.authenticVisuals.slice(0, 6).join("; ")}.`
        : "",
      ctx.notes || "",
      "Invent a NEW composition — references are DNA, not a template.",
    ]
      .filter(Boolean)
      .join(" "),
    emotionalHook: "Clear, high-contrast, on-topic — original scene, not a remake",
    textPatterns: titles.slice(0, 6),
    doList: [
      ...ctx.authenticVisuals.slice(0, 5),
      "Original camera angle / crop / staging vs any research thumb",
      "Readable hook if present",
    ],
    avoidList: [
      ...ctx.rejectVisuals.slice(0, 5),
      "1:1 or near-copy of any research/liked thumbnail",
      "Same pose + crop + background as an attached ref",
      "Wrong venue for this topic",
    ],
    suggestedHook: hook?.toUpperCase() || undefined,
  };
}

async function gatherTopicContext(
  topic: string,
  hook: string | undefined,
  emit: (e: { type: "status"; step: string; message: string }) => void
): Promise<TopicContext | undefined> {
  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey) {
    console.warn("[search] topicContext skipped — no Gemini API key");
    return undefined;
  }
  emit({
    type: "status",
    step: "context",
    message: "Gathering topic context (venue, authentic visuals)…",
  });
  try {
    return await resolveTopicContext(apiKey, topic, hook);
  } catch (err) {
    console.warn("[search] topicContext failed:", err);
    return undefined;
  }
}

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
    /** light = exact YouTube search, unfiltered 50+; strict = expanded queries still unfiltered 50+ */
    filterMode?: GeminiFilterMode;
    onProgress?: (e: SearchProgressEvent) => void;
  }
): Promise<Extract<SearchProgressEvent, { type: "complete" }>> {
  const emit = options?.onProgress || (() => {});
  const channels = options?.channels;
  const hook = options?.hook;
  const filterMode: GeminiFilterMode = options?.filterMode === "strict" ? "strict" : "light";
  const userQuery = title.trim();
  const minResults = Math.max(LIGHT_FILTER_RESULTS, 50);

  let pool: ScrapedVideo[] = [];
  let queries: string[] = [userQuery];
  let youtubeQuery = userQuery;

  if (filterMode === "light") {
    // Exact user text → YouTube India/Relevance order. No Gemini cull — show 50+ like youtube.com.
    emit({
      type: "status",
      step: "search",
      message: `YouTube India · Relevance (50+ unfiltered): "${userQuery}"`,
    });
    console.log(`[search] light mode youtubeQuery=${JSON.stringify(userQuery)}`);
    const exact = await searchYouTubeExact(userQuery, {
      target: Math.max(LIGHT_FILTER_POOL, minResults),
    });
    pool = exact.videos;
    youtubeQuery = exact.query;
    queries = [exact.query];

    emit({
      type: "candidates",
      count: pool.length,
      videos: pool.slice(0, Math.min(24, pool.length)),
    });

    if (!pool.length) {
      throw new Error(`No landscape videos found for YouTube query "${youtubeQuery}".`);
    }

    if (pool.length < minResults) {
      console.warn(
        `[search] light mode under-filled: got ${pool.length}, wanted ≥${minResults}`
      );
    }

    // Keep YouTube relevance order — client can re-sort by views via Research filter.
    // Still gather topicContext so generate knows venue / authentic visuals (no result cull).
    const results = pool;
    const titles = results.slice(0, 8).map((v) => v.title);
    const topicContext = await gatherTopicContext(title, hook, emit);
    const complete = {
      type: "complete" as const,
      results,
      rejectedResults: [] as RejectedVideo[],
      filterSummary: topicContext
        ? `Showing ${results.length} YouTube results (unfiltered). Context: ${topicContext.setting}. Sort by views in Research filters.`
        : `Showing ${results.length} YouTube results in search order (no Gemini filter). Sort by views in Research filters.`,
      styleBrief: styleBriefFromContext(title, hook, topicContext, titles),
      titleSuggestions: titles.slice(0, 5),
      filteredCount: 0,
      qualityRejected: 0,
      channelStats: { kept: 0, droppedOffTopic: 0 },
      topicContext,
      source: `${exact.source}+unfiltered`,
      queries,
      youtubeQuery,
      filterMode,
    };
    emit(complete);
    return complete;
  }

  // Strict: expanded queries for a larger pool, still no Gemini cull — 50+ YouTube-order thumbs.
  queries = await expandQueriesForTopic(title, hook);
  youtubeQuery = queries[0] || userQuery;
  emit({
    type: "status",
    step: "search",
    message: `YouTube search (50+ unfiltered) — primary: "${youtubeQuery}"`,
  });
  pool = await searchLongFormViaYtsr(title, {
    channels,
    hook,
    target: Math.max(SEARCH_POOL_SIZE, minResults),
    queries,
    unfiltered: true,
  });

  // Also pull exact YouTube order for the raw title and prepend unique hits.
  const exact = await searchYouTubeExact(userQuery, {
    target: Math.max(LIGHT_FILTER_POOL, minResults),
  });
  {
    const seen = new Set(exact.videos.map((v) => v.videoId));
    const merged = [...exact.videos];
    for (const video of pool) {
      if (seen.has(video.videoId)) continue;
      seen.add(video.videoId);
      merged.push(video);
    }
    pool = merged;
  }

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
    videos: pool.slice(0, 24),
  });

  emit({ type: "status", step: "map", message: "Mapping thumbnails to opening scripts…" });
  const mappings = await buildVideoMappings(pool.slice(0, minResults), title, 8);
  emit({ type: "mappings", mappings });

  // Keep fetch / relevance order — client Research filter can sort by views.
  // Gather topicContext without culling the unfiltered thumb grid.
  const results = pool;
  const titles = results.slice(0, 8).map((v) => v.title);
  const topicContext = await gatherTopicContext(title, hook, emit);
  const complete = {
    type: "complete" as const,
    results,
    rejectedResults: [] as RejectedVideo[],
    filterSummary: topicContext
      ? `Showing ${results.length} YouTube results (unfiltered). Context: ${topicContext.setting}. Sort by views in Research filters.`
      : `Showing ${results.length} YouTube results (no Gemini filter). Sort by views in Research filters.`,
    styleBrief: styleBriefFromContext(title, hook, topicContext, titles),
    titleSuggestions: titles.slice(0, 5),
    filteredCount: 0,
    qualityRejected: 0,
    channelStats: { kept: 0, droppedOffTopic: 0 },
    topicContext,
    source: "ytsr-landscape+unfiltered",
    queries,
    youtubeQuery,
    filterMode,
  };
  emit(complete);
  return complete;
}
