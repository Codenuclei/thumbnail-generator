"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Film, Link2, Loader2, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type FrameCandidate = {
  timestampSec: number;
  mimeType: string;
  data: string;
  previewUrl: string;
};

export type OpeningFrameClip = {
  id: string;
  name: string;
  status: "extracting" | "uploading" | "ready" | "error";
  mimeType: string;
  data: string;
  label: string;
  previewUrl: string;
  timestampSec?: number;
  bytesRead?: number;
  durationSec?: number;
  frameCount?: number;
  storageUrl?: string;
  storagePath?: string;
  frameStorageUrl?: string;
  candidates?: FrameCandidate[];
  geminiPickIndex?: number;
  geminiReason?: string;
  pickSource?: "gemini" | "heuristic";
};

type Props = {
  useOpeningFrames: boolean;
  onUseOpeningFramesChange: (v: boolean) => void;
  openingFrames: OpeningFrameClip[];
  onUpload: (file: File) => void;
  onYoutubeUrl: (url: string) => Promise<void> | void;
  onRemove: (id: string) => void;
  onSelectFrame: (clipId: string, timestampSec: number) => void;
  inputId?: string;
};

export function OpeningFramesPanel({
  useOpeningFrames,
  onUseOpeningFramesChange,
  openingFrames,
  onUpload,
  onYoutubeUrl,
  onRemove,
  onSelectFrame,
  inputId = "opening-video-upload",
}: Props) {
  const atLimit = openingFrames.length >= 2;
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [downloadingYt, setDownloadingYt] = useState(false);

  async function handleYoutubeSubmit() {
    const url = youtubeUrl.trim();
    if (!url || atLimit || downloadingYt) return;
    setDownloadingYt(true);
    try {
      await onYoutubeUrl(url);
      setYoutubeUrl("");
    } finally {
      setDownloadingYt(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-[#efefef] bg-white p-2.5">
        <Checkbox
          checked={useOpeningFrames}
          onCheckedChange={(v) => onUseOpeningFramesChange(v === true)}
          className="mt-0.5"
        />
        <span className="min-w-0">
          <span className="block type-ui text-[#171618]">Use full-video stills</span>
          <span className="mt-0.5 block type-caption text-[#727578]">
            YouTube links use yt-dlp on Railway (full download + ffmpeg samples + best-frame pick).
            No CDN thumbnail shortcuts.
          </span>
        </span>
      </label>

      {useOpeningFrames && (
        <div className="space-y-2 rounded-[12px] border border-dashed border-[#efefef] bg-[#f7f7f7] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="type-caption font-normal text-[#727578]">Source videos</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 type-caption"
              disabled={atLimit || downloadingYt}
              onClick={() => document.getElementById(inputId)?.click()}
            >
              <Film className="size-3" />
              Upload video
            </Button>
            <input
              id={inputId}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (!files?.length) return;
                Array.from(files).forEach((file) => onUpload(file));
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex gap-2">
            <Input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=… or youtu.be/…"
              className="h-8 type-caption"
              disabled={atLimit || downloadingYt}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleYoutubeSubmit();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-2.5 type-caption"
              disabled={atLimit || downloadingYt || !youtubeUrl.trim()}
              onClick={() => void handleYoutubeSubmit()}
            >
              {downloadingYt ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Link2 className="size-3" />
              )}
              Fetch
            </Button>
          </div>

          {openingFrames.length === 0 ? (
            <p className="type-caption text-[#727578]">
              Add 1–2 sources: upload a video, or paste a YouTube link.
            </p>
          ) : (
            <div className="space-y-2">
              {openingFrames.map((clip) => (
                <div key={clip.id} className="rounded-[8px] border border-[#efefef] bg-white p-2">
                  <div className="flex items-start gap-2">
                    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-[6px] border border-[#efefef]">
                      {clip.status === "extracting" || clip.status === "uploading" ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#f7f7f7]">
                          <Loader2 className="size-3.5 animate-spin text-[#727578]" />
                          <span className="type-caption text-[9px] text-[#727578]">
                            {clip.status === "uploading" ? "Storing…" : "Sampling…"}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={clip.previewUrl}
                          alt={clip.name}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate type-caption font-medium text-[#171618]">{clip.name}</p>
                      {(clip.status === "uploading" || clip.status === "extracting") && clip.label && (
                        <p className="mt-0.5 truncate type-caption text-[#727578]">{clip.label}</p>
                      )}
                      {clip.status === "ready" && clip.timestampSec != null && (
                        <p className="mt-0.5 type-caption text-[#727578]">
                          @{clip.timestampSec}s
                          {clip.durationSec ? ` / ${Math.round(clip.durationSec)}s` : ""}
                          {clip.frameCount ? ` · ${clip.frameCount} samples` : ""}
                          {clip.pickSource === "gemini" && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-[#38296c]">
                              <Sparkles className="size-2.5" /> Gemini
                            </span>
                          )}
                        </p>
                      )}
                      {clip.storageUrl && clip.status === "ready" && (
                        <p className="mt-0.5 truncate type-caption text-[#004d60]">
                          Stored on Cohesivity
                        </p>
                      )}
                      {clip.geminiReason && clip.status === "ready" && (
                        <p className="mt-0.5 line-clamp-2 type-caption text-[#727578]">
                          {clip.geminiReason}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemove(clip.id)}
                      disabled={clip.status === "extracting" || clip.status === "uploading"}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>

                  {clip.status === "ready" && clip.candidates && clip.candidates.length > 1 && (
                    <div className="mt-2 space-y-1 border-t border-[#f0f0f0] pt-2">
                      <p className="type-caption text-[#727578]">Pick frame (full video)</p>
                      <div className="flex gap-1 overflow-x-auto pb-0.5">
                        {clip.candidates.map((c) => {
                          const active = clip.timestampSec === c.timestampSec;
                          const isAiPick =
                            clip.geminiPickIndex != null &&
                            clip.candidates?.[clip.geminiPickIndex]?.timestampSec ===
                              c.timestampSec;
                          return (
                            <button
                              key={c.timestampSec}
                              type="button"
                              title={`${c.timestampSec}s`}
                              onClick={() => onSelectFrame(clip.id, c.timestampSec)}
                              className={cn(
                                "relative shrink-0 overflow-hidden rounded-[4px] border-2",
                                active ? "border-[#171618]" : "border-transparent hover:border-[#ccc]"
                              )}
                            >
                              <img
                                src={c.previewUrl}
                                alt={`${c.timestampSec}s`}
                                className="h-9 w-14 object-cover"
                              />
                              <span className="absolute inset-x-0 bottom-0 bg-black/60 py-px text-center text-[9px] text-white">
                                {c.timestampSec}s
                              </span>
                              {isAiPick && !active && (
                                <Badge className="absolute top-0 right-0 h-3.5 px-0.5 text-[8px]">
                                  AI
                                </Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
