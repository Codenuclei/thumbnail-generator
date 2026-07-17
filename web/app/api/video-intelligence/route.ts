import { NextRequest, NextResponse } from "next/server";
import { thumbnailUrlCandidates } from "@/lib/extract-colors";
import { analyzeVideoIntelligence } from "@/lib/video-intelligence";
import type {
  MediaImageInput,
  VideoIntelligenceRequest,
} from "@/lib/video-intelligence-types";
import { fetchYouTubeVideoContext } from "@/lib/youtube-transcript";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_IMAGES = 8;
const MAX_IMAGE_BASE64_CHARS = 750_000;
const MAX_TOTAL_BASE64_CHARS = 3_200_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

function sanitizeImages(value: unknown): MediaImageInput[] {
  if (!Array.isArray(value)) return [];
  let total = 0;
  const images: MediaImageInput[] = [];
  for (const raw of value.slice(0, MAX_IMAGES)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const mimeType = String(record.mimeType || "image/jpeg");
    const data = String(record.data || "").replace(/^data:[^;]+;base64,/, "");
    if (!mimeType.startsWith("image/") || !data || data.length > MAX_IMAGE_BASE64_CHARS) {
      continue;
    }
    total += data.length;
    if (total > MAX_TOTAL_BASE64_CHARS) break;
    const kind =
      record.kind === "photo" || record.kind === "youtube-thumbnail"
        ? record.kind
        : "video-frame";
    images.push({
      id: String(record.id || `media-${images.length + 1}`),
      name: String(record.name || `Media ${images.length + 1}`).slice(0, 120),
      kind,
      mimeType,
      data,
      timestampSec:
        Number.isFinite(Number(record.timestampSec)) && record.timestampSec != null
          ? Number(record.timestampSec)
          : undefined,
    });
  }
  return images;
}

async function fetchYouTubeThumbnail(
  thumbnailUrl: string,
  videoId: string
): Promise<MediaImageInput | null> {
  for (const url of thumbnailUrlCandidates(thumbnailUrl, videoId)) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.youtube.com/",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 500 || buffer.length > 1_500_000) continue;
      const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      return {
        id: `youtube-${videoId}`,
        name: "Public YouTube thumbnail",
        kind: "youtube-thumbnail",
        mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
        data: buffer.toString("base64"),
      };
    } catch {
      // Try the next YouTube thumbnail resolution.
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VideoIntelligenceRequest;
    const topic = String(body.topic || "").trim().slice(0, 500);
    const youtubeUrl = String(body.youtubeUrl || "").trim();
    const userScript = String(body.script || "").trim().slice(0, 100_000);
    const images = sanitizeImages(body.images);

    if (!topic && !youtubeUrl && !userScript && !images.length) {
      return NextResponse.json(
        { error: "Add a video, photo, YouTube URL, script, or topic to analyze" },
        { status: 400 }
      );
    }

    const youtube = youtubeUrl
      ? await fetchYouTubeVideoContext(youtubeUrl)
      : undefined;

    if (youtube) {
      const thumbnail = await fetchYouTubeThumbnail(youtube.thumbnailUrl, youtube.videoId);
      if (thumbnail) images.push(thumbnail);
    }

    const script = userScript || youtube?.transcript || "";
    const scriptSource = userScript
      ? ("user" as const)
      : youtube?.transcriptSource === "captions"
        ? ("youtube-captions" as const)
        : youtube?.transcriptSource === "description"
          ? ("youtube-description" as const)
          : ("none" as const);

    const result = await analyzeVideoIntelligence({
      topic,
      script,
      scriptSource,
      images: images.slice(0, MAX_IMAGES),
      youtube,
    });

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Video intelligence failed";
    console.error("video-intelligence route:", message);
    const status = /valid public YouTube|YouTube page unavailable|public YouTube metadata/i.test(
      message
    )
      ? 422
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

