"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { InspirationVideo, RejectedInspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { StyleBrief } from "@/lib/style-intelligence";
import type { VideoContentMapping } from "@/lib/video-mapping";
import { buildPipelineOverview, type PipelineOverview } from "@/lib/pipeline-overview";
import { GenerationCanvas, type GeneratedVariant } from "@/components/GenerationCanvas";
import { InspirationGrid } from "@/components/InspirationGrid";
import { RejectedInspirationGrid } from "@/components/RejectedInspirationGrid";
import { FeedbackDialog, type FeedbackMode } from "@/components/FeedbackDialog";
import { StatusDialog } from "@/components/StatusDialog";
import type { TopicContext } from "@/lib/gemini-filter";
import {
  buildGenerationContextSummary,
} from "@/lib/generation-context";
import { PalettePicker } from "@/components/PalettePicker";
import { ColorPicker } from "@/components/ColorPicker";
import type { EditorAsset } from "@/components/ThumbnailEditor";
import type { ColorPaletteOption } from "@/lib/palette-types";
import { applyPaletteToBrief } from "@/lib/palette-types";
import { DEFAULT_MASTER_PROMPT } from "@/lib/prompt-engine";
import { COMPOSITION_FACTORS } from "@/lib/composition-factors";
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
import { HistoryMenu } from "@/components/HistoryMenu";
import { ExportNavMenu } from "@/components/ExportNavMenu";
import {
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Telescope,
} from "lucide-react";
import { StudioShell, normalizeStudioTab, type StudioTab } from "@/components/StudioShell";
import { Badge } from "@/components/ui/badge";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { OpeningFramesPanel, type OpeningFrameClip } from "@/components/OpeningFramesPanel";
import {
  extractIntelligenceFramesFromVideoFile,
  extractOpeningFramesFromVideoFile,
} from "@/lib/extract-frames-client";
import {
  uploadFrameToCohesivityStorage,
  uploadVideoToCohesivityStorage,
} from "@/lib/video-storage-client";
import { FULL_VIDEO_MAX_FRAMES } from "@/lib/video-sample-times";
import { readJsonResponse } from "@/lib/safe-json";
import { MediaIntelligencePanel } from "@/components/MediaIntelligencePanel";
import { ChannelProfilePanel } from "@/components/ChannelProfilePanel";
import { BrandLanguagePanel } from "@/components/BrandLanguagePanel";
import { compressDataUrl, compressFile } from "@/lib/image-compress-client";
import type {
  MediaImageInput,
  PersistedMediaPhoto,
  VideoIntelligenceResult,
} from "@/lib/video-intelligence-types";
import { intelligenceForGeneration } from "@/lib/video-intelligence-types";
import {
  buildSharePayload,
  compactSharePayload,
  compactVideoIntelligence,
  decodeShareUrl,
  deleteHistorySession,
  listHistory,
  parseShareTokenFromLocation,
  saveHistorySession,
  saveDraft,
  loadDraft,
  type SharePayload,
  type StudioSession,
} from "@/lib/studio-history";
import { takeShareHandoff } from "@/lib/share-handoff";
import { publicShareUrl } from "@/lib/share-slug";
import {
  rememberSharedSession,
  syncLocalHistoryToCloud,
} from "@/lib/cloud-history-sync";
import { createEmptyDocument } from "@/lib/editor-types";
import { createEditorHistory, type EditorHistory } from "@/lib/editor-history";
import {
  DEFAULT_BRAND_LANGUAGE,
  loadBrandLanguage,
  saveBrandLanguage,
  type BrandLanguage,
} from "@/lib/brand-language";
import {
  loadChannelProfile,
  saveChannelProfile,
  type ChannelProfile,
} from "@/lib/channel-profile";
import { exportDesignPack, uploadDesignPackToStorage } from "@/lib/design-pack";

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

/** Fallback slice only if browser decode fails — Vercel body limit. */
const VIDEO_UPLOAD_SLICE_BYTES = 4 * 1024 * 1024;

// Force dynamic rendering so the root shell is never edge/CDN-cached across
// deploys — this route previously shipped as a static prerender with a
// 1-year edge cache, which made new deploys look "stuck" on old code.
export const dynamic = "force-dynamic";

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
  const [rejectedInspirations, setRejectedInspirations] = useState<RejectedInspirationVideo[]>([]);
  const [filterSummary, setFilterSummary] = useState("");
  const [topicContext, setTopicContext] = useState<TopicContext | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchSource, setSearchSource] = useState("");
  const [styleBrief, setStyleBrief] = useState<StyleBrief | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<FeedbackMap>({});
  const [geminiStatus, setGeminiStatus] = useState("checking…");
  const [autoSelect, setAutoSelect] = useState(false);
  /** Light Gemini filter: show top 8 as-is, drop only extremely off-title. */
  const [lightFilter, setLightFilter] = useState(true);
  const [studioTab, setStudioTab] = useState<StudioTab>("topic");
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
  const [generatingSimilarId, setGeneratingSimilarId] = useState<string | null>(null);
  const [masterPrompt, setMasterPrompt] = useState(DEFAULT_MASTER_PROMPT);
  const [useOpeningFrames, setUseOpeningFrames] = useState(false);
  const [openingFrames, setOpeningFrames] = useState<OpeningFrameClip[]>([]);
  const [compositionFactors, setCompositionFactors] = useState<string[]>([
    "rule-of-thirds",
    "diagonal",
  ]);
  const [sessionId, setSessionId] = useState(() => `sess-${Date.now()}`);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<StudioSession[]>([]);
  const [mediaYoutubeUrl, setMediaYoutubeUrl] = useState("");
  const [mediaScript, setMediaScript] = useState("");
  const [mediaPhotos, setMediaPhotos] = useState<PersistedMediaPhoto[]>([]);
  const [mediaIntelligence, setMediaIntelligence] =
    useState<VideoIntelligenceResult | null>(null);
  const [analyzingMedia, setAnalyzingMedia] = useState(false);
  const [mediaAnalysisProgress, setMediaAnalysisProgress] = useState("");
  const [brandLanguage, setBrandLanguage] = useState<BrandLanguage>(DEFAULT_BRAND_LANGUAGE);
  const [channelProfile, setChannelProfile] = useState<ChannelProfile | null>(null);
  const [channelProfileInput, setChannelProfileInput] = useState("");
  const [analyzingChannel, setAnalyzingChannel] = useState(false);
  const [exportingDesignPack, setExportingDesignPack] = useState(false);
  const [editorHistory, setEditorHistory] = useState<EditorHistory>(() =>
    createEditorHistory(createEmptyDocument())
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const videoFilesRef = useRef<Map<string, File>>(new Map());
  const paletteAutoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readyOpeningFrames = useMemo(
    () => openingFrames.filter((f) => f.status === "ready"),
    [openingFrames]
  );

  async function streamOpeningFrame(
    file: File,
    options?: {
      storageUrl?: string;
      storagePath?: string;
      skipUpload?: boolean;
      displayName?: string;
    }
  ) {
    if (readyOpeningFrames.length >= 2 || openingFrames.length >= 2) {
      toast.error("Max 2 source videos");
      return;
    }

    const displayName = options?.displayName || file.name;
    const id = `${Date.now()}-${displayName}`;
    videoFilesRef.current.set(id, file);
    setOpeningFrames((prev) => {
      if (prev.length >= 2) return prev;
      return [
        ...prev,
        {
          id,
          name: displayName,
          status: "uploading",
          mimeType: "image/jpeg",
          data: "",
          label: options?.skipUpload ? "Stored · sampling…" : "",
          previewUrl: "",
        },
      ];
    });

    try {
      // 1) Store full video on Cohesivity object storage (chunked — bypasses Vercel body limit).
      let storageUrl: string | undefined = options?.storageUrl;
      let storagePath: string | undefined = options?.storagePath;

      // JPEG/PNG mislabeled as video (stale YouTube client, or still upload).
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const looksJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      const looksPng =
        head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      const isStill =
        file.type.startsWith("image/") || looksJpeg || looksPng;

      if (!options?.skipUpload && !isStill) {
        try {
          const stored = await uploadVideoToCohesivityStorage(file, {
            onProgress: (uploadedBytes, totalBytes) => {
              const pct = Math.round((uploadedBytes / Math.max(1, totalBytes)) * 100);
              setOpeningFrames((prev) =>
                prev.map((clip) =>
                  clip.id === id
                    ? { ...clip, label: `Uploading to Cohesivity… ${pct}%` }
                    : clip
                )
              );
            },
          });
          storageUrl = stored.url;
          storagePath = stored.path;
        } catch (storageErr) {
          console.error("Video storage failed (continuing with local sample):", storageErr);
        }
      }

      // 2) Sample stills across the FULL runtime in the browser.
      setOpeningFrames((prev) =>
        prev.map((clip) => (clip.id === id ? { ...clip, status: "extracting" as const } : clip))
      );

      let res: Response;
      let durationSec = 0;
      let localFrames: Array<{
        timestampSec: number;
        mimeType: string;
        data: string;
        previewData: string;
      }> = [];

      if (isStill) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        const b64 = btoa(binary);
        const mimeType = looksPng || file.type === "image/png" ? "image/png" : "image/jpeg";
        localFrames = [
          {
            timestampSec: 0,
            mimeType,
            data: b64,
            previewData: b64,
          },
        ];
        res = await fetch("/api/opening-frames", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: displayName,
            topic: topic.trim() || undefined,
            candidates: localFrames.map((f) => ({
              timestampSec: f.timestampSec,
              mimeType: f.mimeType,
              data: f.data,
            })),
          }),
        });
      } else {
        try {
          const extraction = await extractOpeningFramesFromVideoFile(file, {
            maxFrames: FULL_VIDEO_MAX_FRAMES,
          });
          durationSec = extraction.durationSec;
          localFrames = extraction.frames;
          // Ranking payload only — no preview blobs (avoids HTML 413 error pages).
          res = await fetch("/api/opening-frames", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: displayName,
              topic: topic.trim() || undefined,
              candidates: extraction.frames.map((f) => ({
                timestampSec: f.timestampSec,
                mimeType: f.mimeType,
                data: f.data,
              })),
            }),
          });
        } catch {
          // Decode failed — fallback to truncated server ffmpeg path.
          const uploadBody =
            file.size > VIDEO_UPLOAD_SLICE_BYTES
              ? file.slice(0, VIDEO_UPLOAD_SLICE_BYTES)
              : file;
          res = await fetch("/api/opening-frames", {
            method: "POST",
            headers: {
              "Content-Type": file.type || "video/mp4",
              "X-Video-Name": encodeURIComponent(displayName),
              ...(topic.trim() ? { "X-Video-Topic": encodeURIComponent(topic.trim()) } : {}),
              "X-Upload-Bytes": String(uploadBody.size),
              ...(file.size > VIDEO_UPLOAD_SLICE_BYTES
                ? { "X-Original-Size": String(file.size) }
                : {}),
            },
            body: uploadBody,
          });
        }
      }

      const data = await readJsonResponse<{
        error?: string;
        mimeType?: string;
        data?: string;
        label?: string;
        timestampSec?: number;
        candidates?: Array<{
          timestampSec: number;
          mimeType: string;
          data?: string;
          previewData?: string;
        }>;
        geminiPickIndex?: number;
        geminiReason?: string;
        pickSource?: "gemini" | "heuristic";
      }>(res);
      if (!res.ok) throw new Error(data.error || "Frame extract failed");

      const pickIdx =
        typeof data.geminiPickIndex === "number" ? data.geminiPickIndex : 0;

      const candidates =
        localFrames.length > 0
          ? localFrames.map((c) => ({
              timestampSec: c.timestampSec,
              mimeType: c.mimeType,
              data: c.data,
              previewUrl: `data:${c.mimeType};base64,${c.previewData || c.data}`,
            }))
          : Array.isArray(data.candidates)
            ? data.candidates
                .filter((c) => c.data)
                .map((c) => ({
                  timestampSec: c.timestampSec,
                  mimeType: c.mimeType,
                  data: c.data as string,
                  previewUrl: `data:${c.mimeType};base64,${c.previewData || c.data}`,
                }))
            : [];

      const pickedCandidate =
        candidates[pickIdx] ??
        candidates.find((c) => c.timestampSec === data.timestampSec) ??
        candidates[0] ??
        null;

      // 3) Also store the winning still for durable reference.
      let frameStorageUrl: string | undefined;
      if (pickedCandidate?.data) {
        const frameStored = await uploadFrameToCohesivityStorage(
          pickedCandidate.data,
          pickedCandidate.mimeType || "image/jpeg",
          `${file.name}-best`
        );
        frameStorageUrl = frameStored?.url;
      }

      if (!durationSec && typeof data.timestampSec === "number") {
        durationSec = Math.max(
          data.timestampSec,
          ...(candidates.map((c) => c.timestampSec) || [0])
        );
      }

      const mimeType = data.mimeType || pickedCandidate?.mimeType || "image/jpeg";
      const frameData = data.data || pickedCandidate?.data || "";
      if (!frameData) throw new Error("No frame selected from video");

      setOpeningFrames((prev) =>
        prev.map((clip) =>
          clip.id === id
            ? {
                ...clip,
                status: "ready" as const,
                mimeType,
                data: frameData,
                label: data.label || `Frame @${data.timestampSec}s: ${displayName.slice(0, 40)}`,
                previewUrl: pickedCandidate?.previewUrl
                  ? pickedCandidate.previewUrl
                  : `data:${mimeType};base64,${frameData}`,
                timestampSec: pickedCandidate?.timestampSec ?? data.timestampSec,
                bytesRead: file.size,
                durationSec,
                frameCount: candidates.length,
                storageUrl,
                storagePath,
                frameStorageUrl,
                candidates,
                geminiPickIndex: data.geminiPickIndex,
                geminiReason: data.geminiReason,
                pickSource: data.pickSource,
              }
            : clip
        )
      );

      const mb = (file.size / (1024 * 1024)).toFixed(1);
      const pickLabel =
        data.pickSource === "gemini"
          ? `Gemini picked @${pickedCandidate?.timestampSec ?? data.timestampSec}s`
          : `@${pickedCandidate?.timestampSec ?? data.timestampSec}s`;
      toast.success(
        `${pickLabel} from full video · ${candidates.length || "?"} samples, ${mb}MB${
          storageUrl ? ", stored" : ""
        }`
      );
    } catch (err) {
      videoFilesRef.current.delete(id);
      setOpeningFrames((prev) => prev.filter((clip) => clip.id !== id));
      toast.error(err instanceof Error ? err.message : "Full-video ingest failed");
    }
  }

  async function ingestYoutubeUrl(url: string) {
    if (readyOpeningFrames.length >= 2 || openingFrames.length >= 2) {
      toast.error("Max 2 source videos");
      return;
    }

    const placeholderId = `yt-${Date.now()}`;
    // Wire the same URL into Media Intelligence (captions / metadata analysis).
    setMediaYoutubeUrl(url.trim());
    setUseOpeningFrames(true);
    setOpeningFrames((prev) => {
      if (prev.length >= 2) return prev;
      return [
        ...prev,
        {
          id: placeholderId,
          name: url,
          status: "uploading",
          mimeType: "image/jpeg",
          data: "",
          label: "Sampling YouTube key moments…",
          previewUrl: "",
        },
      ];
    });

    try {
      const res = await fetch("/api/youtube/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await readJsonResponse<{
        error?: string;
        path?: string;
        url?: string;
        title?: string;
        contentType?: string;
        bytes?: number;
        qualityLabel?: string;
        filename?: string;
        frames?: Array<{
          key: string;
          url: string;
          mimeType: string;
          data: string;
          label: string;
          timestampSec: number;
        }>;
      }>(res);
      if (!res.ok) throw new Error(data.error || "YouTube fetch failed");
      if (!data.frames?.length || !data.frames[0]?.data) {
        throw new Error("No YouTube thumbnails returned");
      }

      const displayName = data.title || data.filename || "YouTube video";
      setOpeningFrames((prev) =>
        prev.map((clip) =>
          clip.id === placeholderId
            ? {
                ...clip,
                name: displayName,
                status: "extracting",
                label: `Picking best of ${data.frames!.length} key moments…`,
                storageUrl: data.url,
                storagePath: data.path,
              }
            : clip
        )
      );

      // Rank every distinct CDN / timeline still (same path as uploaded video samples).
      const pickRes = await fetch("/api/opening-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: displayName,
          topic: topic.trim() || undefined,
          candidates: data.frames.map((f) => ({
            timestampSec: f.timestampSec,
            mimeType: f.mimeType || "image/jpeg",
            data: f.data,
          })),
        }),
      });
      const pick = await readJsonResponse<{
        error?: string;
        mimeType?: string;
        data?: string;
        label?: string;
        timestampSec?: number;
        geminiPickIndex?: number;
        geminiReason?: string;
        pickSource?: "gemini" | "heuristic";
      }>(pickRes);
      if (!pickRes.ok) throw new Error(pick.error || "Frame pick failed");

      const pickIdx =
        typeof pick.geminiPickIndex === "number" ? pick.geminiPickIndex : 0;
      const candidates = data.frames
        .filter((f) => f.data)
        .map((f) => ({
          timestampSec: f.timestampSec,
          mimeType: f.mimeType || "image/jpeg",
          data: f.data,
          previewUrl: `data:${f.mimeType || "image/jpeg"};base64,${f.data}`,
        }));
      const picked = candidates[pickIdx] ?? candidates[0];
      const mimeType = pick.mimeType || picked.mimeType;
      const frameData = pick.data || picked.data;

      let frameStorageUrl = data.frames[pickIdx]?.url || data.url;
      const frameStored = await uploadFrameToCohesivityStorage(
        frameData,
        mimeType,
        `${displayName}-best`
      );
      if (frameStored?.url) frameStorageUrl = frameStored.url;

      const readyClip: OpeningFrameClip = {
        id: placeholderId,
        name: displayName,
        status: "ready",
        mimeType,
        data: frameData,
        label:
          pick.label ||
          `YouTube key moment @${picked.timestampSec}s · ${candidates.length} candidates`,
        previewUrl: picked.previewUrl,
        timestampSec: picked.timestampSec,
        bytesRead: data.bytes,
        frameCount: candidates.length,
        storageUrl: data.url,
        storagePath: data.path || data.frames[0]?.key,
        frameStorageUrl,
        candidates,
        geminiPickIndex: pick.geminiPickIndex,
        geminiReason: pick.geminiReason,
        pickSource: pick.pickSource,
      };

      setOpeningFrames((prev) =>
        prev.map((clip) => (clip.id === placeholderId ? readyClip : clip))
      );

      const pickLabel =
        pick.pickSource === "gemini"
          ? `Gemini picked key moment (${candidates.length} samples)`
          : `Best of ${candidates.length} key moments`;
      toast.success(`${pickLabel} · stored`);

      // Full media intelligence: captions + metadata + ranked stills.
      try {
        await handleAnalyzeMedia({
          youtubeUrl: url.trim(),
          openingFramesOverride: [readyClip],
        });
      } catch (analyzeErr) {
        toast.error(
          analyzeErr instanceof Error
            ? `Stills ready, analysis failed: ${analyzeErr.message}`
            : "Stills ready, but media analysis failed"
        );
      }
    } catch (err) {
      setOpeningFrames((prev) => prev.filter((clip) => clip.id !== placeholderId));
      toast.error(err instanceof Error ? err.message : "YouTube ingest failed");
    }
  }

  function selectOpeningFrame(clipId: string, timestampSec: number) {
    setOpeningFrames((prev) =>
      prev.map((clip) => {
        if (clip.id !== clipId || !clip.candidates?.length) return clip;
        const chosen = clip.candidates.find((c) => c.timestampSec === timestampSec);
        if (!chosen) return clip;
        return {
          ...clip,
          timestampSec: chosen.timestampSec,
          mimeType: chosen.mimeType,
          data: chosen.data,
          previewUrl: chosen.previewUrl,
          label: `Frame @${chosen.timestampSec}s (manual): ${clip.name.slice(0, 40)}`,
        };
      })
    );
  }

  async function handleUploadMediaPhotos(files: File[]) {
    const slots = Math.max(0, 4 - mediaPhotos.length);
    if (!slots) {
      toast.error("Max 4 media photos");
      return;
    }
    try {
      const compressed = await Promise.all(
        files.slice(0, slots).map(async (file, index) => {
          const image = await compressFile(file, { maxWidth: 640, quality: 0.72 });
          return {
            id: `photo-${Date.now()}-${index}`,
            name: file.name,
            mimeType: image.mimeType,
            data: image.data,
            previewUrl: image.previewUrl,
          } satisfies PersistedMediaPhoto;
        })
      );
      setMediaPhotos((previous) => [...previous, ...compressed].slice(0, 4));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read photo");
    }
  }

  async function handleAnalyzeMedia(options?: {
    youtubeUrl?: string;
    openingFramesOverride?: OpeningFrameClip[];
  }) {
    if (analyzingMedia) return;
    setAnalyzingMedia(true);
    setMediaAnalysisProgress("Preparing sources…");
    const ytForAnalysis = (options?.youtubeUrl || mediaYoutubeUrl).trim();
    const clipsForAnalysis =
      options?.openingFramesOverride ||
      openingFrames.filter((f) => f.status === "ready");
    try {
      const images: MediaImageInput[] = mediaPhotos.map((photo) => ({
        id: photo.id,
        name: photo.name,
        kind: "photo",
        mimeType: photo.mimeType,
        data: photo.data,
      }));

      for (let clipIndex = 0; clipIndex < clipsForAnalysis.length; clipIndex++) {
        const clip = clipsForAnalysis[clipIndex];
        const remaining = 8 - images.length;
        if (remaining <= 0) break;
        const file = videoFilesRef.current.get(clip.id);
        if (file) {
          setMediaAnalysisProgress(`Sampling ${clip.name}…`);
          try {
            const extraction = await extractIntelligenceFramesFromVideoFile(file, {
              maxFrames: Math.min(
                16,
                Math.max(
                  6,
                  Math.floor(remaining / Math.max(1, clipsForAnalysis.length - clipIndex)) * 2
                )
              ),
              onProgress: (completed, total) =>
                setMediaAnalysisProgress(
                  `Sampling ${clip.name} · ${completed}/${total} frames`
                ),
            });
            for (const frame of extraction.frames) {
              if (images.length >= 8) break;
              images.push({
                id: `${clip.id}-${frame.timestampSec}`,
                name: `${clip.name} @${frame.timestampSec}s`,
                kind: "video-frame",
                mimeType: frame.mimeType,
                data: frame.data,
                timestampSec: frame.timestampSec,
              });
            }
            continue;
          } catch {
            // Fall through to the already extracted opening candidates.
          }
        }

        for (const frame of clip.candidates || []) {
          if (images.length >= 8) break;
          if (!frame.data) continue;
          images.push({
            id: `${clip.id}-${frame.timestampSec}`,
            name: `${clip.name} @${frame.timestampSec}s`,
            kind: "video-frame",
            mimeType: frame.mimeType,
            data: frame.data,
            timestampSec: frame.timestampSec,
          });
        }
      }

      setMediaAnalysisProgress("Understanding context, depth, colors, and hooks…");
      const response = await fetch("/api/video-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim() || undefined,
          youtubeUrl: ytForAnalysis || undefined,
          script: mediaScript.trim() || undefined,
          images,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Media analysis failed");
      const result = data.result as VideoIntelligenceResult;
      setMediaIntelligence(result);
      setStyleBrief(result.styleBrief);
      if (!topic.trim() && result.recommendedTopic) setTopic(result.recommendedTopic);
      // Do not auto-fill hook — user picks a suggested chip or types it.
      if (result.palettes.length) {
        setPalettes(result.palettes);
        setSelectedPaletteId(result.palettes[0].id);
      }
      if (clipsForAnalysis.length) setUseOpeningFrames(true);
      toast.success(
        `Media understood · ${result.confidence.level} confidence, ${result.hooks.length} hooks`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Media analysis failed");
    } finally {
      setAnalyzingMedia(false);
      setMediaAnalysisProgress("");
    }
  }

  useEffect(() => {
    setHistoryList(listHistory());
    setBrandLanguage(loadBrandLanguage());
    const savedProfile = loadChannelProfile();
    if (savedProfile) {
      setChannelProfile(savedProfile);
      setChannelProfileInput(savedProfile.channelInput);
    }
    const draft = loadDraft();
    const handoff = takeShareHandoff();
    const legacyToken = parseShareTokenFromLocation();
    if (draft && !handoff && !legacyToken) {
      // Topic + hook start blank each load (user types fresh). Other studio prefs restore.
      setTopic("");
      setChannels(draft.channels);
      setHook("");
      setComposition(draft.composition);
      setModel(draft.model);
      setImageSize(draft.imageSize);
      setMasterPrompt(draft.masterPrompt);
      setCompositionFactors(draft.compositionFactors);
      setUseOpeningFrames(draft.useOpeningFrames);
      setMediaYoutubeUrl(draft.mediaYoutubeUrl || "");
      setMediaScript(draft.mediaScript || "");
      setMediaPhotos(draft.mediaPhotos || []);
      setMediaIntelligence(draft.mediaIntelligence || null);
      if (draft.editorDocument) {
        setEditorHistory(createEditorHistory(draft.editorDocument));
      }
      if (draft.brandLanguage) setBrandLanguage(draft.brandLanguage);
      if (draft.channelProfile) {
        setChannelProfile(draft.channelProfile);
        setChannelProfileInput(draft.channelProfile.channelInput);
      }
    }
    if (handoff) {
      applySharePayload(handoff.payload);
      if (handoff.slug) {
        setShareSlug(handoff.slug);
        rememberSharedSession(handoff.payload, handoff.slug);
        setHistoryList(listHistory());
      }
      toast.success("Shared session loaded");
    } else if (legacyToken) {
      void decodeShareUrl(legacyToken).then((payload) => {
        if (!payload) return;
        applySharePayload(payload);
        toast.success("Shared session loaded");
        window.history.replaceState({}, "", window.location.pathname);
      });
    }

    // Backfill older localStorage saves into Cohesivity short /s/ links.
    void syncLocalHistoryToCloud({ draft }).then((stats) => {
      setHistoryList(listHistory());
      if (stats.pushed > 0) {
        toast.success(
          `Synced ${stats.pushed} saved session${stats.pushed === 1 ? "" : "s"} to short links`
        );
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const exportProvider = params.get("export");
    const status = params.get("status");
    const message = params.get("message");
    if (!exportProvider || !status) return;
    if (status === "connected") {
      toast.success(`${exportProvider === "canva" ? "Canva" : "Figma"} connected`);
    } else if (status === "error") {
      toast.error(message || `${exportProvider} connection failed`);
    }
    params.delete("export");
    params.delete("status");
    params.delete("message");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `?${next}` : window.location.pathname);
  }, []);

  useEffect(() => {
    saveDraft({
      topic,
      channels,
      hook,
      composition,
      model,
      imageSize,
      masterPrompt,
      compositionFactors,
      useOpeningFrames,
      mediaYoutubeUrl,
      mediaScript,
      mediaPhotos,
      mediaIntelligence: compactVideoIntelligence(mediaIntelligence),
      editorDocument: editorHistory.present,
      brandLanguage,
      channelProfile,
    });
  }, [
    topic,
    channels,
    hook,
    composition,
    model,
    imageSize,
    masterPrompt,
    compositionFactors,
    useOpeningFrames,
    mediaYoutubeUrl,
    mediaScript,
    mediaPhotos,
    mediaIntelligence,
    editorHistory.present,
    brandLanguage,
    channelProfile,
  ]);

  useEffect(() => {
    saveBrandLanguage(brandLanguage);
  }, [brandLanguage]);

  useEffect(() => {
    if (channelProfile) saveChannelProfile(channelProfile);
  }, [channelProfile]);

  useEffect(() => {
    if (!image) return;
    setEditorHistory((prev) => ({
      ...prev,
      present: {
        ...prev.present,
        backgroundImage: image,
      },
    }));
  }, [image]);

  async function shrinkForStorage(dataUrl: string | null): Promise<string | null> {
    if (!dataUrl) return null;
    try {
      const c = await compressDataUrl(dataUrl, { maxWidth: 640, quality: 0.72 });
      return c.previewUrl;
    } catch {
      return dataUrl;
    }
  }

  async function buildCurrentSession(): Promise<StudioSession> {
    const imageSmall = await shrinkForStorage(image);
    const iterationsSmall = await Promise.all(
      iterations.map(async (it) => ({
        ...it,
        image: (await shrinkForStorage(it.image)) || it.image,
      }))
    );
    const variantsSmall = await Promise.all(
      generatedVariants.map(async (v) => ({
        ...v,
        image: (await shrinkForStorage(v.image)) || v.image,
      }))
    );
    return {
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      topic,
      channels,
      hook,
      composition,
      model,
      imageSize,
      masterPrompt,
      compositionFactors,
      useOpeningFrames,
      image: imageSmall,
      backend,
      iterations: iterationsSmall,
      generatedVariants: variantsSmall,
      titleSuggestions,
      mediaYoutubeUrl,
      mediaScript,
      mediaPhotos,
      mediaIntelligence: compactVideoIntelligence(mediaIntelligence),
      editorDocument: editorHistory.present,
      brandLanguage,
      channelProfile,
      shareSlug: shareSlug || undefined,
    };
  }

  async function publishShortShare(
    session: StudioSession,
    options?: { preferredSlug?: string }
  ): Promise<{ slug: string; url: string }> {
    const payload = compactSharePayload(buildSharePayload(session));
    if (payload.image) {
      const c = await compressDataUrl(payload.image, { maxWidth: 960, quality: 0.75 });
      payload.image = c.previewUrl;
    }
    payload.iterations = await Promise.all(
      payload.iterations.map(async (it) => {
        const c = await compressDataUrl(it.image, { maxWidth: 640, quality: 0.72 });
        return { ...it, image: c.previewUrl };
      })
    );
    payload.generatedVariants = await Promise.all(
      payload.generatedVariants.map(async (v) => {
        const c = await compressDataUrl(v.image, { maxWidth: 640, quality: 0.72 });
        return { ...v, image: c.previewUrl };
      })
    );

    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload,
        sessionId: session.id,
        preferredSlug: options?.preferredSlug || session.shareSlug,
        origin:
          typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    });
    const data = await readJsonResponse<{
      error?: string;
      slug?: string;
      url?: string;
    }>(res);
    if (!res.ok || !data.slug) {
      throw new Error(data.error || "Could not create short share link");
    }
    // Always mint the clipboard URL from the public host — never 0.0.0.0 binds.
    return { slug: data.slug, url: publicShareUrl(data.slug) };
  }

  function applySharePayload(payload: SharePayload) {
    setTopic(payload.topic);
    setChannels(payload.channels);
    setHook(payload.hook);
    setComposition(payload.composition);
    setModel(payload.model);
    setImageSize(payload.imageSize);
    setMasterPrompt(payload.masterPrompt);
    setCompositionFactors(payload.compositionFactors);
    setUseOpeningFrames(payload.useOpeningFrames);
    setImage(payload.image);
    setBackend(payload.backend);
    setIterations(payload.iterations);
    setGeneratedVariants(payload.generatedVariants);
    setTitleSuggestions(payload.titleSuggestions);
    setMediaYoutubeUrl(payload.mediaYoutubeUrl || "");
    setMediaScript(payload.mediaScript || "");
    setMediaPhotos(payload.mediaPhotos || []);
    setMediaIntelligence(payload.mediaIntelligence || null);
    if (payload.editorDocument) {
      setEditorHistory(createEditorHistory(payload.editorDocument));
    }
    if (payload.brandLanguage) setBrandLanguage(payload.brandLanguage);
    if (payload.channelProfile) {
      setChannelProfile(payload.channelProfile);
      setChannelProfileInput(payload.channelProfile.channelInput);
    }
    if (payload.image) setCanvasTab("preview");
  }

  async function persistSession() {
    let session = await buildCurrentSession();
    try {
      const published = await publishShortShare(session, {
        preferredSlug: shareSlug || undefined,
      });
      setShareSlug(published.slug);
      session = { ...session, shareSlug: published.slug };
    } catch (err) {
      console.warn("Short share publish skipped", err);
    }
    saveHistorySession(session);
    setHistoryList(listHistory());
    return session;
  }

  function loadFromSession(session: StudioSession) {
    setSessionId(session.id);
    setShareSlug(session.shareSlug || null);
    setTopic(session.topic);
    setChannels(session.channels);
    setHook(session.hook);
    setComposition(session.composition);
    setModel(session.model);
    setImageSize(session.imageSize);
    setMasterPrompt(session.masterPrompt);
    setCompositionFactors(session.compositionFactors);
    setUseOpeningFrames(session.useOpeningFrames);
    setImage(session.image);
    setBackend(session.backend);
    setIterations(session.iterations);
    setGeneratedVariants(session.generatedVariants);
    setTitleSuggestions(session.titleSuggestions);
    setMediaYoutubeUrl(session.mediaYoutubeUrl || "");
    setMediaScript(session.mediaScript || "");
    setMediaPhotos(session.mediaPhotos || []);
    setMediaIntelligence(session.mediaIntelligence || null);
    if (session.editorDocument) {
      setEditorHistory(createEditorHistory(session.editorDocument));
    } else {
      setEditorHistory(createEditorHistory(createEmptyDocument(session.image)));
    }
    if (session.brandLanguage) setBrandLanguage(session.brandLanguage);
    if (session.channelProfile) {
      setChannelProfile(session.channelProfile);
      setChannelProfileInput(session.channelProfile.channelInput);
    }
    if (session.image) setCanvasTab("preview");
  }

  async function handleShareLink() {
    try {
      const session = await buildCurrentSession();
      const published = await publishShortShare(session, {
        preferredSlug: shareSlug || session.shareSlug,
      });
      setShareSlug(published.slug);
      saveHistorySession({ ...session, shareSlug: published.slug });
      setHistoryList(listHistory());
      await navigator.clipboard.writeText(published.url);
      toast.success(`Short link copied: /s/${published.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share failed");
    }
  }

  async function handleShareSavedSession(session: StudioSession) {
    try {
      const published = await publishShortShare(session, {
        preferredSlug: session.shareSlug,
      });
      saveHistorySession({ ...session, shareSlug: published.slug });
      setHistoryList(listHistory());
      if (session.id === sessionId) setShareSlug(published.slug);
      await navigator.clipboard.writeText(published.url);
      toast.success(`Short link copied: /s/${published.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share failed");
    }
  }

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
    setRejectedInspirations([]);
    setFilterSummary("");
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

  const generationContextSummary = useMemo(
    () =>
      buildGenerationContextSummary({
        topic,
        hook,
        topicContext: topicContext || undefined,
        styleBrief: styleBrief || undefined,
        selectedPalette: selectedPalette || undefined,
        mediaIntelligence: intelligenceForGeneration(mediaIntelligence),
        brandLanguage,
        channelProfile: channelProfile || undefined,
        userBrief: mediaScript.trim() || undefined,
        feedback: inspirations
          .filter((item) => feedback[item.videoId]?.rating || feedback[item.videoId]?.comment)
          .map((item) => ({
            videoId: item.videoId,
            title: item.title,
            channel: item.channel,
            rating: feedback[item.videoId]?.rating ?? null,
            comment: feedback[item.videoId]?.comment || "",
          })),
        selectedRefCount: selectedIds.size,
        useOpeningFrames,
        userMediaPhotoCount: mediaPhotos.length || undefined,
      }),
    [
      topic,
      hook,
      topicContext,
      styleBrief,
      selectedPalette,
      mediaIntelligence,
      brandLanguage,
      channelProfile,
      mediaScript,
      inspirations,
      feedback,
      selectedIds,
      useOpeningFrames,
      mediaPhotos.length,
    ]
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

  useEffect(() => {
    if (likedVideos.length === 0 || palettes.length > 0 || suggestingPalettes) return;
    if (normalizeStudioTab(studioTab) !== "research") return;

    if (paletteAutoTimerRef.current) clearTimeout(paletteAutoTimerRef.current);
    paletteAutoTimerRef.current = setTimeout(() => {
      void suggestPalettes(undefined, undefined, undefined, { silent: true });
    }, 800);

    return () => {
      if (paletteAutoTimerRef.current) clearTimeout(paletteAutoTimerRef.current);
    };
  }, [likedVideos.length, palettes.length, suggestingPalettes, studioTab]);

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
        body: JSON.stringify({
          title: topic,
          channels,
          hook: hook || undefined,
          filterMode: lightFilter ? "light" : "strict",
          lightFilter,
        }),
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
            if (!results.length) throw new Error("No thumbnails matched this title");

            setInspirations(results);
            setRejectedInspirations((event.rejectedResults as RejectedInspirationVideo[]) || []);
            setFilterSummary(String(event.filterSummary || ""));
            setSelectedIds(
              autoSelect ? new Set(results.map((r) => r.videoId)) : new Set()
            );
            setTitleSuggestions((event.titleSuggestions as string[]) || []);
            setStyleBrief((event.styleBrief as StyleBrief) || null);
            setTopicContext((event.topicContext as TopicContext) || null);
            setSearchSource(
              [
                event.youtubeQuery
                  ? `YT query: "${String(event.youtubeQuery)}"`
                  : null,
                event.source,
                event.filterMode === "light" ? "YouTube order top 8" : null,
                event.qualityRejected ? `${event.qualityRejected} rejected` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            );
            setSearchProgress(100);
            setSearchStatus(
              event.youtubeQuery
                ? `Research complete · YouTube query: "${String(event.youtubeQuery)}"`
                : "Research complete"
            );
            setStudioTab("research");
            // Do not auto-fill hook from styleBrief.suggestedHook.
            toast.success(
              lightFilter
                ? `Top ${results.length} for "${String(event.youtubeQuery || topic)}" (YouTube order)`
                : `Found ${results.length} title-matched thumbnails`
            );
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

  function mergeLikedTitlesIntoSuggestions(liked: InspirationVideo[]) {
    const likedTitles = liked.map((v) => v.title).filter(Boolean);
    if (!likedTitles.length) return;
    setTitleSuggestions((prev) => {
      const merged = [...likedTitles, ...prev];
      return merged.filter(
        (t, i) =>
          t.trim() &&
          merged.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i
      ).slice(0, 10);
    });
  }

  function applyRating(videoId: string, rating: "like" | "dislike", comment: string) {
    setFeedback((prev) => ({
      ...prev,
      [videoId]: { rating, comment },
    }));
    if (rating === "like") {
      setSelectedIds((prev) => new Set(prev).add(videoId));
      const withCurrent = inspirations.filter(
        (v) => v.videoId === videoId || feedback[v.videoId]?.rating === "like"
      );
      mergeLikedTitlesIntoSuggestions(withCurrent);
    }
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
    feedbackOverride?: ThumbnailFeedback[],
    options?: { silent?: boolean }
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
      // Do not auto-fill hook from palette styleBrief.
      if (!options?.silent) {
        const src = data.source === "pixels" || data.source === "pixels+gemini"
          ? "sampled from liked thumbs"
          : "fallback";
        toast.success(`${next.length} palettes ${src}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Palette suggestion failed");
    } finally {
      setSuggestingPalettes(false);
    }
  }

  type ShellTab = Exclude<StudioTab, "media">;

  function handleStudioTabChange(tab: ShellTab) {
    const next = normalizeStudioTab(tab);
    const current = normalizeStudioTab(studioTab);
    setStudioTab(next);

    const enteringStyle = next === "style" && current !== "style";
    if (
      enteringStyle &&
      likedVideos.length > 0 &&
      !palettes.length &&
      !suggestingPalettes
    ) {
      void suggestPalettes(undefined, undefined, undefined, { silent: true });
    }
  }

  function openFeedback(item: InspirationVideo, mode: FeedbackMode) {
    const current = feedback[item.videoId]?.rating;
    const existingComment = feedback[item.videoId]?.comment || "";

    // Toggle off if clicking the same rating again
    if (mode === "like" && current === "like") {
      setFeedback((prev) => ({
        ...prev,
        [item.videoId]: { rating: null, comment: prev[item.videoId]?.comment || "" },
      }));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.videoId);
        return next;
      });
      return;
    }
    if (mode === "dislike" && current === "dislike") {
      setFeedback((prev) => ({
        ...prev,
        [item.videoId]: { rating: null, comment: prev[item.videoId]?.comment || "" },
      }));
      return;
    }

    if (mode === "explore") {
      if (current !== "like") {
        // Auto-like so Explore isn't dead, then open notes — palettes wait for explicit suggest.
        applyRating(item.videoId, "like", existingComment);
        toast.success("Liked. Add a note or find similar");
      }
      setFeedbackDialog({ open: true, mode: "explore", item });
      return;
    }

    // Like / dislike apply immediately so button state updates right away
    applyRating(item.videoId, mode, existingComment);
    if (mode === "like") {
      toast.success("Liked — palettes suggest automatically when you continue");
    } else {
      toast.success("Disliked");
    }
    setFeedbackDialog({ open: true, mode, item });
  }

  function handleFeedbackSave(comment: string) {
    const { mode, item } = feedbackDialog;
    if (!mode || !item || mode === "explore") return;
    applyRating(item.videoId, mode, comment);
    setFeedbackDialog({ open: false, mode: null, item: null });
    toast.success(mode === "like" ? "Note saved on like" : "Note saved on dislike");
  }

  async function exploreSimilar(item: InspirationVideo, comment?: string) {
    const note = comment ?? feedback[item.videoId]?.comment ?? "";
    applyRating(item.videoId, "like", note);

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
              comment: note,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Similar search failed");

      const similar = (data.results || []) as InspirationVideo[];
      const rejected = (data.rejectedResults || []) as RejectedInspirationVideo[];

      if (rejected.length) {
        setRejectedInspirations((prev) => {
          const ids = new Set(prev.map((v) => v.videoId));
          return [...prev, ...rejected.filter((v) => !ids.has(v.videoId))];
        });
        if (data.filterSummary) {
          setFilterSummary(String(data.filterSummary));
        }
      }

      if (!similar.length) {
        toast.info(
          rejected.length
            ? `No similar thumbnails passed the filter (${rejected.length} dropped)`
            : "No similar premium thumbnails found"
        );
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
      const toastParts = [`Added ${similar.length} similar thumbnails`];
      if (rejected.length) toastParts.push(`${rejected.length} dropped`);
      toast.success(toastParts.join(", "));
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
    seedVariant?: { image: string; label: string; note?: string };
  }) {
    const selected = inspirations.filter((item) => selectedIds.has(item.videoId));
    const isIteration = Boolean(opts?.iterationNote?.trim());
    const isSeedSimilar = Boolean(opts?.seedVariant?.image);

    // Scratch mode: topic (+ optional hook) is enough. Refs / media / likes are optional.

    const brief = applyPaletteToBrief(styleBrief, selectedPalette) || styleBrief;
    // Never let a stale suggestedHook ride along when the form hook is empty.
    const briefForGenerate =
      brief && !hook.trim()
        ? { ...brief, suggestedHook: undefined }
        : brief;

    let compressedBase: string | undefined;
    let compressedAssets = opts?.editAssets || [];
    if (isIteration && opts?.baseImage) {
      const c = await compressDataUrl(opts.baseImage, { maxWidth: 1280, quality: 0.82 });
      compressedBase = c.data;
      compressedAssets = await Promise.all(
        (opts.editAssets || []).map(async (a) => {
          const ac = await compressDataUrl(`data:${a.mimeType};base64,${a.data}`, {
            maxWidth: 1024,
            quality: 0.8,
          });
          return { ...a, mimeType: ac.mimeType, data: ac.data, previewUrl: ac.previewUrl };
        })
      );
    }

    let compressedSeed: { data: string; label: string; note?: string } | undefined;
    if (isSeedSimilar && opts?.seedVariant) {
      const c = await compressDataUrl(opts.seedVariant.image, { maxWidth: 1280, quality: 0.82 });
      compressedSeed = {
        data: c.data,
        label: opts.seedVariant.label,
        note: opts.seedVariant.note,
      };
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        hook,
        composition: composition === "auto" ? "" : composition,
        model: model === "default" ? "" : model,
        imageSize,
        styleBrief: briefForGenerate,
        masterPrompt,
        useOpeningFrames,
        openingFrames:
          useOpeningFrames && !isIteration
            ? readyOpeningFrames.map((f) => ({
                mimeType: f.mimeType,
                data: f.data,
                label: f.label,
              }))
            : [],
        compositionFactors,
        selectedPalette,
        paletteOptions: palettes,
        variantCount: isIteration ? 1 : 4,
        inspirations: selected,
        feedback: buildFeedbackPayload(),
        titleSuggestions,
        likedTitles: likedVideos.map((v) => v.title),
        mediaIntelligence: intelligenceForGeneration(mediaIntelligence),
        brandLanguage,
        channelProfile: channelProfile || undefined,
        userBrief: mediaScript.trim() || undefined,
        userMediaPhotoCount: mediaPhotos.length || undefined,
        topicContext: topicContext || undefined,
        seedVariant: compressedSeed
          ? {
              image: compressedSeed.data,
              label: compressedSeed.label,
              note:
                compressedSeed.note ||
                `More variants inspired by "${compressedSeed.label}" — same story direction, varied camera and type.`,
            }
          : undefined,
        iterationNote: opts?.iterationNote,
        iterationIndex: opts?.iterationIndex,
        baseImage: compressedBase ?? opts?.baseImage?.replace(/^data:[^;]+;base64,/, ""),
        assets: isIteration
          ? compressedAssets.map((a) => ({
              mimeType: a.mimeType,
              data: a.data,
              label: a.name,
            }))
          : mediaPhotos.map((photo) => ({
              mimeType: photo.mimeType,
              data: photo.data,
              label: `Media photo: ${photo.name}`,
            })),
      }),
      signal: AbortSignal.timeout(240_000),
    });

    let data: {
      error?: string;
      images?: Array<{
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
      }>;
      image?: string;
      backend?: string;
      pipeline?: PipelineOverview;
      variantStats?: { requested?: number; succeeded?: number };
    };
    try {
      data = await res.json();
    } catch {
      throw new Error(
        res.status === 504 || res.status === 502
          ? "Generation timed out. Switch to 1K, drop extra refs or photos, then retry."
          : `Generation failed (${res.status})`
      );
    }
    if (!res.ok) throw new Error(data.error || "Generation failed");
    return data;
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    if (useOpeningFrames && readyOpeningFrames.length === 0) {
      toast.error("Upload a video. We'll sample the full runtime for the best thumbnail still");
      return;
    }

    if (likedVideos.length && !palettes.length) {
      await suggestPalettes(undefined, undefined, undefined, { silent: true });
    }

    setLoading(true);
    setError("");
    setCanvasTab("preview");
    setGeneratedVariants([]);

    try {
      const data = await runGeneration();
      const variants: GeneratedVariant[] = Array.isArray(data.images)
        ? data.images.map((v) => ({
              id: v.id,
              image: `data:image/png;base64,${v.image}`,
              label: v.label,
              suggestedTitle: v.suggestedTitle || v.label,
              paletteId: v.paletteId,
              paletteName: v.paletteName,
              composition: v.composition,
              compositionLabel: v.compositionLabel,
              cameraFilter: v.cameraFilter,
              cameraFilterLabel: v.cameraFilterLabel,
              compositionFactor: v.compositionFactor,
              compositionFactorLabel: v.compositionFactorLabel,
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
      const stats = data.variantStats as { requested?: number; succeeded?: number } | undefined;
      toast.success(
        variants.length >= 4
          ? `4 thumbnail combinations ready`
          : variants.length > 1
            ? `${variants.length} of ${stats?.requested || 4} combinations ready`
            : variants.length === 1
              ? "Only 1 variant succeeded. Try again with 1K"
              : "Thumbnail generated"
      );
      void persistSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateSimilar(variant: GeneratedVariant) {
    if (!topic.trim()) return;

    setGeneratingSimilarId(variant.id);
    setLoading(true);
    setError("");
    setCanvasTab("preview");
    setGeneratedVariants([]);

    try {
      const data = await runGeneration({
        seedVariant: {
          image: variant.image,
          label: variant.suggestedTitle || variant.label,
          note: `Generate siblings inspired by this output — keep story, setting, and hook energy (${variant.cameraFilterLabel || "variant"} · ${variant.compositionFactorLabel || "framing"}).`,
        },
      });
      const variants: GeneratedVariant[] = Array.isArray(data.images)
        ? data.images.map((v) => ({
            id: v.id,
            image: `data:image/png;base64,${v.image}`,
            label: v.label,
            suggestedTitle: v.suggestedTitle || v.label,
            paletteId: v.paletteId,
            paletteName: v.paletteName,
            composition: v.composition,
            compositionLabel: v.compositionLabel,
            cameraFilter: v.cameraFilter,
            cameraFilterLabel: v.cameraFilterLabel,
            compositionFactor: v.compositionFactor,
            compositionFactorLabel: v.compositionFactorLabel,
          }))
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
          ? `${variants.length} similar variants from your pick`
          : "Similar variant ready"
      );
      void persistSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Similar generation failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setGeneratingSimilarId(null);
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
      void persistSession();
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

  async function handleAnalyzeChannelProfile() {
    const input = channelProfileInput.trim() || channels.trim().split("\n")[0]?.trim();
    if (!input) {
      toast.error("Enter a channel URL or handle");
      return;
    }
    setAnalyzingChannel(true);
    try {
      const res = await fetch("/api/channel-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: input, topic: topic.trim() || "channel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Channel analysis failed");
      setChannelProfile(data.profile as ChannelProfile);
      setChannelProfileInput(input);
      toast.success(`Channel profile ready · ${data.profile.evidence?.length || 0} evidence thumbnails`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Channel analysis failed");
    } finally {
      setAnalyzingChannel(false);
    }
  }

  async function handleExportDesignPack() {
    if (!image && generatedVariants.length === 0) {
      toast.error("Generate a thumbnail before exporting a design pack");
      return;
    }
    setExportingDesignPack(true);
    try {
      const selectedPalette = palettes.find((p) => p.id === selectedPaletteId) || null;
      const { metadata, flattenedImage } = await exportDesignPack({
        topic,
        hook,
        activeImage: image,
        paletteColors: selectedPalette?.colors || styleBrief?.colorPalette || [],
        paletteId: selectedPalette?.id,
        paletteName: selectedPalette?.name,
        editorDoc: editorHistory.present,
        mediaIntelligence,
        channelProfile,
        brandLanguage,
        variants: generatedVariants,
      });
      const uploaded = await uploadDesignPackToStorage(metadata, flattenedImage || image || undefined);
      if (uploaded.metadataUrl) {
        toast.success("Design pack exported and metadata uploaded to Cohesivity storage");
      } else {
        toast.success("Design pack downloaded (PNG variants + metadata.json)");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Design pack export failed");
    } finally {
      setExportingDesignPack(false);
    }
  }

  return (
    <>
      <StudioShell
        tab={studioTab}
        onTabChange={handleStudioTabChange}
        geminiStatus={geminiStatus}
        counts={{
          photos: mediaPhotos.length + openingFrames.length,
          refs: inspirations.length,
          selected: selectedIds.size,
          variants: generatedVariants.length,
        }}
        researchNextExtra={
          likedVideos.length > 0 && palettes.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={suggestingPalettes}
              onClick={() => void suggestPalettes()}
            >
              {suggestingPalettes ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh palettes
            </Button>
          ) : null
        }
        headerActions={
          <>
            <ExportNavMenu
              title={topic}
              topic={topic}
              hook={hook}
              image={image}
              editorDocument={editorHistory.present}
              disabled={loading}
              onDownloadPng={handleDownload}
              onExportDesignPack={() => void handleExportDesignPack()}
              exportingDesignPack={exportingDesignPack}
            />
            <HistoryMenu
              history={historyList}
              onLoad={loadFromSession}
              onDelete={(id) => {
                deleteHistorySession(id);
                setHistoryList(listHistory());
              }}
              onShare={handleShareLink}
              onShareSession={handleShareSavedSession}
              onSave={() =>
                void persistSession().then((session) =>
                  toast.success(
                    session.shareSlug
                      ? `Saved · /s/${session.shareSlug}`
                      : "Session saved"
                  )
                )
              }
            />
          </>
        }
        generateAction={
          <ShimmerButton
            type="submit"
            form="generate-form"
            disabled={loading || !topic.trim()}
            borderRadius="8px"
            background="rgba(0, 0, 0, 1)"
            className="h-9 gap-1.5 px-4 text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <>
                <LoaderCircle className="size-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Generate variants
              </>
            )}
          </ShimmerButton>
        }
        briefAction={
          <div className="flex items-center gap-2">
            <Checkbox
              id="autoSelect"
              checked={autoSelect}
              onCheckedChange={(v) => setAutoSelect(v === true)}
            />
            <Label
              htmlFor="autoSelect"
              className="cursor-pointer font-normal text-[var(--text-tertiary)]"
            >
              Auto-select refs
            </Label>
          </div>
        }
        briefPanel={
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start">
                <div className="space-y-1.5">
                  <Label htmlFor="topic">Video title</Label>
                  <Input
                    id="topic"
                    placeholder="How Alcohol Is Made in India"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="channels">
                    Channels{" "}
                    <span className="font-normal text-[var(--text-tertiary)]">
                      optional
                    </span>
                  </Label>
                  <Input
                    id="channels"
                    placeholder="@channel"
                    value={channels}
                    onChange={(e) => setChannels(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hook-topic">
                  Hook{" "}
                  <span className="font-normal text-[var(--text-tertiary)]">
                    optional
                  </span>
                </Label>
                <Input
                  id="hook-topic"
                  placeholder="HOW IT'S MADE"
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  aria-describedby="hook-topic-hint"
                />
                <p
                  id="hook-topic-hint"
                  className="type-caption text-[var(--text-tertiary)]"
                >
                  Text burned onto the thumbnail. Leave blank for none.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => void handleResearch()}
                  disabled={searching || exploring || !topic.trim()}
                >
                  {searching ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      Searching
                    </>
                  ) : (
                    <>
                      <Telescope className="size-4" />
                      Research refs
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="lightFilter"
                    checked={lightFilter}
                    onCheckedChange={(v) => setLightFilter(v === true)}
                  />
                  <Label
                    htmlFor="lightFilter"
                    className="cursor-pointer font-normal text-[var(--text-secondary-chromatic)]"
                  >
                    Light Gemini filter (top 8)
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[var(--text-secondary-chromatic)] hover:text-[#171618]"
                  disabled={!topic.trim()}
                  onClick={() => setStudioTab("generate")}
                >
                  Skip to Generate
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              <p className="type-caption text-[var(--text-tertiary)]">
                {lightFilter
                  ? "Sends your title as-is to YouTube and shows the top 8 in YouTube's order. Gemini drops wrong visual context using topic understanding."
                  : "Strict mode: expands queries and keeps only strong title matches."}
              </p>
            </section>

            <section className="space-y-3 border-t border-[#efefef] pt-5">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="type-ui text-[#171618]">Media</h3>
                  <Badge
                    variant="outline"
                    className="border-[#c8c9cb] font-normal type-caption text-[#5c5e60]"
                  >
                    Optional
                  </Badge>
                </div>
                <p className="type-caption leading-snug text-[#5c5e60]">
                  Person, product, backdrop, YouTube URL, or key frames — skip if you only have a title.
                </p>
              </div>
              <MediaIntelligencePanel
                youtubeUrl={mediaYoutubeUrl}
                onYoutubeUrlChange={setMediaYoutubeUrl}
                script={mediaScript}
                onScriptChange={setMediaScript}
                photos={mediaPhotos}
                onUploadPhotos={(files) => void handleUploadMediaPhotos(files)}
                onRemovePhoto={(id) =>
                  setMediaPhotos((previous) =>
                    previous.filter((photo) => photo.id !== id)
                  )
                }
                openingFramesSlot={
                  <OpeningFramesPanel
                    useOpeningFrames={useOpeningFrames}
                    onUseOpeningFramesChange={setUseOpeningFrames}
                    openingFrames={openingFrames}
                    onUpload={(file) => void streamOpeningFrame(file)}
                    onYoutubeUrl={(url) => ingestYoutubeUrl(url)}
                    onRemove={(id) => {
                      videoFilesRef.current.delete(id);
                      setOpeningFrames((previous) =>
                        previous.filter((clip) => clip.id !== id)
                      );
                    }}
                    onSelectFrame={selectOpeningFrame}
                    inputId="opening-video-upload-research"
                  />
                }
                analyzing={analyzingMedia}
                analysisProgress={mediaAnalysisProgress}
                result={mediaIntelligence}
                selectedHook={hook}
                onSelectHook={setHook}
                onAnalyze={() => void handleAnalyzeMedia()}
                canAnalyze={Boolean(
                  topic.trim() ||
                    mediaYoutubeUrl.trim() ||
                    mediaScript.trim() ||
                    mediaPhotos.length ||
                    readyOpeningFrames.length
                )}
              />
            </section>
          </div>
        }
        researchPanel={
          <div className="space-y-4">
            {(inspirations.length > 0 ||
              likedVideos.length > 0 ||
              palettes.length > 0 ||
              Boolean(mediaIntelligence)) && (
              <PalettePicker
                palettes={palettes}
                selectedId={selectedPaletteId}
                loading={suggestingPalettes}
                hasLikes={likedVideos.length > 0}
                hasMediaColors={Boolean(mediaIntelligence?.palettes.length)}
                sourceLabel={
                  mediaIntelligence?.colors.source === "measured"
                    ? "Measured from supplied media"
                    : mediaIntelligence
                      ? "Neutral fallback from content context"
                      : "Extracted from liked thumbs"
                }
                paletteRatings={paletteRatings}
                onSelect={(p) => {
                  setSelectedPaletteId(p.id);
                  setStyleBrief((prev) => applyPaletteToBrief(prev, p) || prev);
                }}
                onUpdate={(p) => {
                  setPalettes((prev) => prev.map((x) => (x.id === p.id ? p : x)));
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

            {(inspirations.length > 0 ||
              rejectedInspirations.length > 0 ||
              searching) && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="type-caption text-[var(--text-tertiary)]">
                    {inspirations.length} kept
                    {rejectedInspirations.length
                      ? `, ${rejectedInspirations.length} dropped`
                      : ""}
                    {searchSource ? `, ${searchSource}` : ""}
                    {exploreLabel && !exploring ? `, similar to “${exploreLabel}”` : ""}
                  </p>
                  <Badge variant="secondary" className="tabular-nums">
                    {selectedIds.size} selected
                  </Badge>
                </div>
                {inspirations.length > 0 ? (
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
                ) : null}
                {/* rejects hidden — re-enable when debugging filter */}
                {/* <RejectedInspirationGrid
                  items={rejectedInspirations}
                  summary={filterSummary || undefined}
                /> */}
                {likedVideos.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[#efefef] pt-3">
                    <p className="type-caption text-[var(--text-tertiary)]">
                      {palettes.length > 0
                        ? "Palettes ready — continue to Style or refresh for new options."
                        : "Done selecting? Continue to Style — palettes suggest automatically."}
                    </p>
                    {palettes.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={suggestingPalettes}
                        onClick={() => void suggestPalettes()}
                      >
                        {suggestingPalettes ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        Refresh palettes
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {!inspirations.length && !rejectedInspirations.length && !searching && (
              <div className="space-y-4">
                <p className="type-caption leading-snug text-[var(--text-tertiary)]">
                  No refs yet. Research a topic, or skip to Generate.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!topic.trim() || searching}
                    onClick={() => void handleResearch()}
                  >
                    <Telescope className="size-4" />
                    Run research
                  </Button>
                  <Button variant="ghost" onClick={() => setStudioTab("generate")}>
                    Skip to Generate
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        }
        stylePanel={
          <div className="space-y-4">
            <ChannelProfilePanel
              channelInput={channelProfileInput}
              topic={topic}
              profile={channelProfile}
              loading={analyzingChannel}
              onChannelInputChange={setChannelProfileInput}
              onAnalyze={() => void handleAnalyzeChannelProfile()}
              onClear={() => {
                setChannelProfile(null);
                setChannelProfileInput("");
              }}
            />

            <BrandLanguagePanel language={brandLanguage} onChange={setBrandLanguage} />

            <section className="space-y-3 border-t border-[#efefef] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="type-ui text-[#171618]">Quality direction</h3>
                  <p className="mt-1 type-caption text-[var(--text-tertiary)]">
                    Master prompt for every generation
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMasterPrompt(DEFAULT_MASTER_PROMPT)}
                >
                  Reset default
                </Button>
              </div>
              <Textarea
                id="master-prompt"
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
                rows={6}
                className="min-h-[120px] resize-y type-ui font-normal leading-relaxed"
                placeholder="Master quality prompt used for every generation…"
              />
            </section>

            <section className="space-y-2 border-t border-[#efefef] pt-5">
              <h3 className="type-ui text-[#171618]">Composition factors</h3>
              <p className="type-caption text-[var(--text-tertiary)]">
                Optional framing. Applied only when it fits the scene.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {COMPOSITION_FACTORS.map((factor) => {
                  const active = compositionFactors.includes(factor.id);
                  return (
                    <Button
                      key={factor.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      title={factor.prompt}
                      className="rounded-[var(--radius-buttons)]"
                      onClick={() =>
                        setCompositionFactors((prev) =>
                          prev.includes(factor.id)
                            ? prev.filter((id) => id !== factor.id)
                            : [...prev, factor.id]
                        )
                      }
                    >
                      {factor.label}
                    </Button>
                  );
                })}
              </div>
              {styleBrief?.summary ? (
                <p className="type-caption text-[var(--text-tertiary)]">
                  Research note: {styleBrief.summary}
                </p>
              ) : null}
            </section>
          </div>
        }
        generatePanel={
          <div className="space-y-5">
              <section className="space-y-3 rounded-[20px] border border-[#efefef] bg-[#f7f7f7] p-4">
                <div>
                  <p className="type-ui text-[#171618]">Generation context</p>
                  <p className="mt-0.5 type-caption text-[#5c5e60]">
                    What the model will use on the next run
                  </p>
                </div>
                <p className="type-ui text-[#171618]">{generationContextSummary.headline}</p>
                {generationContextSummary.items.length > 0 ? (
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {generationContextSummary.items.map((item) => (
                      <div key={item.label} className="min-w-0">
                        <dt className="type-caption text-[#5c5e60]">{item.label}</dt>
                        <dd className="type-ui font-normal text-[#171618] line-clamp-2">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="type-caption text-[#5c5e60]">
                    Add research, media, or a hook to strengthen context before generating.
                  </p>
                )}
              </section>

              <form
                id="generate-form"
                onSubmit={handleGenerate}
                className="grid gap-3 sm:grid-cols-2"
              >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="hook">
                    Hook{" "}
                    <span className="font-normal text-[var(--text-tertiary)]">
                      optional
                    </span>
                  </Label>
                  <Input
                    id="hook"
                    placeholder="HOW IT'S MADE"
                    value={hook}
                    onChange={(e) => setHook(e.target.value)}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
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
                <div className="min-w-0 space-y-1.5">
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
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
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

              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                <Label>Active palette</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={suggestingPalettes || likedVideos.length === 0}
                  onClick={() => void suggestPalettes()}
                >
                  {suggestingPalettes ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Resuggest
                </Button>
              </div>

              {palettes.length > 0 ? (
                <div className="space-y-3">
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="radiogroup"
                    aria-label="Active palette"
                  >
                    {palettes.map((p) => {
                      const active = selectedPaletteId === p.id;
                      return (
                        <Button
                          key={p.id}
                          type="button"
                          size="sm"
                          role="radio"
                          aria-checked={active}
                          variant={active ? "default" : "outline"}
                          className="gap-1.5 rounded-[var(--radius-buttons)]"
                          onClick={() => {
                            setSelectedPaletteId(p.id);
                            setStyleBrief((prev) => applyPaletteToBrief(prev, p) || prev);
                          }}
                        >
                          <span className="flex gap-0.5">
                            {p.colors.slice(0, 4).map((c, i) => (
                              <span
                                key={`${p.id}-chip-${i}`}
                                className="size-2.5 rounded-full border border-white/40"
                                style={{ background: c.startsWith("#") ? c : `#${c}` }}
                              />
                            ))}
                          </span>
                          {p.name}
                        </Button>
                      );
                    })}
                  </div>
                  {selectedPalette && (
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedPalette.colors.map((c, index) => (
                        <ColorPicker
                          key={`${selectedPalette.id}-${index}`}
                          compact
                          label={`Color ${index + 1}`}
                          value={c.startsWith("#") ? c : `#${c}`}
                          onChange={(hex) => {
                            const next = {
                              ...selectedPalette,
                              colors: selectedPalette.colors.map((color, i) =>
                                i === index ? hex : color
                              ),
                              name: /custom/i.test(selectedPalette.name)
                                ? selectedPalette.name
                                : `${selectedPalette.name} · custom`,
                            };
                            setPalettes((prev) =>
                              prev.map((x) => (x.id === next.id ? next : x))
                            );
                            setStyleBrief((prev) => applyPaletteToBrief(prev, next) || prev);
                          }}
                        />
                      ))}
                      {selectedPalette.rationale && (
                        <span className="min-w-0 flex-1 truncate type-caption text-muted-foreground">
                          {selectedPalette.rationale}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                (selectedPalette || styleBrief?.colorPalette?.length) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-caption text-muted-foreground">
                      {selectedPalette ? selectedPalette.name : "Palette"}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(selectedPalette?.colors || styleBrief?.colorPalette || []).map(
                        (c, index) => (
                          <ColorPicker
                            key={`${selectedPalette?.id || "brief"}-${index}`}
                            compact
                            label={`Color ${index + 1}`}
                            value={c.startsWith("#") ? c : `#${c}`}
                            onChange={(hex) => {
                              if (selectedPalette) {
                                const next = {
                                  ...selectedPalette,
                                  colors: selectedPalette.colors.map((color, i) =>
                                    i === index ? hex : color
                                  ),
                                  name: /custom/i.test(selectedPalette.name)
                                    ? selectedPalette.name
                                    : `${selectedPalette.name} · custom`,
                                };
                                setPalettes((prev) =>
                                  prev.map((x) => (x.id === next.id ? next : x))
                                );
                                setStyleBrief(
                                  (prev) => applyPaletteToBrief(prev, next) || prev
                                );
                                return;
                              }
                              if (styleBrief?.colorPalette?.length) {
                                const colors = styleBrief.colorPalette.map((color, i) =>
                                  i === index ? hex : color
                                );
                                setStyleBrief({ ...styleBrief, colorPalette: colors });
                              }
                            }}
                          />
                        )
                      )}
                    </div>
                  </div>
                )
              )}

            {error && (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 type-caption text-muted-foreground">
              {error}
              </p>
            )}
          </div>
        }
        canvas={
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
            onExportDesignPack={() => void handleExportDesignPack()}
            exportingDesignPack={exportingDesignPack}
            assets={assets}
            onAssetsChange={setAssets}
            hook={hook}
            editorHistory={editorHistory}
            onEditorHistoryChange={setEditorHistory}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            generatedVariants={generatedVariants}
            onPickVariant={(v) => {
              setImage(v.image);
              setBackend("");
              setCanvasTab("preview");
            }}
            onGenerateSimilar={(v) => void handleGenerateSimilar(v)}
            generatingSimilarId={generatingSimilarId}
            paletteColors={selectedPalette?.colors || styleBrief?.colorPalette || []}
            paletteName={selectedPalette?.name}
          />
        }
      />

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
            ? `Analyzing “${exploreLabel}” and searching similar refs…`
            : "Searching similar refs…"
        }
      />

      <StatusDialog
        open={loading}
        title="Generating combinations"
        message={
          generatingSimilarId
            ? "Generating variants inspired by your selected thumbnail…"
            : mediaIntelligence
              ? "Using media context, topic setting, and selected hook…"
              : topicContext?.setting
                ? `Grounding on "${topicContext.setting}" with liked refs and palette…`
                : useOpeningFrames
                  ? "Using full-video stills to build variants…"
                  : "Building 3-4 variants from research context and palette…"
        }
      />

      <StatusDialog
        open={suggestingPalettes}
        title="Picking colors from likes"
        message="Reading liked thumbnail images to suggest palettes…"
      />
    </>
  );
}
