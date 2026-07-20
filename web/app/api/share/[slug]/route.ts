import { NextResponse } from "next/server";
import { getShareBySlug } from "@/lib/share-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: { slug: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const found = await getShareBySlug(params.slug);
    if (!found) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      slug: found.record.slug,
      title: found.record.title,
      topic: found.record.topic,
      payload: found.payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share lookup failed";
    console.error("[share/get]", message);
    const missing = /missing|404/i.test(message);
    return NextResponse.json(
      {
        error: missing
          ? "Share file is missing from storage. Ask the creator to hit Share again."
          : message,
      },
      { status: missing ? 404 : 500 }
    );
  }
}
