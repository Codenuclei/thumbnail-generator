import { NextRequest, NextResponse } from "next/server";
import { learnFromFeedback, loadDryLessons, ensureDryMd } from "@/lib/dry-learn";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — current dry.md lesson count (for UI / health). */
export async function GET() {
  ensureDryMd();
  const lessons = loadDryLessons();
  return NextResponse.json({
    prefer: lessons.filter((l) => l.polarity === "prefer").length,
    avoid: lessons.filter((l) => l.polarity === "avoid").length,
    total: lessons.length,
    recent: lessons.slice(-8).map((l) => ({
      id: l.id,
      polarity: l.polarity,
      lesson: l.lesson,
      source: l.source,
    })),
  });
}

/**
 * POST — rate a generated or inspiration thumbnail.
 * One Gemini pass → unique lessons appended to dry.md (no duplicates).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rating = body.rating === "like" || body.rating === "dislike" ? body.rating : null;
    if (!rating) {
      return NextResponse.json({ error: "rating must be like or dislike" }, { status: 400 });
    }
    const source =
      body.source === "inspiration" || body.source === "generated" ? body.source : "generated";

    const imageBase64 = body.image
      ? String(body.image).replace(/^data:[^;]+;base64,/, "")
      : undefined;

    const result = await learnFromFeedback({
      rating,
      source,
      comment: body.comment ? String(body.comment).trim() : undefined,
      topic: body.topic ? String(body.topic) : undefined,
      hook: body.hook ? String(body.hook) : undefined,
      title: body.title ? String(body.title) : undefined,
      imageBase64,
      mimeType: body.mimeType ? String(body.mimeType) : "image/png",
      thumbnailUrl: body.thumbnailUrl ? String(body.thumbnailUrl) : undefined,
    });

    return NextResponse.json({
      ok: true,
      added: result.added.map((l) => ({
        id: l.id,
        polarity: l.polarity,
        lesson: l.lesson,
      })),
      skipped: result.skipped,
      dryPath: result.dryPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feedback learn failed";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
