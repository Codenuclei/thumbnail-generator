"""
YouTube → dense frame sample → sharpness rank → optional Gemini pick.
Used by the Next.js API via `python frame_pipeline.py` when YTDLP is available,
and can also run as a standalone HTTP service (main.py).
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

VIDEO_ID_RE = re.compile(r"(?:v=|/)([a-zA-Z0-9_-]{11})(?:[?&/]|$)")


def extract_video_id(url: str) -> str | None:
    raw = url.strip()
    if re.fullmatch(r"[a-zA-Z0-9_-]{11}", raw):
        return raw
    m = VIDEO_ID_RE.search(raw)
    return m.group(1) if m else None


def run(cmd: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def resolve_bin(name: str, env_key: str) -> str:
    env = os.environ.get(env_key)
    if env and Path(env).exists():
        return env
    found = shutil.which(name)
    if found:
        return found
    raise RuntimeError(f"{name} not found (set {env_key})")


def resolve_ytdlp_cmd() -> list[str]:
    """Prefer standalone yt-dlp binary, else `python -m yt_dlp`."""
    env = os.environ.get("YTDLP_PATH")
    if env and Path(env).exists():
        return [env]
    found = shutil.which("yt-dlp")
    if found:
        return [found]
    return [sys.executable, "-m", "yt_dlp"]


def download_video(url: str, out_dir: Path) -> tuple[Path, dict]:
    ytdlp_cmd = resolve_ytdlp_cmd()
    out_tmpl = str(out_dir / "video.%(ext)s")
    # Prefer progressive / merged MP4 under 720p to keep CPU + RAM low.
    fmt = os.environ.get(
        "YTDLP_FORMAT",
        "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=480]+ba/b[height<=480]/worst",
    )
    meta_path = out_dir / "meta.json"
    # Default clients that usually work from datacenter IPs without PO tokens.
    extractor_args = os.environ.get(
        "YTDLP_EXTRACTOR_ARGS",
        "youtube:player_client=android,ios,tv,web",
    )
    cmd = [
        *ytdlp_cmd,
        "--no-playlist",
        "--no-warnings",
        "-f",
        fmt,
        "--merge-output-format",
        "mp4",
        "-o",
        out_tmpl,
        "--write-info-json",
        "--no-progress",
        "--max-filesize",
        os.environ.get("YTDLP_MAX_FILESIZE", "120M"),
        "--extractor-args",
        extractor_args,
        url,
    ]
    cookie = os.environ.get("YOUTUBE_COOKIE_FILE")
    if cookie and Path(cookie).exists():
        cmd.extend(["--cookies", cookie])

    proc = run(cmd, timeout=240)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "yt-dlp failed").strip()
        raise RuntimeError(err[:500])

    videos = list(out_dir.glob("video.*"))
    videos = [p for p in videos if p.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}]
    if not videos:
        raise RuntimeError("yt-dlp finished but no video file was produced")
    video_path = max(videos, key=lambda p: p.stat().st_size)

    info: dict = {}
    info_candidates = list(out_dir.glob("*.info.json")) + list(out_dir.glob("video.info.json"))
    if info_candidates:
        try:
            info = json.loads(info_candidates[0].read_text(encoding="utf-8"))
        except Exception:
            info = {}
    elif proc.stdout.strip():
        try:
            # last JSON object in stdout
            lines = [ln for ln in proc.stdout.splitlines() if ln.strip().startswith("{")]
            if lines:
                info = json.loads(lines[-1])
        except Exception:
            info = {}

    meta_path.write_text(json.dumps({"path": str(video_path), "info": info}), encoding="utf-8")
    return video_path, info


def probe_duration(video_path: Path) -> float:
    ffprobe = shutil.which("ffprobe") or "ffprobe"
    proc = run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        timeout=30,
    )
    try:
        return max(0.5, float((proc.stdout or "0").strip()))
    except ValueError:
        return 30.0


def sample_times(duration: float, max_frames: int) -> list[float]:
    n = max(4, min(max_frames, 24))
    if duration <= 2:
        return [0.3]
    # Skip soft bumpers: start after 3% / end before 97%
    start = min(1.0, duration * 0.03)
    end = max(start + 0.5, duration * 0.97)
    if n == 1:
        return [start]
    return [start + (end - start) * i / (n - 1) for i in range(n)]


def extract_frame(ffmpeg: str, video_path: Path, t: float, out_jpg: Path) -> bool:
    proc = run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{t:.3f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "3",
            "-y",
            str(out_jpg),
        ],
        timeout=40,
    )
    return proc.returncode == 0 and out_jpg.exists() and out_jpg.stat().st_size > 800


def laplacian_variance(path: Path) -> float:
    """Classic focus/sharpness metric — higher = sharper still."""
    img = Image.open(path).convert("L")
    # Downscale for speed
    img.thumbnail((640, 640))
    arr = np.asarray(img, dtype=np.float32)
    # discrete Laplacian kernel
    lap = (
        -4 * arr
        + np.roll(arr, 1, 0)
        + np.roll(arr, -1, 0)
        + np.roll(arr, 1, 1)
        + np.roll(arr, -1, 1)
    )
    return float(lap.var())


def brightness_score(path: Path) -> float:
    img = Image.open(path).convert("L")
    img.thumbnail((320, 320))
    arr = np.asarray(img, dtype=np.float32)
    mean = float(arr.mean())
    # Prefer mid tones; crush very dark / blown-out frames
    return 1.0 - min(1.0, abs(mean - 128.0) / 128.0)


def composite_score(path: Path) -> float:
    sharp = laplacian_variance(path)
    bright = brightness_score(path)
    # Log sharpness so outliers don't dominate; mix in exposure
    return math.log1p(sharp) * (0.55 + 0.45 * bright)


def gemini_pick(frames: list[dict], topic: str | None, title: str) -> tuple[int, str] | None:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key or len(frames) < 2:
        return None
    catalog = "\n".join(
        f"Frame {i + 1} = {f['timestampSec']}s" for i, f in enumerate(frames)
    )
    prompt = (
        "Pick the best still for a YouTube thumbnail from these frames sampled across the FULL video.\n\n"
        f'Title: "{title}"\n'
        + (f'Topic: "{topic}"\n' if topic else "")
        + f"\n{catalog}\n\n"
        "Prefer hero subject, sharp focus, good light, iconic moment. "
        "Avoid black frames, end screens, logos-only, blur.\n"
        'Return ONLY JSON: {"selectedIndex": <0-based>, "reason": "<short>"}'
    )
    parts: list[dict] = [{"text": prompt}]
    for f in frames:
        parts.append(
            {
                "inlineData": {
                    "mimeType": f["mimeType"],
                    "data": f["data"],
                }
            }
        )
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 256},
    }
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash:generateContent",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-goog-api-key": api_key,
            "User-Agent": "thumbnail-studio-ytdlp-worker/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        text = "".join(
            p.get("text", "")
            for p in payload.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        )
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        parsed = json.loads(m.group(0))
        idx = int(parsed.get("selectedIndex", -1))
        if idx < 0 or idx >= len(frames):
            return None
        return idx, str(parsed.get("reason") or "Gemini pick")
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        return None


def process_youtube(
    url: str,
    *,
    max_frames: int = 16,
    keep_frames: int = 8,
    topic: str | None = None,
) -> dict:
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError("Invalid YouTube URL or video id")

    ffmpeg = resolve_bin("ffmpeg", "FFMPEG_PATH")
    with tempfile.TemporaryDirectory(prefix="ytframes-") as tmp:
        tmp_path = Path(tmp)
        video_path, info = download_video(url, tmp_path)
        duration = float(info.get("duration") or 0) or probe_duration(video_path)
        title = str(info.get("title") or f"YouTube {video_id}")

        times = sample_times(duration, max_frames)
        scored: list[tuple[float, float, Path]] = []
        for i, t in enumerate(times):
            out = tmp_path / f"frame_{i:03d}.jpg"
            if extract_frame(ffmpeg, video_path, t, out):
                scored.append((composite_score(out), t, out))

        if not scored:
            raise RuntimeError("Could not extract any frames from downloaded video")

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[: max(2, min(keep_frames, len(scored)))]
        # Keep chronological order for Gemini context; remember score order index
        top_chrono = sorted(top, key=lambda x: x[1])

        frames: list[dict] = []
        for score, t, path in top_chrono:
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            frames.append(
                {
                    "timestampSec": round(float(t), 2),
                    "mimeType": "image/jpeg",
                    "data": data,
                    "label": f"t={t:.1f}s",
                    "score": round(float(score), 4),
                }
            )

        # Default: sharpest among kept
        best_by_score = max(range(len(frames)), key=lambda i: frames[i]["score"])
        pick_source = "laplacian"
        reason = "Highest Laplacian sharpness × exposure score"
        gem = gemini_pick(frames, topic, title)
        if gem:
            best_by_score, reason = gem
            pick_source = "gemini"

        return {
            "ok": True,
            "mode": "ytdlp-frames",
            "videoId": video_id,
            "title": title,
            "durationSec": round(duration, 2),
            "frames": frames,
            "bestIndex": best_by_score,
            "pickSource": pick_source,
            "pickReason": reason,
            "qualityLabel": f"{len(frames)}-of-{len(scored)}-sampled",
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--max-frames", type=int, default=16)
    parser.add_argument("--keep-frames", type=int, default=8)
    parser.add_argument("--topic", default="")
    args = parser.parse_args()
    result = process_youtube(
        args.url,
        max_frames=args.max_frames,
        keep_frames=args.keep_frames,
        topic=args.topic or None,
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
