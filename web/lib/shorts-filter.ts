import sharp from "sharp";
import { thumbnailUrlCandidates } from "@/lib/extract-colors";

/** Minimum full-length video candidates before Gemini curation. */
export const MIN_VIDEO_CANDIDATES = 8;
/** Target premium thumbnails shown to the user. */
export const TARGET_PREMIUM_THUMBS = 6;

export type ShortCheckInput = {
  videoId?: string;
  title?: string;
  url?: string;
  duration?: string;
  description?: string;
  thumbnailUrl?: string;
  /** InnerTube exposes shortViewCountText only on Shorts */
  hasShortViewCount?: boolean;
};

/** Parse duration strings from Apify / YouTube into seconds. */
export function parseDurationSeconds(duration?: string): number | null {
  if (!duration?.trim()) return null;
  const raw = duration.trim();

  if (/^PT/i.test(raw)) {
    const h = raw.match(/(\d+)H/i)?.[1];
    const m = raw.match(/(\d+)M/i)?.[1];
    const s = raw.match(/(\d+)S/i)?.[1];
    return (h ? parseInt(h, 10) * 3600 : 0) + (m ? parseInt(m, 10) * 60 : 0) + (s ? parseInt(s, 10) : 0);
  }

  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const parts = raw.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function hashtagCount(title: string): number {
  return (title.match(/#\w+/g) || []).length;
}

/** Title patterns common on Shorts / vertical clips. */
export function looksLikeShortTitle(title: string): boolean {
  const t = title.toLowerCase();
  if (/#shorts\b/i.test(t)) return true;
  if (hashtagCount(title) >= 5) return true;
  if (/\b(short|reel|vertical)\b/i.test(t) && hashtagCount(title) >= 2) return true;
  return false;
}

/** YouTube Shorts and vertical clips — never use for thumbnail research. */
export function isYouTubeShort(video: ShortCheckInput): boolean {
  const title = video.title || "";
  const url = (video.url || "").toLowerCase();
  const desc = (video.description || "").toLowerCase();

  if (video.hasShortViewCount) return true;
  if (url.includes("/shorts/")) return true;
  if (/#shorts\b/i.test(title) || /#shorts\b/i.test(desc)) return true;
  if (looksLikeShortTitle(title)) return true;

  const seconds = parseDurationSeconds(video.duration);
  // Only reject when duration is confidently short (not missing)
  if (seconds !== null && seconds > 0 && seconds <= 60) return true;

  return false;
}

async function fetchThumbBuffer(
  thumbnailUrl: string,
  videoId?: string
): Promise<Buffer | null> {
  for (const candidate of thumbnailUrlCandidates(thumbnailUrl, videoId)) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(8_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://www.youtube.com/",
        },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 500) return buf;
    } catch {
      // try next
    }
  }
  return null;
}

/** Portrait thumb or pillarboxed vertical video inside 16:9 frame. */
export async function thumbnailLooksLikeShort(buffer: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width && meta.height && meta.height > meta.width * 1.05) {
      return true;
    }

    const { data, info } = await sharp(buffer)
      .resize(60, 34, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const channels = info.channels || 3;
    const sideW = Math.max(4, Math.floor(w * 0.22));
    const centerW = Math.max(8, Math.floor(w * 0.36));
    const centerX = Math.floor((w - centerW) / 2);

    function regionVariance(x0: number, rw: number): number {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let y = 0; y < h; y++) {
        for (let x = x0; x < x0 + rw && x < w; x++) {
          const idx = (y * w + x) * channels;
          const grey =
            0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          sum += grey;
          sumSq += grey * grey;
          n++;
        }
      }
      if (!n) return 0;
      const mean = sum / n;
      return sumSq / n - mean * mean;
    }

    const leftVar = regionVariance(0, sideW);
    const rightVar = regionVariance(w - sideW, sideW);
    const centerVar = regionVariance(centerX, centerW);
    const sideAvg = (leftVar + rightVar) / 2;

    // Pillarboxed Short: grey/blur bars left+right, active content in center
    if (
      sideAvg < 90 &&
      centerVar > 400 &&
      centerVar > sideAvg * 3 &&
      Math.abs(leftVar - rightVar) < 60
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function isYouTubeShortDeep(video: ShortCheckInput): Promise<boolean> {
  if (isYouTubeShort(video)) return true;
  if (!video.thumbnailUrl && !video.videoId) return false;

  const buf = await fetchThumbBuffer(video.thumbnailUrl || "", video.videoId);
  if (!buf) return false;
  return thumbnailLooksLikeShort(buf);
}

export function filterOutShorts<T extends ShortCheckInput>(videos: T[]): T[] {
  return videos.filter((v) => !isYouTubeShort(v));
}

/** Metadata + thumbnail vision filter — removes pillarboxed Shorts Apify misses. */
export async function filterOutShortsDeep<T extends ShortCheckInput>(
  videos: T[],
  opts?: { concurrency?: number }
): Promise<T[]> {
  const concurrency = opts?.concurrency ?? 6;
  const kept: T[] = [];

  for (let i = 0; i < videos.length; i += concurrency) {
    const batch = videos.slice(i, i + concurrency);
    const checks = await Promise.all(
      batch.map(async (v) => ({ v, short: await isYouTubeShortDeep(v) }))
    );
    for (const { v, short } of checks) {
      if (!short) kept.push(v);
    }
  }

  return kept;
}

/** Ensure we return up to `target` full-length videos after deep filter. */
export async function pickFullLengthVideos<T extends ShortCheckInput>(
  pool: T[],
  target: number
): Promise<T[]> {
  const deep = await filterOutShortsDeep(pool);
  return deep.slice(0, target);
}
