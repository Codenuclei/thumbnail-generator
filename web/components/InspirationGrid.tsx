"use client";

import type { InspirationVideo } from "@/lib/inspiration";
import { formatViews } from "@/lib/inspiration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Compass, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react";

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
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
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
              "flex flex-col rounded-[16px] border border-[#e8e8e8] bg-white p-3 transition-colors",
              selected && "border-[#181925]",
              isLiked && !selected && "border-[#33c758]/50 bg-[#def6e4]/30",
              isDisliked && "opacity-55"
            )}
          >
            <button
              type="button"
              className="relative w-full overflow-hidden rounded-[8px] border border-[#e8e8e8]"
              onClick={() => onToggle(item.videoId)}
            >
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                className="aspect-video w-full object-cover"
              />
              {selected && (
                <span className="absolute top-2 left-2 rounded-full bg-[#181925] p-1 text-white">
                  <Check className="size-3.5" />
                </span>
              )}
              {item.similarTo && (
                <Badge variant="secondary" className="absolute right-2 bottom-2">
                  Similar
                </Badge>
              )}
            </button>

            <div className="mt-3 min-w-0 flex-1">
              <p className="truncate type-ui text-[#181925]">{item.channel}</p>
              <p className="mt-0.5 line-clamp-2 type-ui font-normal text-[#666666]" title={item.title}>
                {item.title}
              </p>
              <p className="mt-1 type-caption text-[#999999]">{formatViews(item.viewCount)}</p>
            </div>

            {(isLiked || isDisliked) && hasComment && (
              <button
                type="button"
                onClick={() => onEditFeedback(item)}
                className="mt-2 flex items-start gap-1.5 rounded-[8px] bg-[#fafafa] px-2.5 py-2 text-left type-caption text-[#666666] hover:bg-[#f5f5f5]"
              >
                <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-[#999999]" />
                <span className="line-clamp-2">{fb.comment}</span>
              </button>
            )}

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <Button
                variant={isLiked ? "default" : "outline"}
                size="sm"
                className="w-full px-2"
                onClick={() => onLike(item)}
              >
                <ThumbsUp className="size-3.5" />
                Like
              </Button>
              <Button
                variant={isDisliked ? "secondary" : "outline"}
                size="sm"
                className="w-full px-2"
                onClick={() => onDislike(item)}
              >
                <ThumbsDown className="size-3.5" />
                Dislike
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full px-2"
                disabled={!isLiked || exploring}
                onClick={() => onExplore(item)}
              >
                <Compass className="size-3.5" />
                Explore
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
