"use client";

import { useState, type ReactNode } from "react";
import {
  Captions,
  ImagePlus,
  Link2,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readJsonResponse } from "@/lib/safe-json";
import type {
  PersistedMediaPhoto,
  VideoIntelligenceResult,
} from "@/lib/video-intelligence-types";

type Props = {
  youtubeUrl: string;
  onYoutubeUrlChange: (value: string) => void;
  script: string;
  onScriptChange: (value: string) => void;
  photos: PersistedMediaPhoto[];
  onUploadPhotos: (files: File[]) => void;
  onRemovePhoto: (id: string) => void;
  openingFramesSlot: ReactNode;
  analyzing: boolean;
  analysisProgress?: string;
  result: VideoIntelligenceResult | null;
  selectedHook: string;
  onSelectHook: (value: string) => void;
  onAnalyze: () => void;
  canAnalyze: boolean;
};

function confidenceClass(level: VideoIntelligenceResult["confidence"]["level"]): string {
  if (level === "high") return "border-[#b9e9c5] bg-[#effaf2] text-[#21813a]";
  if (level === "medium") return "border-[#f0dfac] bg-[#fff9e8] text-[#8b6b12]";
  return "border-[#f0d1d1] bg-[#fff5f5] text-[#a53d3d]";
}

export function MediaIntelligencePanel({
  youtubeUrl,
  onYoutubeUrlChange,
  script,
  onScriptChange,
  photos,
  onUploadPhotos,
  onRemovePhoto,
  openingFramesSlot,
  analyzing,
  analysisProgress,
  result,
  selectedHook,
  onSelectHook,
  onAnalyze,
  canAnalyze,
}: Props) {
  const [fetchingTranscript, setFetchingTranscript] = useState(false);
  const [transcriptMeta, setTranscriptMeta] = useState<string | null>(null);

  async function handleFetchTranscript() {
    const url = youtubeUrl.trim();
    if (!url) {
      toast.error("Paste a YouTube URL first");
      return;
    }
    if (script.trim()) {
      const ok = window.confirm("Replace the current script with the fetched transcript?");
      if (!ok) return;
    }

    setFetchingTranscript(true);
    try {
      const res = await fetch("/api/youtube/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await readJsonResponse<{
        error?: string;
        transcript?: string;
        source?: string;
        title?: string;
        characters?: number;
      }>(res);
      if (!res.ok || !data.transcript) {
        throw new Error(data.error || "Could not fetch transcript");
      }
      onScriptChange(data.transcript);
      const sourceLabel =
        data.source === "captions"
          ? "captions"
          : data.source === "description"
            ? "description fallback"
            : data.source || "transcript";
      setTranscriptMeta(
        `${(data.characters || data.transcript.length).toLocaleString()} chars · ${sourceLabel}${
          data.title ? ` · ${data.title}` : ""
        }`
      );
      toast.success(
        data.source === "description"
          ? "No captions found. Filled script from video description"
          : "Transcript loaded into script"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transcript fetch failed");
    } finally {
      setFetchingTranscript(false);
    }
  }

  return (
    <section className="space-y-4">
      {result ? (
        <div className="flex justify-end">
          <Badge
            variant="outline"
            className={`font-normal ${confidenceClass(result.confidence.level)}`}
          >
            {result.confidence.level} · {result.confidence.score}%
          </Badge>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="media-youtube-url"
              className="inline-flex items-center gap-1 type-caption font-normal text-[#5c5e60]"
            >
              <Link2 className="size-3" />
              YouTube URL{" "}
              <span className="text-[var(--text-tertiary)]">optional</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 type-caption"
              disabled={!youtubeUrl.trim() || fetchingTranscript}
              onClick={() => void handleFetchTranscript()}
            >
              {fetchingTranscript ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <Captions className="size-3" />
              )}
              Fetch transcript
            </Button>
          </div>
          <Input
            id="media-youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(event) => {
              onYoutubeUrlChange(event.target.value);
              setTranscriptMeta(null);
            }}
            placeholder="https://youtube.com/watch?v=…"
            className="h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="media-photo-upload"
              className="type-caption font-normal text-[#5c5e60]"
            >
              Reference photos{" "}
              <span className="text-[var(--text-tertiary)]">optional, up to 12</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 type-caption"
              disabled={photos.length >= 12}
              onClick={() => document.getElementById("media-photo-upload")?.click()}
            >
              <ImagePlus className="size-3" />
              Add
            </Button>
            <input
              id="media-photo-upload"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                if (files.length) onUploadPhotos(files);
                event.target.value = "";
              }}
            />
          </div>
          {photos.length ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-[8px] border border-[#efefef] bg-[#f7f7f7]"
                >
                  <img
                    src={photo.previewUrl}
                    alt={photo.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 rounded-full bg-[#171618]/75 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onRemovePhoto(photo.id)}
                    aria-label={`Remove ${photo.name}`}
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="type-caption leading-snug text-[#5c5e60]">
              One photo is enough: a face, a product, or a backdrop. Not the whole thumbnail.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="media-script"
              className="type-caption font-normal text-[#5c5e60]"
            >
              Brief or script{" "}
              <span className="text-[var(--text-tertiary)]">optional</span>
            </Label>
            <span className="type-caption tabular-nums text-[var(--text-tertiary)]">
              {transcriptMeta || `${script.trim().length.toLocaleString()} chars`}
            </span>
          </div>
          <Textarea
            id="media-script"
            value={script}
            onChange={(event) => {
              onScriptChange(event.target.value);
              setTranscriptMeta(null);
            }}
            rows={3}
            className="min-h-[72px] resize-y bg-white type-caption"
            placeholder="Mood, subject, or story. Or paste a script."
          />
        </div>

        {openingFramesSlot}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#efefef] pt-3">
          <p className="type-caption text-[#5c5e60]">
            Analyze reads media for hooks and colors. Skip if you just want to generate.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={onAnalyze}
            disabled={!canAnalyze || analyzing}
          >
            {analyzing ? (
              <>
                <LoaderCircle className="size-3.5 animate-spin" />
                {analysisProgress || "Reading media…"}
              </>
            ) : (
              "Analyze media"
            )}
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-3 border-t border-[#efefef] pt-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="type-ui text-[#171618]">{result.recommendedTopic}</p>
              <Badge variant="outline" className="font-normal">
                {result.sourceSummary}
              </Badge>
            </div>
            <p className="mt-0.5 type-caption leading-snug text-[#5c5e60]">{result.summary}</p>
          </div>

          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
            {[
              ["Foreground", result.depth.foreground],
              ["Midground", result.depth.midground],
              ["Background", result.depth.background],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="type-caption text-[#5c5e60]">{label}</p>
                <p className="mt-0.5 type-caption text-[#171618] line-clamp-2">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="type-caption font-medium text-[#171618]">
              {result.colors.source === "measured"
                ? "Colors from media"
                : "Suggested colors"}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {result.colors.dominant.map((color) => (
                <span
                  key={color}
                  className="size-5 rounded-full border border-[#d8d8d8]"
                  style={{ background: color }}
                  title={color}
                />
              ))}
              <span className="type-caption text-[#5c5e60]">
                text {result.colors.text} · bg {result.colors.background}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="type-caption font-medium text-[#171618]">Thumbnail hooks</p>
            <div className="flex flex-wrap gap-1.5">
              {result.hooks.map((candidate) => {
                const active = selectedHook.trim().toUpperCase() === candidate.text;
                return (
                  <button
                    key={candidate.text}
                    type="button"
                    title={candidate.rationale}
                    onClick={() => onSelectHook(candidate.text)}
                    className={`rounded-[9999px] border px-3 py-1.5 type-caption transition-colors ${
                      active
                        ? "border-[#171618] bg-[#171618] text-white"
                        : "border-[#efefef] bg-white text-[#5c5e60] hover:border-[#727578] hover:text-[#171618]"
                    }`}
                  >
                    {candidate.text}
                  </button>
                );
              })}
            </div>
          </div>

          {result.confidence.limitations.length > 0 && (
            <p className="type-caption text-[#8b6b12]">
              {result.confidence.limitations.join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
