/**
 * YouTube on Railway: yt-dlp download -> ffmpeg samples -> Laplacian/Gemini pick.
 * No CDN thumbnail shortcuts. If yt-dlp is missing or fails, this throws.
 */

import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { uploadToCohesivityStorage } from "@/lib/cohesivity-storage";
import { runtimeEnv } from "@/lib/runtime-env";

export type YoutubeStillFrame = {
  key: string;
  url: string;
  mimeType: string;
  data: string;
  label: string;
  timestampSec: number;
  score?: number;
};

export type YoutubeDownloadResult = {
  videoId: string;
  title: string;
  durationSec: number | null;
  mode: "ytdlp-frames";
  frames: YoutubeStillFrame[];
  key: string;
  url: string;
  contentType: string;
  bytes: number;
  posterUrl: string | null;
  qualityLabel: string;
  pickSource: string;
  pickReason?: string;
  bestIndex?: number;
};

type PipelinePayload = {
  ok?: boolean;
  videoId?: string;
  title?: string;
  durationSec?: number;
  frames?: Array<{
    timestampSec: number;
    mimeType?: string;
    data: string;
    label?: string;
    score?: number;
  }>;
  bestIndex?: number;
  pickSource?: string;
  pickReason?: string;
  qualityLabel?: string;
};

export function extractYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (
      host.endsWith("youtube.com") ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        parts[0] === "shorts" ||
        parts[0] === "embed" ||
        parts[0] === "live" ||
        parts[0] === "v"
      ) {
        const id = parts[1];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolvePipelineScript(): Promise<string> {
  const candidates = [
    process.env.YT_FRAME_PIPELINE,
    "/opt/yt-worker/frame_pipeline.py",
    path.join(process.cwd(), "yt-worker", "frame_pipeline.py"),
    path.join(process.cwd(), "..", "yt-worker", "frame_pipeline.py"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (await pathExists(c)) return c;
  }
  throw new Error(
    "frame_pipeline.py not found. Deploy on Railway with Dockerfile (YT_FRAME_PIPELINE)."
  );
}

async function assertYtdlp(): Promise<string> {
  const candidates = [
    process.env.YTDLP_PATH,
    "/usr/local/bin/yt-dlp",
    "yt-dlp",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (c.includes("/") || c.includes("\\")) {
      if (await pathExists(c)) return c;
    } else {
      // bare name — assume PATH (validated by pipeline)
      return c;
    }
  }
  throw new Error("yt-dlp not found. This route requires Railway with yt-dlp installed.");
}

function runPythonJson(script: string, args: string[], timeoutMs: number): Promise<PipelinePayload> {
  return new Promise((resolve, reject) => {
    const python =
      process.env.PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
    const child = spawn(python, [script, ...args], {
      env: {
        ...process.env,
        YTDLP_PATH: process.env.YTDLP_PATH || "/usr/local/bin/yt-dlp",
        FFMPEG_PATH: process.env.FFMPEG_PATH || "/usr/bin/ffmpeg",
      },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("yt-dlp frame pipeline timed out (120s)"));
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
      if (code !== 0) {
        reject(
          new Error(
            (stderr || stdout || `yt-dlp pipeline exit ${code}`).trim().slice(0, 600)
          )
        );
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || "{}";
        resolve(JSON.parse(line) as PipelinePayload);
      } catch {
        reject(
          new Error(
            `yt-dlp pipeline returned non-JSON: ${(stdout || stderr).trim().slice(0, 300)}`
          )
        );
      }
    });
  });
}

async function persistPipelineResult(
  raw: PipelinePayload,
  fallbackVideoId: string
): Promise<YoutubeDownloadResult> {
  if (!raw.ok || !raw.frames?.length) {
    throw new Error("yt-dlp pipeline returned no frames");
  }
  const bestIndex =
    typeof raw.bestIndex === "number" &&
    raw.bestIndex >= 0 &&
    raw.bestIndex < raw.frames.length
      ? raw.bestIndex
      : 0;
  const winner = raw.frames[bestIndex];
  const buf = Buffer.from(String(winner.data), "base64");
  if (buf.byteLength < 400) {
    throw new Error("Winning frame was empty");
  }
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const videoId = String(raw.videoId || fallbackVideoId);
  const key = `source-videos/youtube/${videoId}-best-${hash}.jpg`;
  const uploaded = await uploadToCohesivityStorage(key, buf, "image/jpeg");

  const frames: YoutubeStillFrame[] = raw.frames.map((f, i) => ({
    key: i === bestIndex ? uploaded.path || key : `mem:${i}`,
    url: i === bestIndex ? uploaded.url : "",
    mimeType: f.mimeType || "image/jpeg",
    data: f.data,
    label: f.label || `t=${f.timestampSec}s`,
    timestampSec: Number(f.timestampSec) || i,
    score: typeof f.score === "number" ? f.score : undefined,
  }));

  const ordered = [frames[bestIndex], ...frames.filter((_, i) => i !== bestIndex)];

  return {
    videoId,
    title: String(raw.title || `YouTube ${videoId}`),
    durationSec:
      typeof raw.durationSec === "number" && raw.durationSec > 0
        ? raw.durationSec
        : null,
    mode: "ytdlp-frames",
    frames: ordered,
    key: uploaded.path || key,
    url: uploaded.url,
    contentType: "image/jpeg",
    bytes: buf.byteLength,
    posterUrl: uploaded.url,
    qualityLabel: String(raw.qualityLabel || "ytdlp"),
    pickSource: String(raw.pickSource || "laplacian"),
    pickReason: raw.pickReason ? String(raw.pickReason) : undefined,
    bestIndex: 0,
  };
}

/** Public for /api/health diagnostics. */
export async function youtubeYtdlpReady(): Promise<{
  ready: boolean;
  ytdlp: string | null;
  pipeline: string | null;
  error?: string;
}> {
  try {
    const ytdlp = await assertYtdlp();
    const pipeline = await resolvePipelineScript();
    return { ready: true, ytdlp, pipeline };
  } catch (err) {
    return {
      ready: false,
      ytdlp: null,
      pipeline: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function downloadYoutubeToCohesivity(
  youtubeUrlOrId: string,
  options?: { topic?: string }
): Promise<YoutubeDownloadResult> {
  const videoId = extractYoutubeVideoId(youtubeUrlOrId);
  if (!videoId) {
    throw new Error("Invalid YouTube URL or video id");
  }
  if (!runtimeEnv("COH_APPLICATION_KEY")) {
    throw new Error("COH_APPLICATION_KEY not configured");
  }

  const ytdlp = await assertYtdlp();
  const script = await resolvePipelineScript();
  process.env.YTDLP_PATH = ytdlp;

  const raw = await runPythonJson(
    script,
    [
      `https://www.youtube.com/watch?v=${videoId}`,
      "--max-frames",
      "16",
      "--keep-frames",
      "8",
      ...(options?.topic ? ["--topic", options.topic] : []),
    ],
    120_000
  );

  return persistPipelineResult(raw, videoId);
}
