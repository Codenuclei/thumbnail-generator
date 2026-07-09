"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  progress?: number;
};

export function StatusDialog({ open, title, message, progress }: Props) {
  const showProgress = typeof progress === "number" && progress > 0;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 rounded-[16px] border border-[#e8e8e8] bg-white p-6 shadow-[var(--shadow-subtle-3)] sm:max-w-sm pointer-events-auto"
      >
        <DialogHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-[#f5f5f5]">
            <Loader2 className="size-6 animate-spin text-[#918df6]" />
          </div>
          <DialogTitle className="type-subheading text-[#181925]">{title}</DialogTitle>
          {message ? (
            <DialogDescription className="type-ui font-normal text-[#666666]">
              {message}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {showProgress ? (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-center type-caption text-[#999999]">{progress}%</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
