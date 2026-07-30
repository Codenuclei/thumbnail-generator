import type { GeneratedVariant } from "@/components/GenerationCanvas";
import type {
  PersistedMediaPhoto,
  VideoIntelligenceResult,
} from "@/lib/video-intelligence-types";
import type { EditorDocument } from "@/lib/editor-types";
import type { BrandLanguage } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";

export type StudioIteration = {
  image: string;
  note: string;
  backend: string;
  index: number;
};

export type StudioSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  topic: string;
  channels: string;
  hook: string;
  composition: string;
  model: string;
  imageSize: string;
  masterPrompt: string;
  /** True only if the user manually edited the master prompt textarea. When false/absent, callers should re-sync to the current DEFAULT_MASTER_PROMPT instead of trusting this stored (possibly stale) string. */
  masterPromptCustomized?: boolean;
  compositionFactors: string[];
  useOpeningFrames: boolean;
  image: string | null;
  backend: string;
  iterations: StudioIteration[];
  generatedVariants: GeneratedVariant[];
  titleSuggestions: string[];
  mediaYoutubeUrl?: string;
  mediaScript?: string;
  mediaPhotos?: PersistedMediaPhoto[];
  mediaIntelligence?: VideoIntelligenceResult | null;
  editorDocument?: EditorDocument | null;
  brandLanguage?: BrandLanguage | null;
  channelProfile?: ChannelProfile | null;
  /** Short Cohesivity-backed share slug, e.g. how-its-made-k7m2xp */
  shareSlug?: string;
};

const HISTORY_KEY = "thumbnail-studio-history";
const DRAFT_KEY = "thumbnail-studio-draft";
const MAX_HISTORY = 40;

export type StudioDraft = {
  topic: string;
  channels: string;
  hook: string;
  composition: string;
  model: string;
  imageSize: string;
  masterPrompt: string;
  masterPromptCustomized?: boolean;
  compositionFactors: string[];
  useOpeningFrames: boolean;
  mediaYoutubeUrl?: string;
  mediaScript?: string;
  mediaPhotos?: PersistedMediaPhoto[];
  mediaIntelligence?: VideoIntelligenceResult | null;
  editorDocument?: EditorDocument | null;
  brandLanguage?: BrandLanguage | null;
  channelProfile?: ChannelProfile | null;
};

export function loadDraft(): StudioDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as StudioDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: StudioDraft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Keep text and analysis when browser quota cannot hold all compressed photo previews.
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...draft, mediaPhotos: [] })
      );
    } catch {
      // Storage may be unavailable in private/restricted browser contexts.
    }
  }
}

export function listHistory(): StudioSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudioSession[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function saveHistorySession(
  session: StudioSession,
  options?: { bumpUpdatedAt?: boolean }
): void {
  if (typeof window === "undefined") return;
  const bump = options?.bumpUpdatedAt !== false;
  const list = listHistory().filter((s) => s.id !== session.id);
  list.unshift({
    ...session,
    updatedAt: bump ? Date.now() : session.updatedAt,
  });
  // Keep newest-first even when preserving timestamps from migration.
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    const compact = list.slice(0, Math.min(10, MAX_HISTORY)).map((item) => ({
      ...item,
      mediaPhotos: [],
      generatedVariants: item.generatedVariants.slice(0, 1),
      iterations: item.iterations.slice(-2),
    }));
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(compact));
    } catch {
      // Leave the previous history intact when storage is unavailable.
    }
  }
}

export function getHistorySession(id: string): StudioSession | null {
  return listHistory().find((s) => s.id === id) ?? null;
}

export function deleteHistorySession(id: string): void {
  if (typeof window === "undefined") return;
  const list = listHistory().filter((s) => s.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

/** Compress session for URL sharing (images as smaller refs). */
export type SharePayload = {
  v: 1;
  topic: string;
  channels: string;
  hook: string;
  composition: string;
  model: string;
  imageSize: string;
  masterPrompt: string;
  masterPromptCustomized?: boolean;
  compositionFactors: string[];
  useOpeningFrames: boolean;
  image: string | null;
  backend: string;
  iterations: StudioIteration[];
  generatedVariants: GeneratedVariant[];
  titleSuggestions: string[];
  mediaYoutubeUrl?: string;
  mediaScript?: string;
  mediaPhotos?: PersistedMediaPhoto[];
  mediaIntelligence?: VideoIntelligenceResult | null;
  editorDocument?: EditorDocument | null;
  brandLanguage?: BrandLanguage | null;
  channelProfile?: ChannelProfile | null;
};

export function buildSharePayload(session: Omit<StudioSession, "id" | "createdAt" | "updatedAt">): SharePayload {
  return {
    v: 1,
    topic: session.topic,
    channels: session.channels,
    hook: session.hook,
    composition: session.composition,
    model: session.model,
    imageSize: session.imageSize,
    masterPrompt: session.masterPrompt,
    masterPromptCustomized: session.masterPromptCustomized,
    compositionFactors: session.compositionFactors,
    useOpeningFrames: session.useOpeningFrames,
    image: session.image,
    backend: session.backend,
    iterations: session.iterations,
    generatedVariants: session.generatedVariants,
    titleSuggestions: session.titleSuggestions,
    mediaYoutubeUrl: session.mediaYoutubeUrl,
    mediaScript: session.mediaScript,
    mediaPhotos: session.mediaPhotos,
    mediaIntelligence: session.mediaIntelligence,
    editorDocument: session.editorDocument,
    brandLanguage: session.brandLanguage,
    channelProfile: session.channelProfile,
  };
}

/** Keep full analysis useful while preventing captions from exhausting localStorage/share URLs. */
export function compactVideoIntelligence(
  result: VideoIntelligenceResult | null
): VideoIntelligenceResult | null {
  if (!result) return null;
  return {
    ...result,
    youtube: result.youtube
      ? {
          ...result.youtube,
          transcript: result.youtube.transcript.slice(0, 4_000),
        }
      : undefined,
  };
}

/** Trim heavy fields so share JSON stays small in object storage. */
export function compactSharePayload(payload: SharePayload): SharePayload {
  return {
    ...payload,
    mediaScript: payload.mediaScript?.slice(0, 4_000),
    mediaPhotos: (payload.mediaPhotos || []).slice(0, 2).map((photo) => ({
      ...photo,
      data: photo.data && photo.data.length > 120_000 ? "" : photo.data,
    })),
    mediaIntelligence: compactVideoIntelligence(payload.mediaIntelligence || null),
    masterPrompt: (payload.masterPrompt || "").slice(0, 2_000),
    iterations: payload.iterations.slice(-3),
    generatedVariants: payload.generatedVariants.slice(0, 4),
    titleSuggestions: payload.titleSuggestions.slice(0, 8),
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? padded : padded + "=".repeat(4 - (padded.length % 4));
  const binary = atob(pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeShareUrl(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload);
  const blob = new Blob([json]);
  const stream = blob.stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  const token = toBase64Url(new Uint8Array(buf));
  const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${base}?share=${token}`;
}

export async function decodeShareUrl(token: string): Promise<SharePayload | null> {
  try {
    const bytes = fromBase64Url(token);
    const copy = new Uint8Array(bytes);
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = await new Response(stream).text();
    const parsed = JSON.parse(json) as SharePayload;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseShareTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("share");
}
