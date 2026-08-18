import {
  searchLongFormViaYtsr,
  searchYouTubeExact,
  SEARCH_POOL_SIZE,
} from "@/lib/ytsr-search";
import type { ScrapedVideo } from "@/lib/apify-youtube";
import {
  LIGHT_FILTER_POOL,
  LIGHT_FILTER_RESULTS,
  gateThumbnailContent,
  resolveTopicContext,
  type ContentGateSummary,
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
      contentGate?: ContentGateSummary;
      source: string;
      queries: string[];
      youtubeQuery: string;
      filterMode: GeminiFilterMode;
    }
  | { type: "error"; message: string };

/**
 * Run display safety gate, then emit gated candidates (never show ungated thumbs).
 */
async function gatePoolForDisplay(
  pool: ScrapedVideo[],
  options: {
    title: string;
    hook?: string;
    topicContext?: TopicContext;
    emit: (e: SearchProgressEvent) => void;
  }
): Promise<{
  results: ScrapedVideo[];
  rejectedResults: RejectedVideo[];
  contentGate: ContentGateSummary;
  filterSummary: string;
}> {
  options.emit({
    type: "status",
    step: "filter",
    message: "Checking thumbnails for safety & relevance…",
  });

  const contentGate = await gateThumbnailContent(pool, {
    topic: options.title,
    hook: options.hook,
    topicContext: options.topicContext,
  });

  const results = contentGate.allowed;
  const rejectedResults = contentGate.rejected;

  // Progressive UI: only gated thumbs ever reach InspirationGrid.
  if (results.length) {
    options.emit({
      type: "candidates",
      count: results.length,
      videos: results.slice(0, Math.min(24, results.length)),
    });
  }

  const filterSummary = [
    `Showing ${results.length} YouTube results after content gate`,
    contentGate.adultQuery ? "adult query — NSFW allowed when on-topic" : "NSFW blocked",
    contentGate.nsfwDropped ? `${contentGate.nsfwDropped} NSFW hidden` : null,
    contentGate.irrelevantDropped
      ? `${contentGate.irrelevantDropped} irrelevant dropped`
      : null,
    options.topicContext ? `Context: ${options.topicContext.setting}` : null,
    "Sort by views in Research filters",
  ]
    .filter(Boolean)
    .join(". ");

  return { results, rejectedResults, contentGate, filterSummary };
}

export async function runSearchPipeline(
  title: string,
  options?: {
    channels?: string;
    hook?: string;
    /** light = exact YouTube search + content gate; strict = expanded queries + content gate */
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
    // Exact user text → YouTube India/Relevance order, then content gate before display.
    emit({
      type: "status",
      step: "search",
      message: `YouTube India · Relevance (50+): "${userQuery}"`,
    });
    console.log(`[search] light mode youtubeQuery=${JSON.stringify(userQuery)}`);
    const exact = await searchYouTubeExact(userQuery, {
      target: Math.max(LIGHT_FILTER_POOL, minResults),
    });
    pool = exact.videos;
    youtubeQuery = exact.query;
    queries = [exact.query];

    if (!pool.length) {
      throw new Error(`No landscape videos found for YouTube query "${youtubeQuery}".`);
    }

    if (pool.length < minResults) {
      console.warn(
        `[search] light mode under-filled: got ${pool.length}, wanted ≥${minResults}`
      );
    }

    const topicContext = await gatherTopicContext(title, hook, emit);
    const gated = await gatePoolForDisplay(pool, {
      title,
      hook,
      topicContext,
      emit,
    });

    if (!gated.results.length) {
      throw new Error(
        "All thumbnails were blocked by the content safety gate — try a different query."
      );
    }

    const titles = gated.results.slice(0, 8).map((v) => v.title);
    const complete = {
      type: "complete" as const,
      results: gated.results,
      rejectedResults: gated.rejectedResults,
      filterSummary: gated.filterSummary,
      styleBrief: styleBriefFromContext(title, hook, topicContext, titles),
      titleSuggestions: titles.slice(0, 5),
      filteredCount: gated.rejectedResults.length,
      qualityRejected: gated.rejectedResults.length,
      channelStats: { kept: 0, droppedOffTopic: gated.rejectedResults.length },
      topicContext,
      contentGate: gated.contentGate,
      source: `${exact.source}+content-gate`,
      queries,
      youtubeQuery,
      filterMode,
    };
    emit(complete);
    return complete;
  }

  // Strict: expanded queries for a larger pool, then content gate before display.
  queries = await expandQueriesForTopic(title, hook);
  youtubeQuery = queries[0] || userQuery;
  emit({
    type: "status",
    step: "search",
    message: `YouTube search (50+) — primary: "${youtubeQuery}"`,
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

  emit({ type: "status", step: "map", message: "Mapping thumbnails to opening scripts…" });
  const mappings = await buildVideoMappings(pool.slice(0, minResults), title, 8);
  emit({ type: "mappings", mappings });

  const topicContext = await gatherTopicContext(title, hook, emit);
  const gated = await gatePoolForDisplay(pool, {
    title,
    hook,
    topicContext,
    emit,
  });

  if (!gated.results.length) {
    throw new Error(
      "All thumbnails were blocked by the content safety gate — try a different query."
    );
  }

  const titles = gated.results.slice(0, 8).map((v) => v.title);
  const complete = {
    type: "complete" as const,
    results: gated.results,
    rejectedResults: gated.rejectedResults,
    filterSummary: gated.filterSummary,
    styleBrief: styleBriefFromContext(title, hook, topicContext, titles),
    titleSuggestions: titles.slice(0, 5),
    filteredCount: gated.rejectedResults.length,
    qualityRejected: gated.rejectedResults.length,
    channelStats: { kept: 0, droppedOffTopic: gated.rejectedResults.length },
    topicContext,
    contentGate: gated.contentGate,
    source: "ytsr-landscape+content-gate",
    queries,
    youtubeQuery,
    filterMode,
  };
  emit(complete);
  return complete;
}
