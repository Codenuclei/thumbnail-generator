import { NextRequest, NextResponse } from "next/server";
import { tryApifyScrape } from "@/lib/apify-youtube";
import { searchInnerTube } from "@/lib/youtube-search";
import { filterAndCurateWithGemini } from "@/lib/gemini-filter";
import { expandQueriesFromFeedback } from "@/lib/search-queries";
import type { ThumbnailFeedback } from "@/lib/inspiration";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = String(body.topic || body.title || "").trim();
    const seed = body.seed as {
      videoId: string;
      title: string;
      channel: string;
      thumbnailUrl?: string;
    };
    const excludeIds = new Set<string>(Array.isArray(body.excludeIds) ? body.excludeIds : []);
    const channels = body.channels ? String(body.channels) : undefined;
    const feedback = (Array.isArray(body.feedback) ? body.feedback : []) as ThumbnailFeedback[];
    const seedFeedback = feedback.find((f) => f.videoId === seed?.videoId);

    if (!topic || !seed?.title) {
      return NextResponse.json({ error: "topic and seed video required" }, { status: 400 });
    }

    const queries = await expandQueriesFromFeedback({
      topic,
      seed,
      feedback: seedFeedback ? [seedFeedback, ...feedback.filter((f) => f.rating === "like")] : feedback,
    });

    const batches = await Promise.all(
      queries.map((q) => searchInnerTube(q).catch(() => []))
    );

    const raw = batches
      .flat()
      .filter((v) => v.videoId !== seed.videoId && !excludeIds.has(v.videoId))
      .map((v) => ({
        ...v,
        description: "",
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      }));

    const seen = new Set<string>();
    const merged = raw.filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });

    let pool = merged;
    if (pool.length < 6) {
      const apify = await tryApifyScrape(`${seed.title} ${topic}`, { channels });
      if (apify?.length) {
        for (const v of apify) {
          if (!excludeIds.has(v.videoId) && v.videoId !== seed.videoId && !seen.has(v.videoId)) {
            seen.add(v.videoId);
            pool.push(v);
          }
        }
      }
    }

    if (!pool.length) {
      return NextResponse.json({ results: [], message: "No similar videos found" });
    }

    const feedbackNotes = seedFeedback?.comment
      ? `User liked "${seed.title}" because: ${seedFeedback.comment}. Find thumbnails with similar visual qualities.`
      : undefined;

    const result = await filterAndCurateWithGemini(topic, pool, {
      channelsRaw: channels,
      strict: true,
      hook: feedbackNotes,
    });

    const results = result.videos.map((v) => ({
      ...v,
      similarTo: seed.title,
    }));

    return NextResponse.json({
      results,
      filteredCount: result.filteredCount,
      qualityRejected: result.qualityRejected,
      seedTitle: seed.title,
      queriesUsed: queries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Similar search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
