"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { StyleBrief } from "@/lib/style-intelligence";
import type { VideoContentMapping } from "@/lib/video-mapping";
import { buildPipelineOverview, type PipelineOverview } from "@/lib/pipeline-overview";
import { GenerationCanvas, type GeneratedVariant } from "@/components/GenerationCanvas";
import { InspirationGrid } from "@/components/InspirationGrid";
import { FeedbackDialog, type FeedbackMode } from "@/components/FeedbackDialog";
import { StatusDialog } from "@/components/StatusDialog";
import { PalettePicker } from "@/components/PalettePicker";
import type { EditorAsset } from "@/components/ThumbnailEditor";
import type { ColorPaletteOption } from "@/lib/palette-types";
import { applyPaletteToBrief } from "@/lib/palette-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Sparkles, Loader2, Clapperboard } from "lucide-react";

type FeedbackMap = Record<string, { rating: "like" | "dislike" | null; comment: string }>;

const COMPOSITIONS = [
  { value: "auto", label: "Auto" },
  { value: "center", label: "Center hero" },
  { value: "split", label: "Split comparison" },
  { value: "cutout", label: "Cutout + scene" },
  { value: "data", label: "Data overlay" },
];

const MODELS = [
  { value: "default", label: "Gemini 2.5 Flash Image (default)" },
  { value: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image" },
  { value: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite" },
  { value: "gemini-3-pro-image", label: "Gemini 3 Pro Image" },
];

const IMAGE_SIZES = [
  { value: "1K", label: "1K Fast (recommended)" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K Ultra (slow)" },
];

export default function Home() {
  const [topic, setTopic] = useState("");
  const [channels, setChannels] = useState("");
  const [hook, setHook] = useState("");
  const [composition, setComposition] = useState("auto");
  const [model, setModel] = useState("default");
  const [imageSize, setImageSize] = useState("1K");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [exploreLabel, setExploreLabel] = useState("");
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [backend, setBackend] = useState("");
  const [inspirations, setInspirations] = useState<InspirationVideo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchSource, setSearchSource] = useState("");
  const [styleBrief, setStyleBrief] = useState<StyleBrief | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<FeedbackMap>({});
  const [geminiStatus, setGeminiStatus] = useState("checking…");
  const [autoSelect, setAutoSelect] = useState(false);
  const [canvasTab, setCanvasTab] = useState<"overview" | "preview" | "edit">("overview");
  const [pipeline, setPipeline] = useState<PipelineOverview | null>(null);
  const [searchingTitles, setSearchingTitles] = useState(false);
  const [iterationNote, setIterationNote] = useState("");
  const [iterationIndex, setIterationIndex] = useState(1);
  const [iterations, setIterations] = useState<
    Array<{ image: string; note: string; backend: string; index: number }>
  >([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchProgress, setSearchProgress] = useState(0);
  const [mappings, setMappings] = useState<VideoContentMapping[]>([]);
  const [assets, setAssets] = useState<EditorAsset[]>([]);
  const [feedbackDialog, setFeedbackDialog] = useState<{
    open: boolean;
    mode: FeedbackMode | null;
    item: InspirationVideo | null;
  }>({ open: false, mode: null, item: null });
  const [palettes, setPalettes] = useState<ColorPaletteOption[]>([]);
  const [selectedPaletteId, setSelectedPaletteId] = useState<string | null>(null);
  const [suggestingPalettes, setSuggestingPalettes] = useState(false);
  const [paletteRatings, setPaletteRatings] = useState<
    Record<string, "like" | "dislike" | null>
  >({});
  const [generatedVariants, setGeneratedVariants] = useState<GeneratedVariant[]>([]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (!d.gemini?.configured) setGeminiStatus("key missing");
        else if (d.gemini.textOk) setGeminiStatus("connected");
        else setGeminiStatus("key error");
      })
      .catch(() => setGeminiStatus("offline"));
  }, []);

  function resetResearch() {
    setInspirations([]);
    setSelectedIds(new Set());
    setFeedback({});
    setTitleSuggestions([]);
    setExploreLabel("");
    setStyleBrief(null);
    setSearchSource("");
    setPipeline(null);
    setIterations([]);
    setIterationIndex(1);
    setMappings([]);
    setSearchStatus("");
    setSearchProgress(0);
    setAssets([]);
    setPalettes([]);
    setSelectedPaletteId(null);
    setPaletteRatings({});
    setGeneratedVariants([]);
  }

  const likedVideos = useMemo(
    () =>
      inspirations.filter((item) => feedback[item.videoId]?.rating === "like"),
    [inspirations, feedback]
  );

  const selectedPalette = useMemo(
    () => palettes.find((p) => p.id === selectedPaletteId) || null,
    [palettes, selectedPaletteId]
  );

  const livePipeline = useMemo(() => {
    if (!inspirations.length) return null;
    const feedbackPayload: ThumbnailFeedback[] = inspirations
      .filter((item) => feedback[item.videoId]?.rating || feedback[item.videoId]?.comment)
      .map((item) => ({
        videoId: item.videoId,
        title: item.title,
        channel: item.channel,
        rating: feedback[item.videoId]?.rating ?? null,
        comment: feedback[item.videoId]?.comment || "",
      }));
    return buildPipelineOverview({
      topic,
      hook,
      composition: composition === "auto" ? "" : composition,
      imageSize,
      model: model === "default" ? "" : model,
      inspirations,
      selectedIds,
      feedback: feedbackPayload,
      styleBrief,
      titleSuggestions,
      iterationNote: iterationNote || undefined,
      iterationIndex: iterationIndex > 1 ? iterationIndex : undefined,
    });
  }, [
    topic,
    hook,
    composition,
    imageSize,
    model,
    inspirations,
    selectedIds,
    feedback,
    styleBrief,
    titleSuggestions,
    iterationNote,
    iterationIndex,
  ]);

  useEffect(() => {
    if (livePipeline) setPipeline(livePipeline);
  }, [livePipeline]);

  async function handleResearch() {
    if (!topic.trim()) return;

    setSearching(true);
    setError("");
    resetResearch();
    setCanvasTab("overview");

    try {
      const res = await fetch("/api/search/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: topic, channels, hook: hook || undefined }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Research failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as Record<string, unknown>;

          if (event.type === "status") {
            setSearchStatus(String(event.message));
            const step = String(event.step);
            if (step === "search") setSearchProgress(25);
            if (step === "map") setSearchProgress(55);
            if (step === "filter") setSearchProgress(80);
          }

          if (event.type === "candidates") {
            setSearchProgress(40);
            const vids = (event.videos as InspirationVideo[]) || [];
            if (vids.length) {
              setInspirations((prev) => {
                const ids = new Set(prev.map((v) => v.videoId));
                const added = vids.filter((v) => !ids.has(v.videoId));
                return [...prev, ...added];
              });
            }
          }

          if (event.type === "mappings") {
            setMappings((event.mappings as VideoContentMapping[]) || []);
            setSearchProgress(70);
          }

          if (event.type === "complete") {
            const results = (event.results as InspirationVideo[]) || [];
            if (!results.length) throw new Error("No premium thumbnails passed quality filter");

            setInspirations(results);
            setSelectedIds(
              autoSelect ? new Set(results.map((r) => r.videoId)) : new Set()
            );
            setTitleSuggestions((event.titleSuggestions as string[]) || []);
            setStyleBrief((event.styleBrief as StyleBrief) || null);
            setSearchSource(
              [
                event.source,
                event.qualityRejected ? `${event.qualityRejected} rejected` : null,
                event.filteredCount ? `${event.filteredCount} filtered` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            );
            setSearchProgress(100);
            setSearchStatus("Research complete");
            if (!hook && (event.styleBrief as StyleBrief)?.suggestedHook) {
              setHook((event.styleBrief as StyleBrief).suggestedHook || "");
            }
            toast.success(`Found ${results.length} premium thumbnails`);
          }

          if (event.type === "error") {
            throw new Error(String(event.message));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Research failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelection(videoId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function applyRating(videoId: string, rating: "like" | "dislike", comment: string) {
    setFeedback((prev) => ({
      ...prev,
      [videoId]: { rating, comment },
    }));
    if (rating === "like") setSelectedIds((prev) => new Set(prev).add(videoId));
    if (rating === "dislike") {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  }

  async function suggestPalettes(
    paletteFeedback?: string,
    likedOverride?: InspirationVideo[],
    feedbackOverride?: ThumbnailFeedback[]
  ) {
    const liked =
      likedOverride ||
      inspirations.filter((item) => feedback[item.videoId]?.rating === "like");
    if (!liked.length) {
      toast.info("Like at least one qualified thumbnail first");
      return;
    }

    setSuggestingPalettes(true);
    try {
      const res = await fetch("/api/palettes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          hook,
          liked,
          feedback: feedbackOverride || buildFeedbackPayload(),
          previousPalettes: palettes,
          paletteFeedback,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Palette suggestion failed");

      const next = (data.palettes || []) as ColorPaletteOption[];
      setPalettes(next);
      if (data.styleBrief) {
        setStyleBrief(
          applyPaletteToBrief(data.styleBrief, next[0]) || data.styleBrief
        );
      }
      if (next[0]) setSelectedPaletteId(next[0].id);
      if (data.styleBrief?.suggestedHook && !hook) {
        setHook(data.styleBrief.suggestedHook);
      }
      toast.success(`${next.length} color directions from liked thumbs`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Palette suggestion failed");
    } finally {
      setSuggestingPalettes(false);
    }
  }

  function openFeedback(item: InspirationVideo, mode: FeedbackMode) {
    const current = feedback[item.videoId]?.rating;
    if (mode === "like" && current === "like") {
      setFeedback((prev) => ({
        ...prev,
        [item.videoId]: { rating: null, comment: prev[item.videoId]?.comment || "" },
      }));
      return;
    }
    if (mode === "dislike" && current === "dislike") {
      setFeedback((prev) => ({
        ...prev,
        [item.videoId]: { rating: null, comment: prev[item.videoId]?.comment || "" },
      }));
      return;
    }
    if (mode === "explore" && current !== "like") {
      toast.info("Like a reference first, then explore similar");
      return;
    }
    setFeedbackDialog({ open: true, mode, item });
  }

  function handleFeedbackSave(comment: string) {
    const { mode, item } = feedbackDialog;
    if (!mode || !item || mode === "explore") return;
    applyRating(item.videoId, mode, comment);
    setFeedbackDialog({ open: false, mode: null, item: null });
    toast.success(mode === "like" ? "Liked — feedback saved" : "Disliked — feedback saved");

    // Colors only after likes on Gemini-qualified thumbs
    if (mode === "like" && palettes.length === 0) {
      const nextFeedback: FeedbackMap = {
        ...feedback,
        [item.videoId]: { rating: "like", comment },
      };
      const liked = inspirations.filter((v) => nextFeedback[v.videoId]?.rating === "like");
      const payload: ThumbnailFeedback[] = liked.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        rating: "like",
        comment: nextFeedback[v.videoId]?.comment || "",
      }));
      void suggestPalettes(undefined, liked, payload);
    }
  }

  async function exploreSimilar(item: InspirationVideo, comment?: string) {
    if (feedback[item.videoId]?.rating !== "like" && !comment) return;

    if (comment !== undefined) {
      applyRating(item.videoId, "like", comment);
    }

    setFeedbackDialog({ open: false, mode: null, item: null });
    setExploring(true);
    setExploreLabel(item.title);
    setError("");

    try {
      const res = await fetch("/api/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          channels,
          seed: item,
          excludeIds: inspirations.map((v) => v.videoId),
          feedback: [
            ...buildFeedbackPayload().filter((f) => f.videoId !== item.videoId),
            {
              videoId: item.videoId,
              title: item.title,
              channel: item.channel,
              rating: "like" as const,
              comment: comment ?? feedback[item.videoId]?.comment ?? "",
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Similar search failed");

      const similar = (data.results || []) as InspirationVideo[];
      if (!similar.length) {
        toast.info("No similar premium thumbnails found");
        return;
      }

      setInspirations((prev) => {
        const ids = new Set(prev.map((v) => v.videoId));
        return [...prev, ...similar.filter((v) => !ids.has(v.videoId))];
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (autoSelect) similar.forEach((v) => next.add(v.videoId));
        return next;
      });
      toast.success(`Added ${similar.length} similar thumbnails from your feedback`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Explore failed");
      toast.error(err instanceof Error ? err.message : "Explore failed");
    } finally {
      setExploring(false);
    }
  }

  function buildFeedbackPayload(): ThumbnailFeedback[] {
    return inspirations
      .filter((item) => feedback[item.videoId]?.rating || feedback[item.videoId]?.comment)
      .map((item) => ({
        videoId: item.videoId,
        title: item.title,
        channel: item.channel,
        rating: feedback[item.videoId]?.rating ?? null,
        comment: feedback[item.videoId]?.comment || "",
      }));
  }

  async function handleSearchTitles() {
    if (!topic.trim()) return;
    setSearchingTitles(true);
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          feedback: buildFeedbackPayload(),
          existingSuggestions: titleSuggestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Title search failed");
      setTitleSuggestions(data.titleSuggestions || []);
      setCanvasTab("overview");
      toast.success("Title suggestions updated from feedback");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Title search failed");
    } finally {
      setSearchingTitles(false);
    }
  }

  async function runGeneration(opts?: {
    iterationNote?: string;
    iterationIndex?: number;
    editAssets?: EditorAsset[];
    baseImage?: string;
  }) {
    const selected = inspirations.filter((item) => selectedIds.has(item.videoId));
    const isIteration = Boolean(opts?.iterationNote?.trim());

    if (!isIteration && !selected.length) {
      throw new Error("Select at least one reference thumbnail");
    }

    if (!isIteration && likedVideos.length === 0) {
      throw new Error("Like at least one qualified thumbnail so we can pick colors from it");
    }

    const brief = applyPaletteToBrief(styleBrief, selectedPalette) || styleBrief;

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        hook,
        composition: composition === "auto" ? "" : composition,
        model: model === "default" ? "" : model,
        imageSize,
        styleBrief: brief,
        selectedPalette,
        paletteOptions: palettes,
        variantCount: isIteration ? 1 : 4,
        inspirations: selected,
        feedback: buildFeedbackPayload(),
        titleSuggestions,
        iterationNote: opts?.iterationNote,
        iterationIndex: opts?.iterationIndex,
        baseImage: opts?.baseImage,
        assets: (opts?.editAssets || []).map((a) => ({
          mimeType: a.mimeType,
          data: a.data,
          label: a.name,
        })),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");
    return data;
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    if (likedVideos.length && !palettes.length) {
      await suggestPalettes();
    }

    setLoading(true);
    setError("");
    setCanvasTab("preview");
    setGeneratedVariants([]);

    try {
      const data = await runGeneration();
      const variants: GeneratedVariant[] = Array.isArray(data.images)
        ? data.images.map(
            (v: {
              id: string;
              image: string;
              label: string;
              paletteId?: string;
              composition?: string;
            }) => ({
              id: v.id,
              image: `data:image/png;base64,${v.image}`,
              label: v.label,
              paletteId: v.paletteId,
              composition: v.composition,
            })
          )
        : data.image
          ? [
              {
                id: "v1",
                image: `data:image/png;base64,${data.image}`,
                label: "Primary",
              },
            ]
          : [];

      const img = variants[0]?.image || null;
      setGeneratedVariants(variants);
      setImage(img);
      setBackend(data.backend || "");
      if (data.pipeline) setPipeline(data.pipeline);
      if (img) {
        setIterations([{ image: img, note: "", backend: data.backend || "", index: 1 }]);
      }
      setIterationIndex(1);
      setIterationNote("");
      setAssets([]);
      toast.success(
        variants.length > 1
          ? `${variants.length} thumbnail combinations ready`
          : "Thumbnail generated"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleIterate(editAssets: EditorAsset[]) {
    if (!iterationNote.trim() || !image) return;

    setLoading(true);
    try {
      const nextIndex = iterationIndex + 1;
      const data = await runGeneration({
        iterationNote: iterationNote.trim(),
        iterationIndex: nextIndex,
        editAssets,
        baseImage: image,
      });
      const img = `data:image/png;base64,${data.image}`;
      setImage(img);
      setBackend(data.backend || "");
      if (data.pipeline) setPipeline(data.pipeline);
      setIterationIndex(nextIndex);
      setIterations((prev) => [
        ...prev,
        { image: img, note: iterationNote.trim(), backend: data.backend || "", index: nextIndex },
      ]);
      setIterationNote("");
      toast.success(`Applied iteration v${nextIndex}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Iteration failed");
    } finally {
      setLoading(false);
    }
  }

  function handlePickIteration(entry: {
    image: string;
    note: string;
    backend: string;
    index: number;
  }) {
    setImage(entry.image);
    setBackend(entry.backend);
    setIterationIndex(entry.index);
    setIterationNote(entry.note);
  }

  function handleDownload() {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image;
    a.download = `thumbnail-${Date.now()}.png`;
    a.click();
  }

  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-white">
      {/* Top bar — centered pill nav feel */}
      <header className="shrink-0 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Clapperboard className="size-5 shrink-0 text-[#181925]" strokeWidth={1.75} />
            <h1 className="type-subheading text-[#181925]">Thumbnail Studio</h1>
          </div>

          <nav className="hidden items-center rounded-[9999px] border border-[#e8e8e8] bg-white p-1 sm:flex">
            <span className="rounded-[9999px] px-4 py-1.5 type-ui text-[#181925]">
              Research
            </span>
            <span className="rounded-[9999px] px-4 py-1.5 type-ui text-[#999999]">
              Generate
            </span>
            <span className="rounded-[9999px] px-4 py-1.5 type-ui text-[#999999]">
              Canvas
            </span>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {geminiStatus === "connected" ? (
              <span className="inline-flex items-center gap-1.5 rounded-[9999px] border border-[#e8e8e8] bg-[#def6e4] px-3 py-1 type-caption font-medium text-[#33c758]">
                Gemini connected
              </span>
            ) : (
              <span className="inline-flex items-center rounded-[9999px] border border-[#e8e8e8] bg-white px-3 py-1 type-caption font-medium text-[#666666]">
                Gemini: {geminiStatus}
              </span>
            )}
          </div>
        </div>
        <div className="border-b border-[#e8e8e8]" />
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] sm:gap-5 sm:p-5">
        {/* Research — primary workspace */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#e8e8e8] bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <section className="space-y-4 border-b border-[#e8e8e8] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="type-subheading text-[#181925]">Research</h2>
                  <p className="mt-1 type-ui font-normal text-[#666666]">
                    Rate refs with notes — like, dislike, then explore similar
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="autoSelect"
                    checked={autoSelect}
                    onCheckedChange={(v) => setAutoSelect(v === true)}
                  />
                  <Label htmlFor="autoSelect" className="cursor-pointer font-normal text-[#666666]">
                    Auto-select
                  </Label>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
                <div className="space-y-2">
                  <Label htmlFor="topic">Video title / topic</Label>
                  <Textarea
                    id="topic"
                    className="min-h-[72px]"
                    placeholder="e.g. How Alcohol Is Made in India | Inside the Factory"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channels">
                    Channels <span className="font-normal text-[#999999]">(optional)</span>
                  </Label>
                  <Textarea
                    id="channels"
                    className="min-h-[72px]"
                    placeholder="Channel URLs, one per line"
                    value={channels}
                    onChange={(e) => setChannels(e.target.value)}
                    rows={2}
                  />
                </div>
                <Button
                  size="lg"
                  className="w-full lg:w-auto lg:min-w-[140px]"
                  onClick={handleResearch}
                  disabled={searching || exploring || !topic.trim()}
                >
                  {searching ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Searching
                    </>
                  ) : (
                    <>
                      <Search className="size-4" />
                      Research
                    </>
                  )}
                </Button>
              </div>
            </section>

            <section className="space-y-4 p-5 sm:p-6">
              {styleBrief && (
                <div className="space-y-2 rounded-[16px] border border-[#e8e8e8] bg-[#fafafa] p-4">
                  <p className="type-ui text-[#181925]">Quality direction</p>
                  <p className="type-ui font-normal leading-relaxed text-[#666666] line-clamp-3">
                    {styleBrief.summary}
                  </p>
                  <p className="type-caption text-[#999999]">
                    Colors unlock after you like qualified references
                  </p>
                </div>
              )}

              {(inspirations.length > 0 || likedVideos.length > 0) && (
                <PalettePicker
                  palettes={palettes}
                  selectedId={selectedPaletteId}
                  loading={suggestingPalettes}
                  hasLikes={likedVideos.length > 0}
                  paletteRatings={paletteRatings}
                  onSelect={(p) => {
                    setSelectedPaletteId(p.id);
                    setStyleBrief((prev) => applyPaletteToBrief(prev, p) || prev);
                  }}
                  onSuggest={(note) => void suggestPalettes(note)}
                  onRatePalette={(id, rating) => {
                    setPaletteRatings((prev) => ({
                      ...prev,
                      [id]: prev[id] === rating ? null : rating,
                    }));
                  }}
                />
              )}

              {(inspirations.length > 0 || searching) && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between type-caption text-[#999999]">
                    <span>
                      {inspirations.length} results
                      {searchSource ? ` · ${searchSource}` : ""}
                      {exploreLabel && !exploring ? ` · similar to “${exploreLabel}”` : ""}
                    </span>
                    <span className="font-medium text-[#181925]">
                      {selectedIds.size} selected
                    </span>
                  </div>
                  <InspirationGrid
                    items={inspirations}
                    selectedIds={selectedIds}
                    feedback={feedback}
                    exploring={exploring}
                    onToggle={toggleSelection}
                    onLike={(item) => openFeedback(item, "like")}
                    onDislike={(item) => openFeedback(item, "dislike")}
                    onExplore={(item) => openFeedback(item, "explore")}
                    onEditFeedback={(item) =>
                      openFeedback(
                        item,
                        feedback[item.videoId]?.rating === "dislike" ? "dislike" : "like"
                      )
                    }
                  />
                </div>
              )}

              {!inspirations.length && !searching && (
                <div className="rounded-[16px] border border-[#e8e8e8] bg-[#fafafa] px-6 py-16 text-center">
                  <p className="type-ui text-[#181925]">No references yet</p>
                  <p className="mt-2 type-ui font-normal text-[#666666]">
                    Enter a topic and run research. Like / dislike opens a note dialog.
                  </p>
                </div>
              )}
            </section>
          </div>

          <section className="shrink-0 space-y-3 border-t border-[#e8e8e8] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="type-subheading text-[#181925]">Generate</h2>
                <p className="mt-1 type-ui font-normal text-[#666666]">
                  Hook + options from selected refs
                </p>
              </div>
              <Button
                type="submit"
                form="generate-form"
                size="default"
                disabled={loading || !topic.trim() || (selectedIds.size === 0 && !image)}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate
                  </>
                )}
              </Button>
            </div>

            <form id="generate-form" onSubmit={handleGenerate} className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="hook">Hook</Label>
                <Input
                  id="hook"
                  placeholder='e.g. "HOW IT&apos;S MADE"'
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label>Composition</Label>
                <Select value={composition} onValueChange={(v) => v && setComposition(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPOSITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label>Resolution</Label>
                <Select value={imageSize} onValueChange={(v) => v && setImageSize(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </form>

            {error && (
              <p className="rounded-[8px] border border-[#e8e8e8] bg-[#fafafa] px-4 py-3 type-ui font-normal text-[#666666]">
                {error}
              </p>
            )}
          </section>
        </aside>

        {/* Canvas — secondary column */}
        <div className="min-h-0 min-w-0">
          <GenerationCanvas
            canvasTab={canvasTab}
            onTabChange={setCanvasTab}
            pipeline={pipeline}
            mappings={mappings}
            searchStatus={searchStatus}
            searchProgress={searchProgress}
            image={image}
            backend={backend}
            loading={loading}
            titleSuggestions={titleSuggestions}
            searchingTitles={searchingTitles}
            onSearchTitles={handleSearchTitles}
            onPickTitle={setTopic}
            iterationNote={iterationNote}
            onIterationNoteChange={setIterationNote}
            onIterate={handleIterate}
            iterations={iterations}
            onPickIteration={handlePickIteration}
            onDownload={handleDownload}
            assets={assets}
            onAssetsChange={setAssets}
            generatedVariants={generatedVariants}
            onPickVariant={(v) => {
              setImage(v.image);
              setBackend("");
              setCanvasTab("preview");
            }}
          />
        </div>
      </div>

      <FeedbackDialog
        open={feedbackDialog.open}
        mode={feedbackDialog.mode}
        item={feedbackDialog.item}
        initialComment={
          feedbackDialog.item
            ? feedback[feedbackDialog.item.videoId]?.comment || ""
            : ""
        }
        exploring={exploring}
        onOpenChange={(open) => {
          if (!open) setFeedbackDialog({ open: false, mode: null, item: null });
        }}
        onSave={handleFeedbackSave}
        onExplore={(comment) => {
          if (feedbackDialog.item) void exploreSimilar(feedbackDialog.item, comment);
        }}
      />

      <StatusDialog
        open={searching}
        title="Researching thumbnails"
        message={searchStatus || "Scanning premium references…"}
        progress={searchProgress}
      />

      <StatusDialog
        open={exploring}
        title="Finding similar"
        message={
          exploreLabel
            ? `Using your feedback on “${exploreLabel}”…`
            : "Searching similar premium refs…"
        }
      />

      <StatusDialog
        open={loading}
        title="Generating combinations"
        message="Building 3–4 variants from liked thumbs + selected palette…"
      />

      <StatusDialog
        open={suggestingPalettes}
        title="Picking colors from likes"
        message="Reading liked thumbnail images to suggest palettes…"
      />
    </div>
  );
}
