"use client";

import type { PipelineOverview } from "@/lib/pipeline-overview";
import type { VideoContentMapping } from "@/lib/video-mapping";
import { formatViews } from "@/lib/inspiration";
import { ThumbnailEditor, type EditorAsset } from "@/components/ThumbnailEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Link2,
} from "lucide-react";

type IterationEntry = {
  image: string;
  note: string;
  backend: string;
  index: number;
};

export type GeneratedVariant = {
  id: string;
  image: string;
  label: string;
  paletteId?: string;
  composition?: string;
};

type Props = {
  canvasTab: "overview" | "preview" | "edit";
  onTabChange: (tab: "overview" | "preview" | "edit") => void;
  pipeline: PipelineOverview | null;
  mappings: VideoContentMapping[];
  searchStatus: string;
  searchProgress: number;
  image: string | null;
  backend: string;
  loading: boolean;
  titleSuggestions: string[];
  searchingTitles: boolean;
  onSearchTitles: () => void;
  onPickTitle: (title: string) => void;
  iterationNote: string;
  onIterationNoteChange: (v: string) => void;
  onIterate: (assets: EditorAsset[]) => void;
  iterations: IterationEntry[];
  onPickIteration: (entry: IterationEntry) => void;
  onDownload: () => void;
  assets: EditorAsset[];
  onAssetsChange: (assets: EditorAsset[]) => void;
  generatedVariants?: GeneratedVariant[];
  onPickVariant?: (variant: GeneratedVariant) => void;
};

function Panel({
  title,
  action,
  children,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[16px] border border-[#e8e8e8] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-ui text-[#181925]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function GenerationCanvas({
  canvasTab,
  onTabChange,
  pipeline,
  mappings,
  searchStatus,
  searchProgress,
  image,
  backend,
  loading,
  titleSuggestions,
  searchingTitles,
  onSearchTitles,
  onPickTitle,
  iterationNote,
  onIterationNoteChange,
  onIterate,
  iterations,
  onPickIteration,
  onDownload,
  assets,
  onAssetsChange,
  generatedVariants = [],
  onPickVariant,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#e8e8e8] bg-white">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e8e8e8] px-5 py-4">
        <div className="min-w-0">
          <p className="type-ui text-[#181925]">Canvas</p>
          <p className="mt-0.5 type-caption text-[#999999]">Preview & iterate</p>
        </div>
        {image && (
          <Button size="sm" variant="outline" onClick={onDownload}>
            <Download className="size-4" />
            Download
          </Button>
        )}
      </div>

      <Tabs
        value={canvasTab}
        onValueChange={(v) => onTabChange(v as "overview" | "preview" | "edit")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 px-5">
          <TabsList variant="line" className="w-full grid grid-cols-3">
            <TabsTrigger value="overview">Pipeline</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="edit" disabled={!image}>
              Edit
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="overview"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <div className="h-full space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
            {(searchStatus || searchProgress > 0) && searchProgress < 100 && (
              <div className="space-y-3 rounded-[16px] border border-[#e8e8e8] bg-[#fafafa] p-4">
                <div className="flex items-center justify-between type-ui">
                  <span className="truncate text-[#181925]">
                    {searchStatus || "Searching…"}
                  </span>
                  <span className="text-[#999999]">{searchProgress}%</span>
                </div>
                <Progress value={searchProgress} className="h-1.5" />
              </div>
            )}

            {!pipeline ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[16px] border border-[#e8e8e8] bg-[#fafafa] px-8 text-center">
                <p className="type-ui text-[#181925]">Your pipeline will appear here</p>
                <p className="mt-2 max-w-sm type-ui font-normal text-[#666666]">
                  Research a topic to stream references, title ideas, and opening mappings.
                </p>
              </div>
            ) : (
              <>
                <Panel title="Pipeline summary">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <p className="type-caption text-[#999999]">Topic</p>
                      <p className="mt-1 type-ui text-[#181925] line-clamp-2">
                        {pipeline.topic}
                      </p>
                    </div>
                    <div>
                      <p className="type-caption text-[#999999]">Hook</p>
                      <p className="mt-1 type-ui text-[#181925] truncate">
                        {pipeline.hook || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="type-caption text-[#999999]">Selected</p>
                      <p className="mt-1 type-ui text-[#181925]">
                        {pipeline.selectedCount} references
                      </p>
                    </div>
                    <div className="flex items-end gap-5 type-ui">
                      <span className="inline-flex items-center gap-1.5 text-[#33c758]">
                        <ThumbsUp className="size-3.5" />
                        {pipeline.liked.length}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[#666666]">
                        <ThumbsDown className="size-3.5" />
                        {pipeline.disliked.length}
                      </span>
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="Title suggestions"
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onSearchTitles}
                      disabled={searchingTitles}
                    >
                      <RefreshCw
                        className={`size-3.5 ${searchingTitles ? "animate-spin" : ""}`}
                      />
                      From feedback
                    </Button>
                  }
                >
                  {titleSuggestions.length === 0 ? (
                    <p className="type-ui font-normal text-[#666666]">
                      Like references, then refresh titles from your feedback.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {titleSuggestions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="rounded-[9999px] border border-[#e8e8e8] bg-white px-4 py-2 text-left type-ui font-normal text-[#181925] transition-colors hover:border-[#918df6]"
                          onClick={() => onPickTitle(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>

                {mappings.length > 0 && (
                  <Panel
                    title={
                      <span className="inline-flex items-center gap-2">
                        <Link2 className="size-3.5" />
                        Thumbnail ↔ title ↔ opening
                      </span>
                    }
                  >
                    <div className="space-y-3">
                      {mappings.map((m) => (
                        <div
                          key={m.videoId}
                          className="space-y-3 rounded-[16px] border border-[#e8e8e8] bg-[#fafafa] p-4"
                        >
                          <div className="flex gap-4">
                            <img
                              src={m.thumbnailUrl}
                              alt={m.title}
                              className="aspect-video w-[100px] shrink-0 rounded-[8px] object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="type-ui text-[#181925] line-clamp-2">{m.title}</p>
                              <p className="mt-1 type-caption text-[#999999]">
                                {m.channel} · {formatViews(m.viewCount)}
                              </p>
                              <Badge variant="outline" className="mt-2">
                                {m.transcriptSource === "captions"
                                  ? "First 2 min captions"
                                  : m.transcriptSource === "description"
                                    ? "Description fallback"
                                    : "No transcript"}
                              </Badge>
                            </div>
                          </div>
                          {m.openingScript ? (
                            <p className="type-ui font-normal leading-relaxed text-[#666666] line-clamp-4">
                              {m.openingScript}
                            </p>
                          ) : null}
                          <p className="type-caption font-medium text-[#2c78fc]">
                            {m.alignmentNote}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {pipeline.liked.length > 0 && (
                  <Panel title="Liked references">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {pipeline.liked.map((r) => (
                        <div
                          key={r.videoId}
                          className="overflow-hidden rounded-[8px] border border-[#e8e8e8] bg-white"
                        >
                          <img
                            src={r.thumbnailUrl}
                            alt={r.title}
                            className="aspect-video w-full object-cover"
                          />
                          {r.comment && (
                            <p className="p-2 type-caption text-[#666666] line-clamp-2">
                              {r.comment}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                <Panel title="Selected for generation">
                  {pipeline.references.filter((r) => r.selected).length === 0 ? (
                    <p className="type-ui font-normal text-[#666666]">
                      Select thumbnails from the research panel.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {pipeline.references
                        .filter((r) => r.selected)
                        .map((r) => (
                          <div
                            key={r.videoId}
                            className="relative overflow-hidden rounded-[8px] border border-[#e8e8e8] bg-white"
                          >
                            <img
                              src={r.thumbnailUrl}
                              alt={r.title}
                              className="aspect-video w-full object-cover"
                            />
                            {r.rating && (
                              <Badge
                                className="absolute top-2 right-2"
                                variant={r.rating === "like" ? "default" : "secondary"}
                              >
                                {r.rating}
                              </Badge>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </Panel>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="preview"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <div className="flex h-full min-h-0 flex-col gap-4 p-5">
            {generatedVariants.length > 1 ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                <p className="type-caption text-[#999999]">
                  {generatedVariants.length} combinations from liked refs — pick one to edit
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {generatedVariants.map((v) => {
                    const active = image === v.image;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onPickVariant?.(v)}
                        className={`overflow-hidden rounded-[12px] border text-left transition-colors ${
                          active
                            ? "border-[#181925] ring-1 ring-[#181925]"
                            : "border-[#e8e8e8] hover:border-[#999999]"
                        }`}
                      >
                        <img
                          src={v.image}
                          alt={v.label}
                          className="aspect-video w-full object-cover"
                        />
                        <span className="block truncate bg-[#fafafa] px-2 py-1.5 type-caption text-[#666666]">
                          {v.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {image && (
                  <div className="rounded-[12px] border border-[#e8e8e8] bg-[#fafafa] p-3">
                    <p className="mb-2 type-caption text-[#999999]">Selected</p>
                    <img
                      src={image}
                      alt="Selected thumbnail"
                      className="w-full rounded-[8px] object-contain"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-[16px] border border-[#e8e8e8] bg-[#fafafa] p-4">
                {loading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <p className="type-ui font-normal text-[#666666]">
                      Generating 3–4 combinations…
                    </p>
                  </div>
                )}
                {image ? (
                  <img
                    src={image}
                    alt="Generated thumbnail"
                    className="max-h-full max-w-full rounded-[8px] object-contain shadow-[var(--shadow-subtle-3)]"
                  />
                ) : (
                  <div className="p-8 text-center">
                    <p className="type-ui text-[#181925]">No preview yet</p>
                    <p className="mt-2 type-ui font-normal text-[#666666]">
                      Like refs → suggest colors → generate combinations
                    </p>
                  </div>
                )}
              </div>
            )}
            {backend && (
              <p className="shrink-0 truncate type-caption text-[#999999]">{backend}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="edit"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <div className="h-full overflow-y-auto overscroll-contain px-5 py-4">
            {image ? (
              <ThumbnailEditor
                image={image}
                iterationNote={iterationNote}
                onIterationNoteChange={onIterationNoteChange}
                onIterate={() => onIterate(assets)}
                loading={loading}
                assets={assets}
                onAssetsChange={onAssetsChange}
                iterations={iterations}
                onPickIteration={onPickIteration}
              />
            ) : (
              <p className="py-16 text-center type-ui font-normal text-[#666666]">
                Generate a thumbnail first, then edit here.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
