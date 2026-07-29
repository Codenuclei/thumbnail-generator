import { NextRequest, NextResponse } from "next/server";

import { TARGET_RESULTS, type ScrapedVideo } from "@/lib/apify-youtube";

import { searchLongFormViaYtsr, SEARCH_POOL_SIZE } from "@/lib/ytsr-search";

import { filterAndCurateWithGemini } from "@/lib/gemini-filter";



export const maxDuration = 120;

export const dynamic = "force-dynamic";



export async function POST(req: NextRequest) {

  try {

    const body = await req.json();

    const title = String(body.title || body.topic || "").trim();

    const channels = body.channels ? String(body.channels) : undefined;

    const hook = body.hook ? String(body.hook).trim() : undefined;

    const styleOnly = body.styleOnly === true;

    const videosInput = body.videos as ScrapedVideo[] | undefined;



    if (!title) {

      return NextResponse.json({ error: "Title is required" }, { status: 400 });

    }



    if (styleOnly && videosInput?.length) {

      const result = await filterAndCurateWithGemini(title, videosInput, {

        channelsRaw: channels,

        hook,

        strict: true,

      });

      return NextResponse.json({

        results: result.videos,

        styleBrief: result.styleBrief,

        filteredCount: result.filteredCount,

        source: "gemini-quality-filter",

      });

    }



    const pool = await searchLongFormViaYtsr(title, { channels, hook, target: SEARCH_POOL_SIZE });

    const result = await filterAndCurateWithGemini(title, pool, {

      channelsRaw: channels,

      hook,

      strict: true,

      targetCount: TARGET_RESULTS,

    });



    return NextResponse.json({

      results: result.videos,

      styleBrief: result.styleBrief,

      titleSuggestions: result.titleSuggestions,

      filteredCount: result.filteredCount,

      qualityRejected: result.qualityRejected,

      source: "ytsr-landscape+gemini-quality",

      directions: {

        summary: result.styleBrief.summary,

        creativeDirection: result.styleBrief.creativeDirection,

        doList: result.styleBrief.doList,

        avoidList: result.styleBrief.avoidList,

        suggestedHook: result.styleBrief.suggestedHook,

      },

    });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Research failed";

    console.error(message);

    return NextResponse.json({ error: message }, { status: 500 });

  }

}

