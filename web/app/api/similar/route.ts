import { NextRequest, NextResponse } from "next/server";



import { TARGET_RESULTS } from "@/lib/apify-youtube";

import { searchYouTubeQueries, SEARCH_POOL_SIZE } from "@/lib/ytsr-search";

import { filterAndCurateWithGemini } from "@/lib/gemini-filter";

import { buildSimilarExploreQueries } from "@/lib/search-queries";

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

    const excludeIds = new Set<string>(

      Array.isArray(body.excludeIds) ? body.excludeIds : []

    );

    const channels = body.channels ? String(body.channels) : undefined;

    const feedback = (

      Array.isArray(body.feedback) ? body.feedback : []

    ) as ThumbnailFeedback[];

    const seedFeedback = feedback.find((f) => f.videoId === seed?.videoId);



    if (!topic || !seed?.title) {

      return NextResponse.json(

        { error: "topic and seed video required" },

        { status: 400 }

      );

    }



    // Vision-aware explore: 1–3 precise queries from seed title + thumbnail.

    const queries = await buildSimilarExploreQueries({

      topic,

      seed: {

        title: seed.title,

        channel: seed.channel,

        thumbnailUrl: seed.thumbnailUrl ?? "",

        videoId: seed.videoId,

      },

      comment: seedFeedback?.comment,

      feedback,

    });



    console.log(

      `[similar] explore queries=${JSON.stringify(queries)} seed=${JSON.stringify(seed.title)}`

    );



    const perQueryTarget = Math.max(

      12,

      Math.ceil(SEARCH_POOL_SIZE / Math.max(queries.length, 1)) + 8

    );



    const batches = await Promise.all(

      queries.map((q) =>

        searchYouTubeQueries([q], {

          channels,

          topic,

          target: perQueryTarget,

        }).catch(() => [])

      )

    );



    const seen = new Set<string>([seed.videoId, ...excludeIds]);

    const pool = [];

    for (const batch of batches) {

      for (const video of batch) {

        if (seen.has(video.videoId)) continue;

        seen.add(video.videoId);

        pool.push(video);

      }

    }



    if (!pool.length) {

      return NextResponse.json({

        results: [],

        rejectedResults: [],

        message: "No similar landscape videos found",

        queriesUsed: queries,

        youtubeQuery: queries[0] || topic,

        searchSource: "explore+ytsr-india-relevance",

      });

    }



    const likedNotes = feedback

      .filter((f) => f.rating === "like")

      .map(

        (f) =>

          `- LIKED "${f.title}"${f.comment ? `: ${f.comment}` : " (visual/style match)"}`

      )

      .join("\n");

    const dislikedNotes = feedback

      .filter((f) => f.rating === "dislike")

      .map(

        (f) =>

          `- AVOID patterns like "${f.title}"${f.comment ? `: ${f.comment}` : ""}`

      )

      .join("\n");



    const curationNotes = [

      `Find thumbnails whose titles match "${topic}" and are visually similar to seed "${seed.title}" by ${seed.channel}.`,

      seedFeedback?.comment

        ? `User liked the seed because: ${seedFeedback.comment}`

        : "Among on-title matches, prioritize composition, color energy, subject scale, and typography of the seed.",

      likedNotes ? `Liked reference feedback:\n${likedNotes}` : "",

      dislikedNotes ? `Disliked / avoid:\n${dislikedNotes}` : "",

      "Do not assume a genre. Keep only title-matching videos with correct visual context.",

      "HARD REJECT lifestyle/relationship/couple vlogs where the topic is only a name-drop or backdrop — primary subject must match the seed's format (race, training, competition), not boyfriend/girlfriend surprise or daily vlog framing.",

    ]

      .filter(Boolean)

      .join("\n");



    const result = await filterAndCurateWithGemini(topic, pool, {

      channelsRaw: channels,

      hook: curationNotes,

      strict: true,

      targetCount: TARGET_RESULTS,

      similaritySeed: {

        title: seed.title,

        channel: seed.channel,

        comment: seedFeedback?.comment,

        thumbnailUrl: seed.thumbnailUrl ?? "",

        videoId: seed.videoId,

      },

    });



    const mapped = result.videos.map((v) => ({

      ...v,

      similarTo: seed.title,

    }));



    return NextResponse.json({

      results: mapped,

      rejectedResults: result.rejectedVideos,

      filterSummary: result.filterSummary,

      filteredCount: result.filteredCount,

      qualityRejected: result.qualityRejected,

      seedTitle: seed.title,

      queriesUsed: queries,

      youtubeQuery: queries[0] || topic,

      searchSource: "explore+ytsr-india-relevance+context-vision",

      poolSize: pool.length,

    });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Similar search failed";

    return NextResponse.json({ error: message }, { status: 500 });

  }

}


