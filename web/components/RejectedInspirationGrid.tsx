"use client";

import { useState } from "react";
import type { RejectedInspirationVideo } from "@/lib/inspiration";
import { formatViews } from "@/lib/inspiration";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Expand } from "lucide-react";

type Props = {
  items: RejectedInspirationVideo[];
  summary?: string;
};

export function RejectedInspirationGrid({ items, summary }: Props) {
  const [expanded, setExpanded] = useState<RejectedInspirationVideo | null>(null);

  if (!items.length) return null;

  return (
    <>
      <div className="space-y-2 border-t border-[#efefef] pt-4">
        <div className="space-y-0.5">
          <p className="type-caption font-medium text-[#5c5e60]">
            Dropped by filter
            <span className="ml-1.5 font-normal tabular-nums text-[var(--text-tertiary)]">
              ({items.length})
            </span>
          </p>
          {summary ? (
            <p className="type-caption leading-snug text-[var(--text-tertiary)]">{summary}</p>
          ) : (
            <p className="type-caption text-[var(--text-tertiary)]">
              Wrong topic or visual context — not selectable as references.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 opacity-70">
          {items.map((item) => (
            <article
              key={item.videoId}
              className="flex flex-col rounded-[10px] border border-dashed border-[#efefef] bg-[#f7f7f7] p-2"
            >
              <div className="relative">
                <div className="relative w-full overflow-hidden rounded-[6px] border border-[#efefef] grayscale">
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="aspect-video w-full object-cover"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute top-1 right-1 size-6 bg-white/90 shadow-sm hover:bg-white"
                  title="Expand thumbnail"
                  aria-label="Expand thumbnail"
                  onClick={() => setExpanded(item)}
                >
                  <Expand className="size-3" />
                </Button>
              </div>

              <div className="mt-1.5 min-w-0 flex-1">
                <p className="truncate type-caption font-medium text-[#5c5e60]">{item.channel}</p>
                <p
                  className="mt-0.5 line-clamp-2 type-caption text-[#5c5e60]"
                  title={item.title}
                >
                  {item.title}
                </p>
                <p className="mt-0.5 type-caption text-[var(--text-tertiary)]">
                  {formatViews(item.viewCount)}
                </p>
                {item.rejectReason ? (
                  <p className="mt-1 line-clamp-2 type-caption text-[var(--text-tertiary)]">
                    {item.rejectReason}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(expanded)} onOpenChange={(open) => !open && setExpanded(null)}>
        <DialogContent
          className="max-w-[min(92vw,960px)] border-none bg-transparent p-0 shadow-none sm:max-w-[min(92vw,960px)]"
          showCloseButton
        >
          {expanded && (
            <img
              src={expanded.thumbnailUrl}
              alt={expanded.title}
              className="max-h-[85vh] w-full rounded-[8px] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
