"use client";

import { useState, type ReactNode } from "react";
import {
  BrainCircuit,
  Captions,
  ImagePlus,
  Link2,
  Loader2,
  Palette,
  Sparkles,
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
          ? "No captions — filled script from video description"
          : "Transcript loaded into script"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transcript fetch failed");
    } finally {
      setFetchingTranscript(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[14px] border border-[#efefef] bg-[#f7f7f7] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-1.5 type-ui text-[#171618]">
            <BrainCircuit className="size-3.5 text-[#38296c]" />
            Media intelligence
          </h3>
          <p className="type-caption text-[#727578]">
            Photos + brief → Generate (Analyze optional)
          </p>
        </div>
        {result && (
          <Badge
            variant="outline"
            className={`font-normal ${confidenceClass(result.confidence.level)}`}
          >
            {result.confidence.level} · {result.confidence.score}%
          </Badge>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="media-youtube-url"
              className="inline-flex items-center gap-1 type-caption text-[#727578]"
            >
              <Link2 className="size-3" />
              YouTube URL
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
                <Loader2 className="size-3 animate-spin" />
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
            className="h-8 bg-white"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="media-photo-upload" className="type-caption text-[#727578]">
              Photos
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 type-caption"
              disabled={photos.length >= 4}
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
            <div className="flex gap-1.5 overflow-x-auto">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative h-12 w-16 shrink-0 overflow-hidden rounded-[6px] border border-[#efefef] bg-white"
                >
                  <img
                    src={photo.previewUrl}
                    alt={photo.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/65 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onRemovePhoto(photo.id)}
                    aria-label={`Remove ${photo.name}`}
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="type-caption text-[#727578]">Product / person / style refs for scratch generate</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="media-script" className="type-caption text-[#727578]">
            Creative brief / script
          </Label>
          <span className="type-caption text-[#727578]">
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
          placeholder="Describe the thumbnail you want, or paste script/outline… Used on Generate even without Analyze. Or Fetch transcript from the URL above."
        />
      </div>

      {openingFramesSlot}

      <Button
        type="button"
        className="h-9 w-full"
        onClick={onAnalyze}
        disabled={!canAnalyze || analyzing}
      >
        {analyzing ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {analysisProgress || "Reading media…"}
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" />
            Analyze media
          </>
        )}
      </Button>

      {result && (
        <div className="space-y-2.5 border-t border-[#efefef] pt-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="type-ui text-[#171618]">{result.recommendedTopic}</p>
              <Badge variant="outline" className="font-normal">
                {result.sourceSummary}
              </Badge>
            </div>
            <p className="mt-0.5 type-caption leading-snug text-[#727578]">{result.summary}</p>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-3">
            {[
              ["Foreground", result.depth.foreground],
              ["Midground", result.depth.midground],
              ["Background", result.depth.background],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[8px] border border-[#efefef] bg-white px-2 py-1.5">
                <p className="type-caption text-[#727578]">{label}</p>
                <p className="mt-0.5 type-caption text-[#171618] line-clamp-2">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Palette className="size-3 text-[#38296c]" />
              <p className="type-caption font-medium text-[#171618]">
                {result.colors.source === "measured"
                  ? "Colors from media"
                  : "Fallback colors"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {result.colors.dominant.map((color) => (
                <span
                  key={color}
                  className="size-5 rounded-full border border-[#d8d8d8]"
                  style={{ background: color }}
                  title={color}
                />
              ))}
              <span className="type-caption text-[#727578]">
                text {result.colors.text} · bg {result.colors.background}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="type-caption font-medium text-[#171618]">Thumbnail hooks</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {result.hooks.map((candidate) => {
                const active = selectedHook.trim().toUpperCase() === candidate.text;
                return (
                  <button
                    key={candidate.text}
                    type="button"
                    onClick={() => onSelectHook(candidate.text)}
                    className={`rounded-[8px] border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? "border-[#171618] bg-white ring-1 ring-[#171618]"
                        : "border-[#efefef] bg-white hover:border-[#727578]"
                    }`}
                  >
                    <span className="block type-caption font-medium text-[#171618]">
                      {candidate.text}
                    </span>
                    <span className="mt-0.5 block type-caption text-[#727578] line-clamp-2">
                      {candidate.rationale}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {result.confidence.limitations.length > 0 && (
            <div className="rounded-[8px] border border-[#f0dfac] bg-[#fff9e8] px-2.5 py-2">
              <p className="type-caption text-[#8b6b12]">
                {result.confidence.limitations.join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
