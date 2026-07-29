import { NextRequest, NextResponse } from "next/server";
import { runSearchPipeline } from "@/lib/search-pipeline";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body.title || body.topic || "").trim();
    const channels = body.channels ? String(body.channels) : undefined;
    const hook = body.hook ? String(body.hook).trim() : undefined;
    const filterMode =
      body.filterMode === "strict" || body.lightFilter === false ? "strict" : "light";

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const result = await runSearchPipeline(title, { channels, hook, filterMode });
    return NextResponse.json({
      results: result.results,
      rejectedResults: result.rejectedResults,
      filterSummary: result.filterSummary,
      styleBrief: result.styleBrief,
      titleSuggestions: result.titleSuggestions,
      filteredCount: result.filteredCount,
      qualityRejected: result.qualityRejected,
      channelStats: result.channelStats,
      topicContext: result.topicContext,
      queries: result.queries,
      youtubeQuery: result.youtubeQuery,
      source: result.source,
      filterMode: result.filterMode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
