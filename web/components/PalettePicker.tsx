"use client";

import type { ColorPaletteOption } from "@/lib/palette-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

type Props = {
  palettes: ColorPaletteOption[];
  selectedId: string | null;
  loading?: boolean;
  hasLikes: boolean;
  onSelect: (palette: ColorPaletteOption) => void;
  onSuggest: (paletteFeedback?: string) => void;
  onRatePalette: (paletteId: string, rating: "like" | "dislike") => void;
  paletteRatings?: Record<string, "like" | "dislike" | null>;
};

export function PalettePicker({
  palettes,
  selectedId,
  loading,
  hasLikes,
  onSelect,
  onSuggest,
  onRatePalette,
  paletteRatings = {},
}: Props) {
  const [feedbackNote, setFeedbackNote] = useState("");

  if (!hasLikes) {
    return (
      <div className="rounded-[16px] border border-[#e8e8e8] bg-[#fafafa] p-4">
        <p className="type-ui text-[#181925]">Color suggestions</p>
        <p className="mt-1 type-ui font-normal text-[#666666]">
          Like qualified thumbnails first — colors are picked from those images, not before Gemini
          quality filter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-[#e8e8e8] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="type-ui text-[#181925]">Color suggestions</p>
          <p className="mt-0.5 type-caption text-[#999999]">
            Extracted from liked thumbs · pick one for generation
          </p>
        </div>
        <Button
          size="sm"
          variant={palettes.length ? "outline" : "default"}
          disabled={loading}
          onClick={() => onSuggest(feedbackNote.trim() || undefined)}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : palettes.length ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {palettes.length ? "Resuggest" : "Suggest colors"}
        </Button>
      </div>

      {palettes.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {palettes.map((p) => {
            const selected = selectedId === p.id;
            const rating = paletteRatings[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className={cn(
                  "rounded-[12px] border p-3 text-left transition-colors",
                  selected
                    ? "border-[#181925] bg-[#fafafa]"
                    : "border-[#e8e8e8] bg-white hover:border-[#999999]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="type-ui text-[#181925]">{p.name}</p>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full p-1",
                        rating === "like" ? "text-[#33c758]" : "text-[#999999]"
                      )}
                      onClick={() => onRatePalette(p.id, "like")}
                      aria-label="Like palette"
                    >
                      <ThumbsUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full p-1",
                        rating === "dislike" ? "text-[#ff3e00]" : "text-[#999999]"
                      )}
                      onClick={() => onRatePalette(p.id, "dislike")}
                      aria-label="Dislike palette"
                    >
                      <ThumbsDown className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {p.colors.map((c) => (
                    <span
                      key={`${p.id}-${c}`}
                      className="size-6 rounded-full border border-[#e8e8e8]"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
                {p.rationale && (
                  <p className="mt-2 type-caption text-[#666666] line-clamp-2">{p.rationale}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {palettes.length > 0 && (
        <div className="space-y-2">
          <Textarea
            className="min-h-[64px]"
            placeholder="Palette feedback for AI resuggest… e.g. warmer, less orange, more factory steel"
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
