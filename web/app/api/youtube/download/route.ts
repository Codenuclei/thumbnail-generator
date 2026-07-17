import { NextResponse } from "next/server";
import {
  downloadYoutubeToCohesivity,
  extractYoutubeVideoId,
} from "@/lib/youtube-download";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; youtubeUrl?: string };
    const raw = String(body.url || body.youtubeUrl || "").trim();
    if (!raw) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }
    if (!extractYoutubeVideoId(raw)) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }
    if (!runtimeEnv("COH_APPLICATION_KEY")) {
      return NextResponse.json(
        { error: "COH_APPLICATION_KEY not configured for object storage" },
        { status: 503 }
      );
    }

    const topic =
      typeof (body as { topic?: string }).topic === "string"
        ? String((body as { topic?: string }).topic).trim()
        : undefined;
    const result = await downloadYoutubeToCohesivity(raw, { topic: topic || undefined });
    return NextResponse.json({
      ok: true,
      ...result,
      path: result.key,
      filename: `${result.title.slice(0, 48)}.jpg`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube stills fetch failed";
    console.error("youtube/download:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
