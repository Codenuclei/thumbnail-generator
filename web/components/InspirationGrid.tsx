"use client";

import { useState } from "react";
import type { InspirationVideo } from "@/lib/inspiration";
import { formatViews } from "@/lib/inspiration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Check,
  Compass,
  Expand,
  MessageSquareText,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

type FeedbackEntry = { rating: "like" | "dislike" | null; comment: string };

type Props = {
  items: InspirationVideo[];
  selectedIds: Set<string>;
  feedback: Record<string, FeedbackEntry>;
  exploring: boolean;
  onToggle: (videoId: string) => void;
  onLike: (item: InspirationVideo) => void;
  onDislike: (item: InspirationVideo) => void;
  onExplore: (item: InspirationVideo) => void;
  onEditFeedback: (item: InspirationVideo) => void;
};

export function InspirationGrid({
  items,
  selectedIds,
  feedback,
  exploring,
  onToggle,
  onLike,
  onDislike,
  onExplore,
  onEditFeedback,
}: Props) {
  const [expanded, setExpanded] = useState<InspirationVideo | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const selected = selectedIds.has(item.videoId);
          const fb = feedback[item.videoId];
          const isLiked = fb?.rating === "like";
          const isDisliked = fb?.rating === "dislike";
          const hasComment = Boolean(fb?.comment?.trim());

          return (
            <article
              key={item.videoId}
              className={cn(
                "flex flex-col rounded-[10px] border border-[#efefef] bg-white p-2 transition-colors",
                selected && "border-[#171618]",
                isLiked && !selected && "border-[#004d60]/50 bg-[#defafe]/50",
                isDisliked && "opacity-55"
              )}
            >
              <div className="relative">
                <button
                  type="button"
                  className="relative w-full overflow-hidden rounded-[6px] border border-[#efefef]"
                  onClick={() => onToggle(item.videoId)}
                >
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="aspect-video w-full object-cover"
                  />
                  {selected && (
                    <span className="absolute top-1 left-1 rounded-full bg-[#171618] p-0.5 text-white">
                      <Check className="size-3" />
                    </span>
                  )}
                  {item.similarTo && (
                    <Badge
                      variant="secondary"
                      className="absolute right-1 bottom-1 h-5 px-1.5 text-[10px]"
                    >
                      Similar
                    </Badge>
                  )}
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute top-1 right-1 size-6 bg-white/90 shadow-sm hover:bg-white"
                  title="Expand thumbnail"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(item);
                  }}
                >
                  <Expand className="size-3" />
                </Button>
              </div>

              <div className="mt-1.5 min-w-0 flex-1">
                <p className="truncate type-caption font-medium text-[#171618]">{item.channel}</p>
                <p
                  className="mt-0.5 line-clamp-2 type-caption text-[#727578]"
                  title={item.title}
                >
                  {item.title}
                </p>
                <p className="mt-0.5 type-caption text-[#727578]">{formatViews(item.viewCount)}</p>
              </div>

              {hasComment && (isLiked || isDisliked) && (
                <button
                  type="button"
                  onClick={() => onEditFeedback(item)}
                  className="mt-1.5 flex items-start gap-1 rounded-[6px] bg-[#f7f7f7] px-1.5 py-1 text-left type-caption text-[#727578] hover:bg-[#efefef]"
                >
                  <MessageSquareText className="mt-0.5 size-3 shrink-0 text-[#727578]" />
                  <span className="line-clamp-1">{fb.comment}</span>
                </button>
              )}

              <div className="mt-1.5 grid grid-cols-3 gap-1">
                <Button
                  variant={isLiked ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-full px-1 text-[10px]"
                  onClick={() => onLike(item)}
                >
                  <ThumbsUp className="size-3" />
                </Button>
                <Button
                  variant={isDisliked ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 w-full px-1 text-[10px]"
                  onClick={() => onDislike(item)}
                >
                  <ThumbsDown className="size-3" />
                </Button>
                <Button
                  variant={isLiked ? "outline" : "ghost"}
                  size="sm"
                  className="h-7 w-full px-1 text-[10px]"
                  disabled={exploring}
                  onClick={() => onExplore(item)}
                  title={isLiked ? "Find similar" : "Like + find similar"}
                >
                  <Compass className="size-3" />
                </Button>
              </div>
            </article>
          );
        })}
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
