import { NextResponse } from "next/server";
import { analyzeChannelProfile } from "@/lib/channel-profile";
import { searchReferenceChannels } from "@/lib/channel-search";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { channel?: string; topic?: string };
    const channel = (body.channel || "").trim();
    const topic = (body.topic || "channel").trim();

    if (!channel) {
      return NextResponse.json({ error: "channel is required" }, { status: 400 });
    }

    const videos = await searchReferenceChannels(topic, channel);
    if (!videos.length) {
      return NextResponse.json(
        {
          error:
            "No public landscape videos found for that channel URL/handle. Try https://www.youtube.com/@handle or the channel/UC… link.",
        },
        { status: 404 }
      );
    }

    const profile = await analyzeChannelProfile(channel, videos);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Channel profile failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
