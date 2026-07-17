import { NextRequest, NextResponse } from "next/server";
import { suggestTitlesFromFeedback } from "@/lib/title-suggestions";
import type { ThumbnailFeedback } from "@/lib/inspiration";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = String(body.topic || "").trim();
    const feedback = (Array.isArray(body.feedback) ? body.feedback : []) as ThumbnailFeedback[];
    const existingSuggestions = Array.isArray(body.existingSuggestions)
      ? body.existingSuggestions.map(String)
      : [];

    if (!topic) {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }

    const likedTitles = feedback.filter((f) => f.rating === "like").map((f) => f.title);
    const dislikedTitles = feedback.filter((f) => f.rating === "dislike").map((f) => f.title);
    const feedbackNotes = feedback
      .filter((f) => f.comment)
      .map((f) => `[${f.rating}] ${f.title}: ${f.comment}`)
      .join("\n");

    const titles = await suggestTitlesFromFeedback({
      topic,
      feedbackNotes,
      likedTitles,
      dislikedTitles,
      existingSuggestions,
    });

    return NextResponse.json({ titleSuggestions: titles });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Title search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
