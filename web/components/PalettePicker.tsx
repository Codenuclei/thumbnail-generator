"use client";

import type { ColorPaletteOption } from "@/lib/palette-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/ColorPicker";
import { cn } from "@/lib/utils";
import { LoaderCircle, Pencil, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

type Props = {
  palettes: ColorPaletteOption[];
  selectedId: string | null;
  loading?: boolean;
  hasLikes: boolean;
  hasMediaColors?: boolean;
  sourceLabel?: string;
  onSelect: (palette: ColorPaletteOption) => void;
  onUpdate: (palette: ColorPaletteOption) => void;
  onSuggest: (paletteFeedback?: string) => void;
  onRatePalette: (paletteId: string, rating: "like" | "dislike") => void;
  paletteRatings?: Record<string, "like" | "dislike" | null>;
};

function withCustomLabel(name: string): string {
  return /custom/i.test(name) ? name : `${name} · custom`;
}

export function PalettePicker({
  palettes,
  selectedId,
  loading,
  hasLikes,
  hasMediaColors = false,
  sourceLabel,
  onSelect,
  onUpdate,
  onSuggest,
  onRatePalette,
  paletteRatings = {},
}: Props) {
  const [feedbackNote, setFeedbackNote] = useState("");

  if (!hasLikes && !hasMediaColors && !palettes.length) {
    return (
      <div className="rounded-[12px] border border-[#efefef] bg-[#f7f7f7] px-3 py-2.5">
        <p className="type-ui text-[#171618]">Color suggestions</p>
        <p className="mt-0.5 type-caption text-[#5c5e60]">
          Like qualified thumbnails, then press Suggest colors when you&apos;re done selecting.
        </p>
      </div>
    );
  }

  function updateColor(palette: ColorPaletteOption, index: number, hex: string) {
    const colors = palette.colors.map((c, i) => (i === index ? hex : c));
    onUpdate({
      ...palette,
      colors,
      name: withCustomLabel(palette.name),
    });
  }

  return (
    <div className="space-y-2 rounded-[12px] border border-[#efefef] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="type-ui text-[#171618]">Color suggestions</p>
          <p className="type-caption text-[#5c5e60]">
            {sourceLabel || "Extracted from liked thumbs"} · click a card to select
          </p>
        </div>
        {!palettes.length && hasLikes && (
          <Button size="sm" disabled={loading} onClick={() => onSuggest()}>
            {loading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Suggest colors
          </Button>
        )}
      </div>

      {palettes.length > 0 && (
        <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Color palettes">
          {palettes.map((p) => {
            const selected = selectedId === p.id;
            const rating = paletteRatings[p.id];
            return (
              <div
                key={p.id}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => onSelect(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(p);
                  }
                }}
                className={cn(
                  "group cursor-pointer rounded-[10px] border px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#171618]",
                  selected
                    ? "border-[#171618] bg-[#f7f7f7] ring-1 ring-[#171618]"
                    : "border-[#efefef] bg-white hover:border-[#727578]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate type-caption font-medium text-[#171618]">{p.name}</p>
                  <div
                    className="flex shrink-0 items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={cn(
                        "rounded-full p-1 text-[#5c5e60] transition-opacity hover:text-[#171618]",
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                        selected && "opacity-100"
                      )}
                      aria-label="Edit palette colors"
                      onClick={(e) => {
                        if (!selected) onSelect(p);
                        const card = (e.currentTarget as HTMLElement).closest(
                          "[role=radio]"
                        );
                        const firstSwatch = card?.querySelector<HTMLButtonElement>(
                          'button[aria-label*="color wheel"]'
                        );
                        firstSwatch?.click();
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {hasLikes && (
                      <>
                        <button
                          type="button"
                          className={cn(
                            "rounded-full p-1",
                            rating === "like" ? "text-[#004d60]" : "text-[#5c5e60]"
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
                            rating === "dislike" ? "text-[#ff3e00]" : "text-[#5c5e60]"
                          )}
                          onClick={() => onRatePalette(p.id, "dislike")}
                          aria-label="Dislike palette"
                        >
                          <ThumbsDown className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className="mt-1.5 flex flex-wrap items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={() => {
                    if (!selected) onSelect(p);
                  }}
                >
                  {p.colors.map((c, index) => (
                    <ColorPicker
                      key={`${p.id}-${index}`}
                      compact
                      label={`Color ${index + 1}`}
                      value={c.startsWith("#") ? c : `#${c}`}
                      onChange={(hex) => {
                        if (!selected) onSelect(p);
                        updateColor(p, index, hex);
                      }}
                    />
                  ))}
                  {selected && (
                    <span className="type-caption text-[#004d60]">Selected</span>
                  )}
                </div>

                {p.rationale && (
                  <p className="mt-1 type-caption text-[#5c5e60] line-clamp-1">{p.rationale}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {palettes.length > 0 && hasLikes && (
        <div className="flex gap-2">
          <Textarea
            className="min-h-[44px] flex-1"
            placeholder="Palette feedback… e.g. warmer, less orange"
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 self-end"
            disabled={loading || !feedbackNote.trim()}
            onClick={() => {
              onSuggest(feedbackNote.trim());
              setFeedbackNote("");
            }}
          >
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : "Apply"}
          </Button>
        </div>
      )}
    </div>
  );
}
