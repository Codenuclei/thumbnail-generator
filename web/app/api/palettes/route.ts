import { NextRequest, NextResponse } from "next/server";
import {
  suggestPalettesFromLiked,
  type ColorPaletteOption,
} from "@/lib/palette-suggestions";
import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = String(body.topic || "").trim();
    const hook = body.hook ? String(body.hook).trim() : undefined;
    const liked = (Array.isArray(body.liked) ? body.liked : []) as InspirationVideo[];
    const feedback = (Array.isArray(body.feedback) ? body.feedback : []) as ThumbnailFeedback[];
    const previousPalettes = (Array.isArray(body.previousPalettes)
      ? body.previousPalettes
      : []) as ColorPaletteOption[];
    const paletteFeedback = body.paletteFeedback
      ? String(body.paletteFeedback).trim()
      : undefined;

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }
    if (!liked.length) {
      return NextResponse.json(
        { error: "Like at least one qualified thumbnail before suggesting colors" },
        { status: 400 }
      );
    }

    const result = await suggestPalettesFromLiked(topic, liked, feedback, {
      hook,
      previousPalettes,
      paletteFeedback,
    });

    return NextResponse.json({
      palettes: result.palettes,
      styleBrief: result.styleBrief,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Palette suggestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
