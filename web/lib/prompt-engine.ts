import type { StyleBrief } from "@/lib/style-intelligence";
import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";

const BASE =
  "Premium YouTube thumbnail, 16:9, photoreal, optimistic business-documentary style, edge-clean, no watermark.";

export function buildUltraPrompt(
  topic: string,
  options: {
    hook?: string;
    composition?: string;
    styleBrief?: StyleBrief;
    inspirations?: InspirationVideo[];
    feedback?: ThumbnailFeedback[];
    iterationNote?: string;
    iterationIndex?: number;
  }
): string {
  const hook = (options.hook || options.styleBrief?.suggestedHook || "").toUpperCase();
  const lines = [BASE, `Topic: ${topic.trim()}`];

  if (options.iterationNote) {
    lines.push(
      `ITERATION ${options.iterationIndex || 2}: Refine the previous thumbnail generation.`,
      `User edit request: ${options.iterationNote}`,
      "Keep premium quality. Apply the edit precisely while preserving overall style DNA."
    );
  }

  if (hook) lines.push(`Bold hook text: "${hook}"`);

  if (options.styleBrief) {
    lines.push(`Style: ${options.styleBrief.summary}`);
    lines.push(`Direction: ${options.styleBrief.creativeDirection}`);
    if (options.styleBrief.colorPalette?.length) {
      lines.push(`Colors (from liked thumbnails): ${options.styleBrief.colorPalette.slice(0, 5).join(", ")}`);
    }
    lines.push(`Mood: optimistic, premium, trustworthy`);
    if (options.styleBrief.avoidList.length) {
      lines.push(`AVOID: ${options.styleBrief.avoidList.join("; ")}`);
    }
  }

  if (options.composition) {
    const map: Record<string, string> = {
      center: "Center hero composition.",
      split: "Split comparison layout.",
      cutout: "Subject cutout left, scene right.",
      data: "Clean data/process overlay.",
    };
    if (map[options.composition]) lines.push(map[options.composition]);
  }

  const liked = options.feedback?.filter((f) => f.rating === "like") || [];
  const disliked = options.feedback?.filter((f) => f.rating === "dislike") || [];

  if (liked.length) {
    const likedRefs = liked
      .map((f) => {
        const note = f.comment ? ` (user note: ${f.comment})` : "";
        return `"${f.title}" by ${f.channel}${note}`;
      })
      .join("; ");
    lines.push(`STRONGLY match patterns from user-liked references: ${likedRefs}`);
  }

  if (disliked.length) {
    const avoid = disliked
      .map((f) => {
        const note = f.comment ? ` because: ${f.comment}` : "";
        return `"${f.title}"${note}`;
      })
      .join("; ");
    lines.push(`Do NOT resemble user-disliked thumbnails: ${avoid}`);
  }

  if (options.inspirations?.length) {
    const refs = options.inspirations
      .slice(0, 6)
      .map((v) => `"${v.title}" (${v.channel})`)
      .join("; ");
    lines.push(`Additional premium references: ${refs}`);
  }

  lines.push("Professional visuals. No clutter. Phone-readable text. Zero cheap clickbait.");
  return lines.join("\n");
}
