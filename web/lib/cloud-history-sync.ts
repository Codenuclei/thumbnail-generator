import {
  buildSharePayload,
  compactSharePayload,
  listHistory,
  saveHistorySession,
  type SharePayload,
  type StudioDraft,
  type StudioSession,
} from "@/lib/studio-history";
import { readJsonResponse } from "@/lib/safe-json";
import { compressDataUrl } from "@/lib/image-compress-client";
import { publicShareUrl } from "@/lib/share-slug";

const MIGRATION_FLAG = "thumbnail-studio-cloud-sync-v1";
/** One-time re-upload so hashed Cohesivity storage paths replace broken unhashed ones. */
const REPAIR_FLAG = "thumbnail-studio-share-repair-v2";

export function localSessionsNeedingCloudPush(): StudioSession[] {
  return listHistory().filter(
    (session) => Boolean(session.topic?.trim()) && !session.shareSlug
  );
}

function sessionsForCloudSync(forceRepair: boolean): StudioSession[] {
  const all = listHistory().filter((session) => Boolean(session.topic?.trim()));
  if (forceRepair) return all;
  return all.filter((session) => !session.shareSlug);
}

/** Promote an unsaved local draft into history so it can be cloud-synced too. */
export function promoteDraftToHistory(draft: StudioDraft | null): StudioSession | null {
  if (!draft) return null;
  const topic = draft.topic?.trim();
  if (!topic) return null;

  const history = listHistory();
  if (history.some((s) => s.topic.trim().toLowerCase() === topic.toLowerCase())) {
    return null;
  }

  const image = draft.editorDocument?.backgroundImage || null;
  const hasSignal =
    Boolean(image) ||
    Boolean(draft.mediaPhotos?.length) ||
    Boolean(draft.mediaScript?.trim()) ||
    Boolean(draft.hook?.trim());
  if (!hasSignal) return null;

  const session: StudioSession = {
    id: `draft-${Date.now()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    projectName: draft.projectName || topic,
    topic,
    channels: draft.channels || "",
    hook: draft.hook || "",
    composition: draft.composition || "auto",
    model: draft.model || "default",
    imageSize: draft.imageSize || "1K",
    masterPrompt: draft.masterPrompt || "",
    masterPromptCustomized: draft.masterPromptCustomized,
    compositionFactors: draft.compositionFactors || [],
    useOpeningFrames: Boolean(draft.useOpeningFrames),
    image,
    backend: "",
    iterations: [],
    generatedVariants: [],
    titleSuggestions: [],
    directions: draft.directions,
    mediaYoutubeUrl: draft.mediaYoutubeUrl,
    mediaScript: draft.mediaScript,
    mediaPhotos: draft.mediaPhotos,
    mediaIntelligence: draft.mediaIntelligence,
    editorDocument: draft.editorDocument,
    brandLanguage: draft.brandLanguage,
    channelProfile: draft.channelProfile,
  };
  saveHistorySession(session, { bumpUpdatedAt: false });
  return session;
}

async function shrinkPayloadImages(payload: SharePayload): Promise<SharePayload> {
  const next = { ...payload };
  if (next.image) {
    try {
      const c = await compressDataUrl(next.image, { maxWidth: 960, quality: 0.75 });
      next.image = c.previewUrl;
    } catch {
      // keep original
    }
  }
  next.iterations = await Promise.all(
    next.iterations.map(async (it) => {
      try {
        const c = await compressDataUrl(it.image, { maxWidth: 640, quality: 0.72 });
        return { ...it, image: c.previewUrl };
      } catch {
        return it;
      }
    })
  );
  next.generatedVariants = await Promise.all(
    next.generatedVariants.map(async (v) => {
      try {
        const c = await compressDataUrl(v.image, { maxWidth: 640, quality: 0.72 });
        return { ...v, image: c.previewUrl };
      } catch {
        return v;
      }
    })
  );
  return next;
}

async function pushSessionToCloud(
  session: StudioSession
): Promise<{ slug: string; url: string } | null> {
  const payload = await shrinkPayloadImages(
    compactSharePayload(buildSharePayload(session))
  );
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload,
      sessionId: session.id,
      preferredSlug: session.shareSlug,
      origin:
        typeof window !== "undefined" ? window.location.origin : undefined,
    }),
  });
  const data = await readJsonResponse<{ error?: string; slug?: string; url?: string }>(
    res
  );
  if (!res.ok || !data.slug) {
    console.warn("[cloud-sync] push failed", session.id, data.error);
    return null;
  }
  return { slug: data.slug, url: publicShareUrl(data.slug) };
}

/**
 * Push every meaningful local history entry that still lacks a short /s/ slug
 * into Cohesivity DB + object storage. Safe to call on every visit — skips
 * sessions that already have shareSlug, and avoids re-running when nothing
 * is pending.
 */
export async function syncLocalHistoryToCloud(options?: {
  onProgress?: (done: number, total: number) => void;
  maxSessions?: number;
  draft?: StudioDraft | null;
}): Promise<{ pushed: number; failed: number; skipped: number }> {
  if (typeof window === "undefined") {
    return { pushed: 0, failed: 0, skipped: 0 };
  }

  if (options?.draft) {
    promoteDraftToHistory(options.draft);
  }

  const forceRepair = !localStorage.getItem(REPAIR_FLAG);
  const pending = sessionsForCloudSync(forceRepair).slice(
    0,
    options?.maxSessions ?? 40
  );
  if (!pending.length) {
    try {
      localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
      localStorage.setItem(REPAIR_FLAG, new Date().toISOString());
    } catch {
      // ignore
    }
    return { pushed: 0, failed: 0, skipped: listHistory().length };
  }

  let pushed = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i++) {
    const session = pending[i]!;
    options?.onProgress?.(i, pending.length);
    try {
      const result = await pushSessionToCloud(session);
      if (!result) {
        failed += 1;
        continue;
      }
      saveHistorySession(
        {
          ...session,
          shareSlug: result.slug,
        },
        { bumpUpdatedAt: false }
      );
      pushed += 1;
    } catch (err) {
      failed += 1;
      console.warn("[cloud-sync] error", session.id, err);
    }
    // gentle pacing for Cohesivity rate limits
    await new Promise((r) => setTimeout(r, 120));
  }
  options?.onProgress?.(pending.length, pending.length);

  try {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    localStorage.setItem(REPAIR_FLAG, new Date().toISOString());
  } catch {
    // ignore
  }

  return {
    pushed,
    failed,
    skipped: Math.max(0, listHistory().length - pending.length),
  };
}

/** Persist a shared payload into local history so opens are kept too. */
export function rememberSharedSession(
  payload: SharePayload,
  slug: string
): StudioSession {
  const session: StudioSession = {
    id: `share-${slug}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    topic: payload.topic,
    channels: payload.channels,
    hook: payload.hook,
    composition: payload.composition,
    model: payload.model,
    imageSize: payload.imageSize,
    masterPrompt: payload.masterPrompt,
    masterPromptCustomized: payload.masterPromptCustomized,
    compositionFactors: payload.compositionFactors,
    useOpeningFrames: payload.useOpeningFrames,
    image: payload.image,
    backend: payload.backend,
    iterations: payload.iterations,
    generatedVariants: payload.generatedVariants,
    titleSuggestions: payload.titleSuggestions,
    projectName: payload.projectName,
    directions: payload.directions,
    mediaYoutubeUrl: payload.mediaYoutubeUrl,
    mediaScript: payload.mediaScript,
    mediaPhotos: payload.mediaPhotos,
    mediaIntelligence: payload.mediaIntelligence,
    editorDocument: payload.editorDocument,
    brandLanguage: payload.brandLanguage,
    channelProfile: payload.channelProfile,
    shareSlug: slug,
  };
  saveHistorySession(session);
  return session;
}
