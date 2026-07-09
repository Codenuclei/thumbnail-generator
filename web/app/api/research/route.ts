import { NextRequest, NextResponse } from "next/server";
import { tryApifyScrape, type ScrapedVideo } from "@/lib/apify-youtube";
import { searchTopThumbnails } from "@/lib/youtube-search";
import { searchReferenceChannels } from "@/lib/channel-search";
import { filterAndCurateWithGemini } from "@/lib/gemini-filter";
import { parseChannelHandles } from "@/lib/title-relevance";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

function toScraped(
  results: Array<{
    videoId: string;
    title: string;
    channel: string;
    viewCount: number;
    thumbnailUrl: string;
  }>
): ScrapedVideo[] {
  return results.map((r) => ({
    ...r,
    description: "",
    url: `https://www.youtube.com/watch?v=${r.videoId}`,
  }));
}

function mergeVideos(...lists: ScrapedVideo[][]): ScrapedVideo[] {
  const seen = new Set<string>();
  const merged: ScrapedVideo[] = [];
  for (const list of lists) {
    for (const v of list) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      merged.push(v);
    }
  }
  return merged;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body.title || body.topic || "").trim();
    const channels = body.channels ? String(body.channels) : undefined;
    const hook = body.hook ? String(body.hook).trim() : undefined;
    const styleOnly = body.styleOnly === true;
    const videosInput = body.videos as ScrapedVideo[] | undefined;
    const hasChannels = Boolean(parseChannelHandles(channels).length);

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (styleOnly && videosInput?.length) {
      const result = await filterAndCurateWithGemini(title, videosInput, { channelsRaw: channels, hook });
      return NextResponse.json({
        results: result.videos,
        styleBrief: result.styleBrief,
        filteredCount: result.filteredCount,
        source: "gemini-dynamic-filter",
      });
    }

    const [apifyVideos, channelVideos, innerTube] = await Promise.all([
      tryApifyScrape(title, { channels }),
      hasChannels && channels ? searchReferenceChannels(title, channels) : Promise.resolve([]),
      searchTopThumbnails(title, { fast: true }),
    ]);

    const merged = mergeVideos(apifyVideos || [], channelVideos, toScraped(innerTube.results));
    const result = await filterAndCurateWithGemini(title, merged, { channelsRaw: channels, hook });

    return NextResponse.json({
      results: result.videos,
      styleBrief: result.styleBrief,
      titleSuggestions: result.titleSuggestions,
      filteredCount: result.filteredCount,
      qualityRejected: result.qualityRejected,
      source: "gemini-dynamic-filter",
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
