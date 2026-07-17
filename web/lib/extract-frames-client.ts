import { fullVideoSampleTimes, FULL_VIDEO_MAX_FRAMES } from "@/lib/video-sample-times";

export type ClientFrameCandidate = {
  timestampSec: number;
  mimeType: string;
  data: string;
  previewData: string;
};

export type VideoFrameExtractionResult = {
  durationSec: number;
  width: number;
  height: number;
  frames: ClientFrameCandidate[];
};

function stripDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  event: string,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Video ${event} timeout`));
    }, timeoutMs);

    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Video decode error"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener("error", onErr);
    };

    video.addEventListener(event, onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

function resizeFitInside(
  src: HTMLCanvasElement,
  maxW: number,
  maxH: number
): HTMLCanvasElement {
  const scale = Math.min(1, maxW / src.width, maxH / src.height);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

function resizeCover(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const scale = Math.max(w / src.width, h / src.height);
  const sw = src.width * scale;
  const sh = src.height * scale;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh);
  return out;
}

async function captureAt(
  video: HTMLVideoElement,
  sec: number,
  scratch: HTMLCanvasElement
): Promise<ClientFrameCandidate | null> {
  video.currentTime = sec;
  await waitForVideoEvent(video, "seeked", 10_000);
  if (!video.videoWidth || !video.videoHeight) return null;

  scratch.width = video.videoWidth;
  scratch.height = video.videoHeight;
  const ctx = scratch.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);

  // Keep ranking JPEGs small — 20 frames × base64 must stay under serverless body limits.
  const geminiCanvas = resizeFitInside(scratch, 480, 270);
  const previewCanvas = resizeCover(scratch, 240, 135);
  const data = stripDataUrl(geminiCanvas.toDataURL("image/jpeg", 0.62));
  const previewData = stripDataUrl(previewCanvas.toDataURL("image/jpeg", 0.55));
  if (data.length < 800) return null;

  return { timestampSec: sec, mimeType: "image/jpeg", data, previewData };
}

async function extractAtTimes(
  file: File,
  times: number[],
  options?: { onProgress?: (completed: number, total: number) => void }
): Promise<VideoFrameExtractionResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    video.load();
    await waitForVideoEvent(video, "loadedmetadata", 25_000);
    const durationSec = video.duration;
    if (!Number.isFinite(durationSec) || durationSec < 0.3) {
      throw new Error("Video too short or unreadable");
    }

    const scratch = document.createElement("canvas");
    const frames: ClientFrameCandidate[] = [];
    for (let index = 0; index < times.length; index++) {
      try {
        const frame = await captureAt(video, times[index], scratch);
        if (frame) frames.push(frame);
      } catch {
        // Some codecs cannot seek every requested timestamp.
      }
      options?.onProgress?.(index + 1, times.length);
    }

    if (!frames.length) throw new Error("Could not sample visual frames from this video");
    return {
      durationSec,
      width: video.videoWidth,
      height: video.videoHeight,
      frames,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Sample the full video for thumbnail-ready stills (not just the first 10s).
 * Only compressed JPEG frames leave the browser for ranking.
 */
export async function extractOpeningFramesFromVideoFile(
  file: File,
  options?: { maxFrames?: number; onProgress?: (completed: number, total: number) => void }
): Promise<VideoFrameExtractionResult> {
  const probeUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.src = probeUrl;
  try {
    video.load();
    await waitForVideoEvent(video, "loadedmetadata", 25_000);
    const durationSec = video.duration;
    if (!Number.isFinite(durationSec) || durationSec < 0.3) {
      throw new Error("Video too short or unreadable");
    }
    const times = fullVideoSampleTimes(durationSec, options?.maxFrames ?? FULL_VIDEO_MAX_FRAMES);
    return extractAtTimes(file, times, options);
  } finally {
    URL.revokeObjectURL(probeUrl);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Samples opening + later story beats for media intelligence.
 * Only compressed JPEG frames leave the browser.
 */
export async function extractIntelligenceFramesFromVideoFile(
  file: File,
  options?: { maxFrames?: number; onProgress?: (completed: number, total: number) => void }
): Promise<VideoFrameExtractionResult> {
  const probeUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.src = probeUrl;
  try {
    video.load();
    await waitForVideoEvent(video, "loadedmetadata", 25_000);
    const durationSec = video.duration;
    if (!Number.isFinite(durationSec) || durationSec < 0.3) {
      throw new Error("Video too short or unreadable");
    }
    const times = fullVideoSampleTimes(durationSec, options?.maxFrames ?? 12);
    return extractAtTimes(file, times, options);
  } finally {
    URL.revokeObjectURL(probeUrl);
    video.removeAttribute("src");
    video.load();
  }
}
