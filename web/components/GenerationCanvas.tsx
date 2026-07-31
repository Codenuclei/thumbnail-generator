"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { PipelineOverview } from "@/lib/pipeline-overview";
import type { VideoContentMapping } from "@/lib/video-mapping";
import { formatViews } from "@/lib/inspiration";
import { ThumbnailEditor, type EditorAsset } from "@/components/ThumbnailEditor";
import type { EditorHistory } from "@/lib/editor-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Package,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Link2,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
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
  suggestedTitle?: string;
  paletteId?: string;
  paletteName?: string;
  composition?: string;
  compositionLabel?: string;
  cameraFilter?: string;
  cameraFilterLabel?: string;
  compositionFactor?: string;
  compositionFactorLabel?: string;
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
  onExportDesignPack?: () => void;
  exportingDesignPack?: boolean;
  assets: EditorAsset[];
  onAssetsChange: (assets: EditorAsset[]) => void;
  hook?: string;
  editorHistory: EditorHistory;
  onEditorHistoryChange: (history: EditorHistory) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  generatedVariants?: GeneratedVariant[];
  onPickVariant?: (variant: GeneratedVariant) => void;
  onGenerateSimilar?: (variant: GeneratedVariant) => void;
  generatingSimilarId?: string | null;
  /** Ratings for generated variants (like / dislike → dry.md learning). */
  variantRatings?: Record<string, "like" | "dislike" | null>;
  onRateVariant?: (variant: GeneratedVariant, rating: "like" | "dislike") => void;
  paletteColors?: string[];
  paletteName?: string;
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
    <section className="space-y-4 rounded-[20px] border border-[#efefef] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-ui text-[#171618]">{title}</h3>
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
  onExportDesignPack,
  exportingDesignPack = false,
  assets,
  onAssetsChange,
  hook = "",
  editorHistory,
  onEditorHistoryChange,
  selectedLayerId,
  onSelectLayer,
  generatedVariants = [],
  onPickVariant,
  onGenerateSimilar,
  generatingSimilarId = null,
  variantRatings = {},
  onRateVariant,
  paletteColors = [],
  paletteName,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [expanded]);

  const variantCard = (v: GeneratedVariant) => {
    const active = image === v.image;
    const title = v.suggestedTitle || v.label;
    const similarBusy = generatingSimilarId === v.id;
    const rating = variantRatings[v.id];
    return (
      <div
        key={v.id}
        className={`flex flex-col overflow-hidden rounded-[20px] border text-left transition-colors ${
          active
            ? "border-[#171618] ring-1 ring-[#171618]"
            : "border-[#efefef] hover:border-[#727578]"
        }`}
      >
        <button
          type="button"
          onClick={() => onPickVariant?.(v)}
          className="flex flex-col text-left"
        >
          <img
            src={v.image}
            alt={title}
            className="aspect-video w-full object-cover"
          />
          <div className="space-y-2 bg-[#f7f7f7] p-2.5">
            <p className="line-clamp-2 type-ui text-[#171618]">{title}</p>
            <div className="flex flex-wrap gap-1">
              {v.cameraFilterLabel && (
                <Badge variant="outline" className="type-caption font-normal">
                  {v.cameraFilterLabel}
                </Badge>
              )}
              {v.compositionFactorLabel && (
                <Badge variant="secondary" className="type-caption font-normal">
                  {v.compositionFactorLabel}
                </Badge>
              )}
              {v.compositionLabel && (
                <Badge variant="outline" className="type-caption font-normal text-[#5c5e60]">
                  {v.compositionLabel}
                </Badge>
              )}
              {v.paletteName && (
                <Badge variant="outline" className="type-caption font-normal text-[#38296c]">
                  {v.paletteName}
                </Badge>
              )}
            </div>
          </div>
        </button>
        <div className="flex gap-1.5 border-t border-[#efefef] bg-white px-2.5 py-2">
          {onRateVariant && (
            <>
              <Button
                type="button"
                size="sm"
                variant={rating === "like" ? "default" : "outline"}
                className="flex-1 rounded-[var(--radius-buttons)]"
                disabled={loading}
                onClick={() => onRateVariant(v, "like")}
                aria-label="Like variant"
              >
                <ThumbsUp className="size-3.5" />
                Like
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rating === "dislike" ? "secondary" : "outline"}
                className="flex-1 rounded-[var(--radius-buttons)]"
                disabled={loading}
                onClick={() => onRateVariant(v, "dislike")}
                aria-label="Dislike variant"
              >
                <ThumbsDown className="size-3.5" />
                Dislike
              </Button>
            </>
          )}
          {onGenerateSimilar && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 rounded-[var(--radius-buttons)]"
              disabled={loading || similarBusy}
              onClick={() => onGenerateSimilar(v)}
            >
              <Sparkles className={`size-3.5 ${similarBusy ? "animate-spin" : ""}`} />
              {similarBusy ? "…" : "Similar"}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const shell = (
    <div
      className={
        expanded
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
          : "flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border-0 bg-white shadow-[var(--shadow-md)]"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#efefef] px-5 py-4">
        <div className="min-w-0">
          <p className="type-ui text-[#171618]">Canvas</p>
          <p className="mt-0.5 type-caption text-[#5c5e60]">Preview & iterate</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Exit expanded view" : "Expand canvas"}
            title={expanded ? "Exit expanded view" : "Expand"}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          {image && (
            <>
              <Button size="sm" variant="outline" onClick={onDownload}>
                <Download className="size-4" />
                Download
              </Button>
              {onExportDesignPack && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onExportDesignPack}
                  disabled={exportingDesignPack}
                >
                  <Package className="size-4" />
                  {exportingDesignPack ? "Exporting…" : "Design pack"}
                </Button>
              )}
            </>
          )}
          {expanded && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setExpanded(false)}
              aria-label="Close expanded canvas"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
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
          <div className="h-full space-y-4 overflow-y-auto overscroll-contain scrollbar-none px-5 py-4">
            {(searchStatus || searchProgress > 0) && searchProgress < 100 && (
              <div className="space-y-3 rounded-[20px] border border-[#efefef] bg-[#f7f7f7] p-4">
                <div className="flex items-center justify-between type-ui">
                  <span className="truncate text-[#171618]">
                    {searchStatus || "Searching…"}
                  </span>
                  <span className="text-[#5c5e60]">{searchProgress}%</span>
                </div>
                <Progress value={searchProgress} className="h-1.5" />
              </div>
            )}

            {!pipeline ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border border-[#efefef] bg-[#f7f7f7] px-8 text-center">
                <p className="type-ui text-[#171618]">Your pipeline will appear here</p>
                <p className="mt-2 max-w-sm type-ui font-normal text-[#5c5e60]">
                  Research a topic to stream references, title ideas, and opening mappings.
                </p>
              </div>
            ) : (
              <>
                <Panel title="Pipeline summary">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <p className="type-caption text-[#5c5e60]">Topic</p>
                      <p className="mt-1 type-ui text-[#171618] line-clamp-2">
                        {pipeline.topic}
                      </p>
                    </div>
                    <div>
                      <p className="type-caption text-[#5c5e60]">Hook</p>
                      <p className="mt-1 type-ui text-[#171618] truncate">
                        {pipeline.hook || "None"}
                      </p>
                    </div>
                    <div>
                      <p className="type-caption text-[#5c5e60]">Selected</p>
                      <p className="mt-1 type-ui text-[#171618]">
                        {pipeline.selectedCount} references
                      </p>
                    </div>
                    <div className="flex items-end gap-5 type-ui">
                      <span className="inline-flex items-center gap-1.5 text-[#004d60]">
                        <ThumbsUp className="size-3.5" />
                        {pipeline.liked.length}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[#5c5e60]">
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
                    <p className="type-ui font-normal text-[#5c5e60]">
                      Like references, then refresh titles from your feedback.
                    </p>
                  ) : (
                    <div className="flex min-w-0 flex-wrap gap-2">
                      {titleSuggestions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="max-w-full rounded-[12px] border border-[#efefef] bg-white px-3 py-2 text-left type-ui font-normal break-words text-[#171618] transition-colors hover:border-[#38296c]"
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
                          className="space-y-3 rounded-[20px] border border-[#efefef] bg-[#f7f7f7] p-4"
                        >
                          <div className="flex gap-4">
                            <img
                              src={m.thumbnailUrl}
                              alt={m.title}
                              className="aspect-video w-[100px] shrink-0 rounded-[8px] object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="type-ui text-[#171618] line-clamp-2">{m.title}</p>
                              <p className="mt-1 type-caption text-[#5c5e60]">
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
                            <p className="type-ui font-normal leading-relaxed text-[#5c5e60] line-clamp-4">
                              {m.openingScript}
                            </p>
                          ) : null}
                          <p className="type-caption font-medium text-[#004d60]">
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
                          className="overflow-hidden rounded-[8px] border border-[#efefef] bg-white"
                        >
                          <img
                            src={r.thumbnailUrl}
                            alt={r.title}
                            className="aspect-video w-full object-cover"
                          />
                          {r.comment && (
                            <p className="p-2 type-caption text-[#5c5e60] line-clamp-2">
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
                    <p className="type-ui font-normal text-[#5c5e60]">
                      Select thumbnails from the research panel.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {pipeline.references
                        .filter((r) => r.selected)
                        .map((r) => (
                          <div
                            key={r.videoId}
                            className="relative overflow-hidden rounded-[8px] border border-[#efefef] bg-white"
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
            {generatedVariants.length > 0 ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-none">
                <p className="type-caption text-[#5c5e60]">
                  {generatedVariants.length} of 4 combinations. Each uses a different camera look,
                  type treatment, and framing rule
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {generatedVariants.map((v, i) => (
                    <div
                      key={v.id}
                      className="stagger-item"
                      style={{ "--stagger-index": i } as CSSProperties}
                    >
                      {variantCard(v)}
                    </div>
                  ))}
                  {loading &&
                    Array.from({ length: Math.max(0, 4 - generatedVariants.length) }).map(
                      (_, i) => (
                        <div
                          key={`skel-${i}`}
                          className="overflow-hidden rounded-[20px] border border-[#efefef] bg-[#f7f7f7]"
                        >
                          <Skeleton className="aspect-video w-full rounded-none" />
                          <div className="space-y-2 p-2.5">
                            <Skeleton className="h-4 w-3/4" />
                            <div className="flex gap-1">
                              <Skeleton className="h-5 w-16 rounded-full" />
                              <Skeleton className="h-5 w-20 rounded-full" />
                            </div>
                          </div>
                        </div>
                      )
                    )}
                </div>
              </div>
            ) : (
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-[20px] border border-[#efefef] bg-[#f7f7f7] p-4">
                {loading && (
                  <div className="absolute inset-0 z-10 flex flex-col gap-3 bg-white/90 p-4">
                    <p className="shrink-0 type-ui font-normal text-[#5c5e60]">
                      Generating 3-4 combinations…
                    </p>
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={`preview-skel-${i}`}
                          className="overflow-hidden rounded-[20px] border border-[#efefef] bg-[#f7f7f7]"
                        >
                          <Skeleton className="aspect-video w-full rounded-none" />
                          <div className="space-y-2 p-2.5">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {image ? (
                  <img
                    src={image}
                    alt="Generated thumbnail"
                    className="reveal-unblur max-h-full max-w-full rounded-[8px] object-contain shadow-[var(--shadow-subtle-3)]"
                  />
                ) : (
                  <div className="p-8 text-center">
                    <p className="type-ui text-[#171618]">No preview yet</p>
                    <p className="mt-2 type-ui font-normal text-[#5c5e60]">
                      Like a few references, suggest colors, then generate combinations.
                    </p>
                  </div>
                )}
              </div>
            )}
            {backend && (
              <p className="shrink-0 truncate type-caption text-[#5c5e60]">{backend}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="edit"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <div className="h-full overflow-y-auto overscroll-contain scrollbar-none px-5 py-4">
            {image ? (
              <ThumbnailEditor
                image={image}
                hook={hook}
                iterationNote={iterationNote}
                onIterationNoteChange={onIterationNoteChange}
                onIterate={() => onIterate(assets)}
                loading={loading}
                assets={assets}
                onAssetsChange={onAssetsChange}
                iterations={iterations}
                onPickIteration={onPickIteration}
                editorHistory={editorHistory}
                onEditorHistoryChange={onEditorHistoryChange}
                selectedLayerId={selectedLayerId}
                onSelectLayer={onSelectLayer}
              />
            ) : (
              <p className="py-16 text-center type-ui font-normal text-[#5c5e60]">
                Generate a thumbnail first, then edit here.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {paletteColors.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#efefef] px-5 py-3">
          <span className="type-caption text-[#5c5e60]">
            {paletteName || "Colors"}
          </span>
          <div className="flex gap-1.5">
            {paletteColors.map((c) => (
              <span
                key={c}
                className="size-5 rounded-full border border-[#efefef]"
                style={{ background: c.startsWith("#") ? c : undefined }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {expanded && (
        <button
          type="button"
          aria-label="Close expanded canvas"
          className="fixed inset-0 z-[var(--z-scrim)] bg-black/30 backdrop-blur-[2px]"
          onClick={() => setExpanded(false)}
        />
      )}
      <div
        className={
          expanded
            ? "fixed left-1/2 top-1/2 z-[var(--z-fullscreen)] flex h-[min(82vh,720px)] w-[min(920px,88vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[20px] border border-[#efefef] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
            : "h-full min-h-0"
        }
      >
        {shell}
      </div>
    </>
  );
}
