import { NextRequest, NextResponse } from "next/server";
import { buildVideoMappings } from "@/lib/video-mapping";
import type { ScrapedVideo } from "@/lib/apify-youtube";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = String(body.topic || body.title || "").trim();
    const videos = (Array.isArray(body.videos) ? body.videos : []) as ScrapedVideo[];
    const limit = Math.min(Number(body.limit) || 6, 10);

    if (!topic) {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }
    if (!videos.length) {
      return NextResponse.json({ mappings: [] });
    }

    const mappings = await buildVideoMappings(videos, topic, limit);
    return NextResponse.json({ mappings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mapping failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
