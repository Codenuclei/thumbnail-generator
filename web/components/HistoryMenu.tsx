"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { History, Link2, Share2, Trash2, Clock } from "lucide-react";
import type { StudioSession } from "@/lib/studio-history";
import { publicShareUrl } from "@/lib/share-slug";
import { toast } from "sonner";

type Props = {
  history: StudioSession[];
  onLoad: (session: StudioSession) => void;
  onDelete: (id: string) => void;
  onShare: () => Promise<void>;
  onShareSession: (session: StudioSession) => Promise<void>;
  onSave: () => void;
};

export function HistoryMenu({
  history,
  onLoad,
  onDelete,
  onShare,
  onShareSession,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={onSave}>
        <Clock className="size-3.5" />
        Save
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void onShare();
        }}
      >
        <Share2 className="size-3.5" />
        Share
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="size-3.5" />
        History
        {history.length > 0 && (
          <span className="ml-1 rounded-full bg-[#171618] px-1.5 py-0.5 type-caption text-white">
            {history.length}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Saved sessions</DialogTitle>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="type-ui font-normal text-[#727578]">
              No saved sessions yet. Hit Save or generate a thumbnail — we auto-save after each run.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((session) => (
                <div
                  key={session.id}
                  className="flex gap-3 rounded-[12px] border border-[#efefef] p-3"
                >
                  {session.image ? (
                    <img
                      src={session.image}
                      alt=""
                      className="size-16 shrink-0 rounded-[8px] object-cover"
                    />
                  ) : (
                    <div className="size-16 shrink-0 rounded-[8px] bg-[#f7f7f7]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 type-ui text-[#171618]">
                      {session.topic || "Untitled"}
                    </p>
                    <p className="mt-1 type-caption text-[#727578]">
                      {new Date(session.updatedAt).toLocaleString()}
                      {session.shareSlug ? ` · /s/${session.shareSlug}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onLoad(session);
                          setOpen(false);
                          toast.success("Session restored");
                        }}
                      >
                        Load
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void (async () => {
                            if (session.shareSlug) {
                              await navigator.clipboard.writeText(
                                publicShareUrl(session.shareSlug)
                              );
                              toast.success(`Copied /s/${session.shareSlug}`);
                              return;
                            }
                            await onShareSession(session);
                          })();
                        }}
                      >
                        <Link2 className="size-3.5" />
                        {session.shareSlug ? "Copy link" : "Make link"}
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onDelete(session.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
