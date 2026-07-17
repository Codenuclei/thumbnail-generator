import { NextRequest, NextResponse } from "next/server";

import { TARGET_RESULTS } from "@/lib/apify-youtube";

import { searchLongFormViaYtsr, SEARCH_POOL_SIZE } from "@/lib/ytsr-search";

import { filterAndCurateWithGemini } from "@/lib/gemini-filter";

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



    const pool = await searchLongFormViaYtsr(`${seed.title} ${topic}`, {

      channels,

      target: SEARCH_POOL_SIZE,

    }).then((videos) =>

      videos.filter((v) => v.videoId !== seed.videoId && !excludeIds.has(v.videoId))

    );



    if (!pool.length) {

      return NextResponse.json({ results: [], message: "No similar landscape videos found" });

    }



    const feedbackNotes = seedFeedback?.comment

      ? `User liked "${seed.title}" because: ${seedFeedback.comment}. Find thumbnails with similar visual qualities.`

      : undefined;



    const result = await filterAndCurateWithGemini(topic, pool, {

      channelsRaw: channels,

      hook: feedbackNotes,

      strict: false,

      targetCount: TARGET_RESULTS,

    });



    const mapped = result.videos.map((v) => ({

      ...v,

      similarTo: seed.title,

    }));



    return NextResponse.json({

      results: mapped,

      filteredCount: result.filteredCount,

      qualityRejected: result.qualityRejected,

      seedTitle: seed.title,

      queriesUsed: [`${seed.title} ${topic}`],

    });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Similar search failed";

    return NextResponse.json({ error: message }, { status: 500 });

  }

}

