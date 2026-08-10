"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderKanban, Link2, Share2, Trash2, Clock, Pencil } from "lucide-react";
import {
  projectDisplayName,
  renameHistorySession,
  type StudioSession,
} from "@/lib/studio-history";
import { publicShareUrl } from "@/lib/share-slug";
import { toast } from "sonner";

type Props = {
  history: StudioSession[];
  onLoad: (session: StudioSession) => void;
  onDelete: (id: string) => void;
  onShare: () => Promise<void>;
  onShareSession: (session: StudioSession) => Promise<void>;
  onSave: () => void;
  onHistoryChange?: () => void;
};

export function HistoryMenu({
  history,
  onLoad,
  onDelete,
  onShare,
  onShareSession,
  onSave,
  onHistoryChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={onSave}>
        <Clock className="size-3.5" />
        Save project
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
        <FolderKanban className="size-3.5" />
        Projects
        {history.length > 0 && (
          <span className="ml-1 rounded-full bg-[#171618] px-1.5 py-0.5 type-caption text-white">
            {history.length}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Projects</DialogTitle>
          </DialogHeader>
          <p className="type-caption text-[#5c5e60]">
            Previous thumbnails and studio data you&apos;ve worked on. Open one to continue.
          </p>
          {history.length === 0 ? (
            <p className="type-ui font-normal text-[#5c5e60]">
              No projects yet. Hit Save project or generate a thumbnail — we auto-save after each
              run.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((session) => {
                const name = projectDisplayName(session);
                const thumbs = session.generatedVariants || [];
                return (
                  <div
                    key={session.id}
                    className="rounded-[12px] border border-[#efefef] p-3"
                  >
                    <div className="flex gap-3">
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
                        {renamingId === session.id ? (
                          <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              renameHistorySession(session.id, renameValue);
                              setRenamingId(null);
                              onHistoryChange?.();
                              toast.success("Project renamed");
                            }}
                          >
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="h-8"
                              autoFocus
                            />
                            <Button type="submit" size="sm">
                              Save
                            </Button>
                          </form>
                        ) : (
                          <p className="line-clamp-2 type-ui text-[#171618]">{name}</p>
                        )}
                        <p className="mt-1 type-caption text-[#5c5e60]">
                          {new Date(session.updatedAt).toLocaleString()}
                          {thumbs.length ? ` · ${thumbs.length} thumbs` : ""}
                          {session.directions?.length
                            ? ` · ${session.directions.length} directions`
                            : ""}
                          {session.shareSlug ? ` · /s/${session.shareSlug}` : ""}
                        </p>
                        {thumbs.length > 1 ? (
                          <div className="mt-2 flex gap-1 overflow-x-auto">
                            {thumbs.slice(0, 6).map((v) => (
                              <img
                                key={v.id}
                                src={v.image}
                                alt=""
                                className="h-10 w-[72px] shrink-0 rounded object-cover"
                              />
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              onLoad(session);
                              setOpen(false);
                            }}
                          >
                            Open
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRenamingId(session.id);
                              setRenameValue(name);
                            }}
                          >
                            <Pencil className="size-3.5" />
                            Rename
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void onShareSession(session)}
                          >
                            <Link2 className="size-3.5" />
                            Link
                          </Button>
                          {session.shareSlug ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  publicShareUrl(session.shareSlug!)
                                );
                                toast.success("Link copied");
                              }}
                            >
                              Copy URL
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => onDelete(session.id)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
