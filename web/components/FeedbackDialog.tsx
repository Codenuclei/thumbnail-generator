"use client";

import { useEffect, useState } from "react";
import type { InspirationVideo } from "@/lib/inspiration";
import { formatViews } from "@/lib/inspiration";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Compass, ThumbsDown, ThumbsUp } from "lucide-react";

export type FeedbackMode = "like" | "dislike" | "explore";

type Props = {
  open: boolean;
  mode: FeedbackMode | null;
  item: InspirationVideo | null;
  initialComment?: string;
  exploring?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (comment: string) => void;
  onExplore: (comment: string) => void;
};

const COPY: Record<
  FeedbackMode,
  { title: string; description: string; placeholder: string; confirm: string }
> = {
  like: {
    title: "What works here?",
    description: "Optional. Note composition, colors, or energy to keep. Like is already saved.",
    placeholder: "e.g. bold hook left, warm factory glow, face cutout pops…",
    confirm: "Save note",
  },
  dislike: {
    title: "What’s off?",
    description: "Optional. Tell the pipeline what to avoid. Dislike is already saved.",
    placeholder: "e.g. too cluttered, cheap stock look, wrong niche…",
    confirm: "Save note",
  },
  explore: {
    title: "Explore similar",
    description: "Add context so we search for more refs that match this like.",
    placeholder: "e.g. same industrial vibe, bigger text, darker contrast…",
    confirm: "Find similar",
  },
};

export function FeedbackDialog({
  open,
  mode,
  item,
  initialComment = "",
  exploring = false,
  onOpenChange,
  onSave,
  onExplore,
}: Props) {
  const [comment, setComment] = useState(initialComment);
  const activeMode = mode || "like";
  const copy = COPY[activeMode];

  useEffect(() => {
    if (open) setComment(initialComment);
  }, [open, initialComment, item?.videoId, mode]);

  function handleConfirm() {
    if (activeMode === "explore") onExplore(comment.trim());
    else onSave(comment.trim());
  }

  return (
    <Dialog open={open && Boolean(mode && item)} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-5 rounded-[20px] border border-[#efefef] bg-white p-6 shadow-[var(--shadow-subtle-3)] sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader className="gap-2 pr-8">
          <DialogTitle className="type-subheading text-[#171618]">{copy.title}</DialogTitle>
          <DialogDescription className="type-ui font-normal text-[#5c5e60]">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="flex gap-3 rounded-[12px] border border-[#efefef] bg-[#f7f7f7] p-3">
            <img
              src={item.thumbnailUrl}
              alt={item.title}
              className="aspect-video w-[112px] shrink-0 rounded-[8px] object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate type-ui text-[#171618]">{item.channel}</p>
              <p className="mt-0.5 line-clamp-2 type-ui font-normal text-[#5c5e60]">
                {item.title}
              </p>
              <p className="mt-1 type-caption text-[#5c5e60]">
                {formatViews(item.viewCount)}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="feedback-comment">Your notes</Label>
          <Textarea
            id="feedback-comment"
            className="min-h-[120px]"
            autoFocus
            placeholder={copy.placeholder}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={exploring}>
            {activeMode === "explore" ? "Cancel" : "Skip"}
          </Button>
          <Button onClick={handleConfirm} disabled={exploring}>
            {activeMode === "like" && <ThumbsUp className="size-4" />}
            {activeMode === "dislike" && <ThumbsDown className="size-4" />}
            {activeMode === "explore" && <Compass className="size-4" />}
            {exploring ? "Searching…" : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
