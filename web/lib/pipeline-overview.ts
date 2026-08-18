import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { StyleBrief } from "@/lib/style-intelligence";

export type PipelineReference = {
  videoId: string;
  title: string;
  channel: string;
  viewCount: number;
  thumbnailUrl: string;
  selected: boolean;
  rating: "like" | "dislike" | null;
  comment: string;
};

export type PipelineOverview = {
  topic: string;
  hook: string;
  composition: string;
  imageSize: string;
  model: string;
  references: PipelineReference[];
  liked: PipelineReference[];
  disliked: PipelineReference[];
  selectedCount: number;
  titleSuggestions: string[];
  styleSummary: string;
  creativeDirection: string;
  iterationNote?: string;
  iterationIndex?: number;
};

export function buildPipelineOverview(input: {
  topic: string;
  hook: string;
  composition: string;
  imageSize: string;
  model: string;
  inspirations: InspirationVideo[];
  selectedIds: Set<string>;
  feedback: ThumbnailFeedback[];
  styleBrief?: StyleBrief | null;
  titleSuggestions: string[];
  iterationNote?: string;
  iterationIndex?: number;
}): PipelineOverview {
  const fbMap = new Map(input.feedback.map((f) => [f.videoId, f]));

  const references: PipelineReference[] = input.inspirations.map((v) => {
    const fb = fbMap.get(v.videoId);
    return {
      videoId: v.videoId,
      title: v.title,
      channel: v.channel,
      viewCount: v.viewCount,
      thumbnailUrl: v.thumbnailUrl,
      selected: input.selectedIds.has(v.videoId),
      rating: fb?.rating ?? null,
      comment: fb?.comment || "",
    };
  });

  const liked = references.filter((r) => r.rating === "like");
  const disliked = references.filter((r) => r.rating === "dislike");

  return {
    topic: input.topic,
    hook: input.hook,
    composition: input.composition || "Auto",
    imageSize: input.imageSize,
    model: input.model || "google/gemini-2.5-flash-image",
    references,
    liked,
    disliked,
    selectedCount: references.filter((r) => r.selected).length,
    titleSuggestions: input.titleSuggestions,
    styleSummary: input.styleBrief?.summary || "",
    creativeDirection: input.styleBrief?.creativeDirection || "",
    iterationNote: input.iterationNote,
    iterationIndex: input.iterationIndex,
  };
}
