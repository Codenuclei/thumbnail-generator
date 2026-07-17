import { NextRequest, NextResponse } from "next/server";
import {
  buildResultFromClientCandidates,
  extractOpeningFramesFromStream,
} from "@/lib/opening-frames";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

type ClientPickBody = {
  label?: string;
  topic?: string;
  candidates?: Array<{
    timestampSec: number;
    mimeType: string;
    data: string;
    previewData?: string;
  }>;
};

function jsonFromResult(
  result: Awaited<ReturnType<typeof buildResultFromClientCandidates>>,
  options?: { includeCandidateData?: boolean }
) {
  if (!result.asset || !result.candidates.length) {
    return NextResponse.json(
      {
        error:
          "Could not extract frames — try MP4/WebM, ensure the clip is at least 2 seconds, or re-encode with faststart",
      },
      { status: 422 }
    );
  }

  const { asset } = result;
  const includeCandidateData = options?.includeCandidateData !== false;
  return NextResponse.json({
    mimeType: asset.mimeType,
    data: asset.data,
    label: asset.label,
    timestampSec: asset.timestampSec,
    bytesRead: result.bytesRead,
    extractMode: result.bytesRead ? "server" : "client",
    // Client already has preview frames — avoid echoing multi-MB base64 back.
    candidates: result.candidates.map((c) => ({
      timestampSec: c.timestampSec,
      mimeType: c.mimeType,
      ...(includeCandidateData
        ? { data: c.data, previewData: c.previewData }
        : {}),
    })),
    geminiPickIndex: result.geminiPickIndex,
    geminiReason: result.geminiReason,
    pickSource: result.pickSource,
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = (req.headers.get("content-type") || "").split(";")[0].trim();

    if (contentType === "application/json") {
      const body = (await req.json()) as ClientPickBody;
      const label = body.label || "clip";
      const candidates = Array.isArray(body.candidates) ? body.candidates : [];
      if (!candidates.length) {
        return NextResponse.json({ error: "No frame candidates provided" }, { status: 400 });
      }

      // Ranking JPEGs only — drop any preview blobs the client may have sent.
      const lean = candidates.map((c) => ({
        timestampSec: c.timestampSec,
        mimeType: c.mimeType || "image/jpeg",
        data: c.data,
      }));
      const result = await buildResultFromClientCandidates(lean, label, body.topic);
      return jsonFromResult(result, { includeCandidateData: false });
    }

    if (!req.body) {
      return NextResponse.json({ error: "No upload body" }, { status: 400 });
    }

    const mimeType = (contentType || "video/mp4").split(";")[0].trim();
    const rawName = req.headers.get("x-video-name") || "clip";
    const label = decodeURIComponent(rawName);
    const topic = req.headers.get("x-video-topic")
      ? decodeURIComponent(req.headers.get("x-video-topic")!)
      : undefined;

    // Image body (YouTube CDN still or direct JPEG) — skip ffmpeg entirely.
    if (mimeType.startsWith("image/")) {
      const buf = Buffer.from(await req.arrayBuffer());
      const result = await buildResultFromClientCandidates(
        [
          {
            timestampSec: 0,
            mimeType: mimeType.includes("png") ? "image/png" : "image/jpeg",
            data: buf.toString("base64"),
          },
        ],
        label,
        topic
      );
      return jsonFromResult(result);
    }

    const result = await extractOpeningFramesFromStream(req.body, mimeType, label, topic);
    return jsonFromResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Frame extraction failed";
    console.error("opening-frames route:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
