"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { LoaderCircle } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  progress?: number;
};

export function StatusDialog({ open, title, message, progress }: Props) {
  // Don't mount modal chrome when closed — avoids stuck overlays blocking clicks
  if (!open) return null;

  const showProgress = typeof progress === "number" && progress > 0;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 rounded-[16px] border border-[#efefef] bg-white p-6 shadow-[var(--shadow-subtle-3)] sm:max-w-sm pointer-events-auto"
      >
        <DialogHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-[#f7f7f7]">
            <LoaderCircle className="size-6 animate-spin text-[#38296c]" />
          </div>
          <DialogTitle className="type-subheading text-[#171618]">{title}</DialogTitle>
          {message ? (
            <DialogDescription className="type-ui font-normal text-[#5c5e60]">
              {message}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {showProgress ? (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-center type-caption text-[#5c5e60]">{progress}%</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
