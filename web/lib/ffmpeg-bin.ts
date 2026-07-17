import ffmpegStatic from "ffmpeg-static";
import { access, chmod } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";

const execFileAsync = promisify(execFile);

let cached: string | null | undefined;

/** Resolve ffmpeg: bundled static binary (Vercel) or system PATH (local dev). */
export async function resolveFfmpegPath(): Promise<string | null> {
  if (cached !== undefined) return cached;

  // 1) ffmpeg-static (bundled for Vercel via outputFileTracingIncludes)
  if (ffmpegStatic) {
    try {
      await access(ffmpegStatic);
      if (process.platform !== "win32") {
        await chmod(ffmpegStatic, 0o755).catch(() => {});
      }
      cached = ffmpegStatic;
      return ffmpegStatic;
    } catch {
      // fall through
    }
  }

  // 2) Windows WinGet path
  const winCandidate = join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "WinGet",
    "Packages",
    "yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "ffmpeg-N-124716-g054dffd133-win64-gpl",
    "bin",
    "ffmpeg.exe"
  );
  try {
    await access(winCandidate);
    cached = winCandidate;
    return winCandidate;
  } catch {
    // continue
  }

  // 3) PATH
  for (const name of ["ffmpeg", "ffmpeg.exe"]) {
    try {
      if (process.platform === "win32") {
        const { stdout } = await execFileAsync("where.exe", [name], { timeout: 8_000 });
        const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
        if (first) {
          cached = first;
          return first;
        }
      } else {
        await execFileAsync("which", [name], { timeout: 5_000 });
        cached = name;
        return name;
      }
    } catch {
      // try next
    }
  }

  cached = null;
  return null;
}
