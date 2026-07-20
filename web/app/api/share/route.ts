import { NextRequest, NextResponse } from "next/server";
import { createShareRecord } from "@/lib/share-store";
import { publicSharePath } from "@/lib/share-slug";
import type { SharePayload } from "@/lib/studio-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = body.payload as SharePayload | undefined;
    if (!payload || payload.v !== 1 || !String(payload.topic || "").trim()) {
      return NextResponse.json(
        { error: "Valid share payload with topic is required" },
        { status: 400 }
      );
    }

    const sessionId = body.sessionId ? String(body.sessionId) : undefined;
    const preferredSlug = body.preferredSlug
      ? String(body.preferredSlug)
      : undefined;

    const created = await createShareRecord({
      payload,
      sessionId,
      preferredSlug,
    });

    const origin = req.nextUrl.origin;
    const path = publicSharePath(created.slug);

    return NextResponse.json({
      ok: true,
      slug: created.slug,
      title: created.title,
      path,
      url: `${origin}${path}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share create failed";
    console.error("[share]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
