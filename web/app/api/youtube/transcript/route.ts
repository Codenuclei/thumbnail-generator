import { NextResponse } from "next/server";
import {
  fetchYouTubeTranscript,
  parseYouTubeVideoId,
} from "@/lib/youtube-transcript";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; youtubeUrl?: string };
    const raw = String(body.url || body.youtubeUrl || "").trim();
    if (!raw) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }
    if (!parseYouTubeVideoId(raw)) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    const result = await fetchYouTubeTranscript(raw);
    if (!result.transcript?.trim()) {
      return NextResponse.json(
        {
          error:
            "No captions or usable description found for this video. Paste the script manually.",
          videoId: result.videoId,
          title: result.title,
          source: "unavailable",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      videoId: result.videoId,
      title: result.title,
      channel: result.channel,
      transcript: result.transcript,
      source: result.source,
      durationSec: result.durationSec,
      characters: result.characters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcript fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
