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

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const result = await runSearchPipeline(title, { channels, hook });
    return NextResponse.json({
      results: result.results,
      styleBrief: result.styleBrief,
      titleSuggestions: result.titleSuggestions,
      filteredCount: result.filteredCount,
      qualityRejected: result.qualityRejected,
      channelStats: result.channelStats,
      queries: result.queries,
      source: result.source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
