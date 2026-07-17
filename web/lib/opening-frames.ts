import { spawn } from "child_process";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { resolveFfmpegPath } from "@/lib/ffmpeg-bin";
import { OPENING_FRAME_SECONDS } from "@/lib/opening-frame-constants";
import { pickBestOpeningFrame, type FrameCandidate } from "@/lib/pick-opening-frame";

export type OpeningFrameAsset = {
  mimeType: string;
  data: string;
  label: string;
  timestampSec: number;
  source: "ffmpeg";
};

export type OpeningFrameCandidate = FrameCandidate & {
  previewData: string;
};

export type OpeningFramesResult = {
  asset: OpeningFrameAsset | null;
  candidates: OpeningFrameCandidate[];
  geminiPickIndex: number;
  geminiReason: string;
  pickSource: "gemini" | "heuristic";
  bytesRead: number;
};

export type StreamExtractResult = {
  asset: OpeningFrameAsset | null;
  bytesRead: number;
  candidates?: OpeningFrameCandidate[];
  geminiPickIndex?: number;
  geminiReason?: string;
  pickSource?: "gemini" | "heuristic";
};

/** One frame per second for seconds 1–10. */
export { OPENING_FRAME_SECONDS } from "@/lib/opening-frame-constants";

const MIME_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
};

const MAX_STREAM_BYTES = 12 * 1024 * 1024;

function extForMime(mime: string): string {
  return MIME_EXT[mime] || ".mp4";
}

function sniffImageMime(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}

/** When a still (e.g. YouTube CDN JPEG) is wrongly sent as a "video" upload. */
async function buildResultFromImageBuffer(
  buffer: Buffer,
  label: string,
  topic?: string
): Promise<OpeningFramesResult> {
  const sniffed = sniffImageMime(buffer);
  if (!sniffed || buffer.length < 400) {
    return {
      asset: null,
      candidates: [],
      geminiPickIndex: 0,
      geminiReason: "",
      pickSource: "heuristic",
      bytesRead: buffer.length,
    };
  }
  const jpeg =
    sniffed === "image/jpeg"
      ? buffer
      : await sharp(buffer).jpeg({ quality: 88 }).toBuffer();
  const [previewData, geminiData] = await Promise.all([
    toPreviewJpeg(jpeg),
    toGeminiJpeg(jpeg),
  ]);
  return buildResult(
    [
      {
        timestampSec: 0,
        mimeType: "image/jpeg",
        data: geminiData,
        previewData,
      },
    ],
    label,
    buffer.length,
    topic
  );
}

function run(
  cmd: string,
  args: string[],
  timeoutMs = 60_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function extractFrameAt(
  ffmpeg: string,
  videoPath: string,
  outDir: string,
  timestampSec: number
): Promise<Buffer | null> {
  const out = join(outDir, `frame_${timestampSec}.jpg`);
  try {
    const { code } = await run(
      ffmpeg,
      [
        "-y",
        "-probesize",
        "32M",
        "-analyzeduration",
        "5M",
        "-ss",
        String(timestampSec),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        out,
      ],
      25_000
    );
    if (code !== 0) return null;
    const buffer = await readFile(out);
    return buffer.length >= 800 ? buffer : null;
  } catch {
    return null;
  }
}

async function toPreviewJpeg(buffer: Buffer): Promise<string> {
  return sharp(buffer)
    .resize(320, 180, { fit: "cover" })
    .jpeg({ quality: 72 })
    .toBuffer()
    .then((b) => b.toString("base64"));
}

async function toGeminiJpeg(buffer: Buffer): Promise<string> {
  return sharp(buffer)
    .resize(640, 360, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer()
    .then((b) => b.toString("base64"));
}

async function extractTenSecondFrames(
  ffmpeg: string,
  videoPath: string,
  workDir: string
): Promise<OpeningFrameCandidate[]> {
  const batch = await extractTenSecondFramesBatch(ffmpeg, videoPath, workDir);
  if (batch.length) return batch;

  const candidates: OpeningFrameCandidate[] = [];
  for (const sec of OPENING_FRAME_SECONDS) {
    const buffer = await extractFrameAt(ffmpeg, videoPath, workDir, sec);
    if (!buffer) continue;
    const [previewData, geminiData] = await Promise.all([
      toPreviewJpeg(buffer),
      toGeminiJpeg(buffer),
    ]);
    candidates.push({
      timestampSec: sec,
      mimeType: "image/jpeg",
      data: geminiData,
      previewData,
    });
  }
  return candidates;
}

/** Single ffmpeg pass — more reliable on truncated / non-faststart MP4. */
async function extractTenSecondFramesBatch(
  ffmpeg: string,
  videoPath: string,
  workDir: string
): Promise<OpeningFrameCandidate[]> {
  const pattern = join(workDir, "batch_%02d.jpg");
  try {
    const { code } = await run(
      ffmpeg,
      [
        "-y",
        "-fflags",
        "+genpts",
        "-err_detect",
        "ignore_err",
        "-probesize",
        "32M",
        "-analyzeduration",
        "10M",
        "-ss",
        "1",
        "-i",
        videoPath,
        "-t",
        "10",
        "-vf",
        "fps=1",
        "-frames:v",
        "10",
        "-q:v",
        "3",
        pattern,
      ],
      45_000
    );
    if (code !== 0) return [];

    const candidates: OpeningFrameCandidate[] = [];
    for (let i = 0; i < OPENING_FRAME_SECONDS.length; i++) {
      const sec = OPENING_FRAME_SECONDS[i];
      const framePath = join(workDir, `batch_${String(i + 1).padStart(2, "0")}.jpg`);
      let buffer: Buffer;
      try {
        buffer = await readFile(framePath);
      } catch {
        continue;
      }
      if (buffer.length < 800) continue;
      const [previewData, geminiData] = await Promise.all([
        toPreviewJpeg(buffer),
        toGeminiJpeg(buffer),
      ]);
      candidates.push({
        timestampSec: sec,
        mimeType: "image/jpeg",
        data: geminiData,
        previewData,
      });
    }
    return candidates;
  } catch {
    return [];
  }
}

async function buildResult(
  candidates: OpeningFrameCandidate[],
  label: string,
  bytesRead: number,
  topic?: string
): Promise<OpeningFramesResult> {
  if (!candidates.length) {
    return {
      asset: null,
      candidates: [],
      geminiPickIndex: 0,
      geminiReason: "",
      pickSource: "heuristic",
      bytesRead,
    };
  }

  const pick = await pickBestOpeningFrame(candidates, { topic, clipName: label });
  const chosen = candidates[pick.selectedIndex] ?? candidates[0];

  const asset: OpeningFrameAsset = {
    mimeType: chosen.mimeType,
    data: chosen.data,
    timestampSec: chosen.timestampSec,
    source: "ffmpeg",
    label: `Frame @${chosen.timestampSec}s (${pick.source}): ${label.slice(0, 40)}`,
  };

  return {
    asset,
    candidates,
    geminiPickIndex: pick.selectedIndex,
    geminiReason: pick.reason,
    pickSource: pick.source,
    bytesRead,
  };
}

/** Pre-extracted browser frames → Gemini pick (no server ffmpeg). */
export async function buildResultFromClientCandidates(
  candidates: Array<FrameCandidate & { previewData?: string }>,
  label: string,
  topic?: string
): Promise<OpeningFramesResult> {
  const normalized: OpeningFrameCandidate[] = candidates
    .filter((c) => c.data && Number.isFinite(c.timestampSec) && c.timestampSec >= 0)
    .map((c) => ({
      timestampSec: c.timestampSec,
      mimeType: c.mimeType || "image/jpeg",
      data: c.data,
      previewData: c.previewData || c.data,
    }));

  return buildResult(normalized, label, 0, topic);
}

async function processVideoFile(
  ffmpeg: string,
  videoPath: string,
  label: string,
  bytesRead: number,
  topic?: string
): Promise<OpeningFramesResult> {
  const workDir = join(videoPath, "..");
  const candidates = await extractTenSecondFrames(ffmpeg, videoPath, workDir);
  return buildResult(candidates, label, bytesRead, topic);
}

/**
 * Client path: full-video samples → Gemini picks best thumbnail still.
 * Server fallback: ffmpeg samples early seconds when browser decode fails.
 */
export async function extractOpeningFramesFromStream(
  body: ReadableStream<Uint8Array>,
  mimeType: string,
  label: string,
  topic?: string
): Promise<OpeningFramesResult> {
  const dir = await mkdtemp(join(tmpdir(), "thumb-stream-"));
  const videoPath = join(dir, `clip${extForMime(mimeType)}`);
  const reader = body.getReader();
  let bytesRead = 0;
  let fileStarted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      if (!fileStarted) {
        await writeFile(videoPath, Buffer.from(value));
        fileStarted = true;
      } else {
        await appendFile(videoPath, Buffer.from(value));
      }
      bytesRead += value.length;

      if (bytesRead >= MAX_STREAM_BYTES) {
        await reader.cancel();
        break;
      }
    }

    if (!fileStarted) {
      return {
        asset: null,
        candidates: [],
        geminiPickIndex: 0,
        geminiReason: "",
        pickSource: "heuristic",
        bytesRead: 0,
      };
    }

    // Stills sent as video/mp4 (stale YouTube client) — no ffmpeg needed.
    const head = await readFile(videoPath);
    if (sniffImageMime(head)) {
      return buildResultFromImageBuffer(head, label, topic);
    }

    const ffmpeg = await resolveFfmpegPath();
    if (!ffmpeg) {
      return {
        asset: null,
        candidates: [],
        geminiPickIndex: 0,
        geminiReason: "",
        pickSource: "heuristic",
        bytesRead,
      };
    }

    return await processVideoFile(ffmpeg, videoPath, label, bytesRead, topic);
  } catch (err) {
    console.error("opening-frames stream error", label, err);
    try {
      const head = fileStarted ? await readFile(videoPath) : null;
      if (head && sniffImageMime(head)) {
        return await buildResultFromImageBuffer(head, label, topic);
      }
    } catch {
      /* ignore */
    }
    const ffmpeg = await resolveFfmpegPath();
    if (fileStarted && ffmpeg) {
      return processVideoFile(ffmpeg, videoPath, label, bytesRead, topic).catch(() => ({
        asset: null,
        candidates: [],
        geminiPickIndex: 0,
        geminiReason: "",
        pickSource: "heuristic" as const,
        bytesRead,
      }));
    }
    return {
      asset: null,
      candidates: [],
      geminiPickIndex: 0,
      geminiReason: "",
      pickSource: "heuristic",
      bytesRead,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Back-compat wrapper */
export async function extractOpeningFrameFromStream(
  body: ReadableStream<Uint8Array>,
  mimeType: string,
  label: string,
  topic?: string
): Promise<StreamExtractResult> {
  const result = await extractOpeningFramesFromStream(body, mimeType, label, topic);
  return {
    asset: result.asset,
    bytesRead: result.bytesRead,
    candidates: result.candidates,
    geminiPickIndex: result.geminiPickIndex,
    geminiReason: result.geminiReason,
    pickSource: result.pickSource,
  };
}

export function openingFramesAsAssets(
  frames: Array<{ mimeType: string; data: string; label: string }>
): Array<{ mimeType: string; data: string; label: string; role: "primary" }> {
  return frames
    .filter((f) => f.data)
    .map((f) => ({ ...f, role: "primary" as const }));
}

export async function openingFramesAvailable(): Promise<boolean> {
  return Boolean(await resolveFfmpegPath());
}
