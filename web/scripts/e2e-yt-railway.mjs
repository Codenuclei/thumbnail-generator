const BASE = process.env.E2E_BASE || "https://fleet-dolphin-gaining.cohesivity.app";
const YT = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const health = await fetch(`${BASE}/api/health`, {
  headers: { "User-Agent": "thumbnail-studio-e2e/1.0" },
});
const healthJson = await health.json();
console.log("health", health.status, {
  ytdlp: healthJson.ytdlp,
  cohesivity: healthJson.cohesivity,
});

if (!healthJson.ytdlp?.ready) {
  console.error("E2E_FAIL: yt-dlp not ready on Railway");
  process.exit(1);
}

const t0 = Date.now();
const dl = await fetch(`${BASE}/api/youtube/download`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "thumbnail-studio-e2e/1.0",
  },
  body: JSON.stringify({ url: YT }),
});
const json = await dl.json();
console.log("youtube/download", dl.status, `${Date.now() - t0}ms`, {
  error: json.error,
  mode: json.mode,
  title: json.title,
  durationSec: json.durationSec,
  frames: json.frames?.length,
  pickSource: json.pickSource,
  qualityLabel: json.qualityLabel,
  hasData: Boolean(json.frames?.[0]?.data),
});

if (!dl.ok || json.mode !== "ytdlp-frames" || !json.frames?.[0]?.data) {
  console.error("E2E_FAIL");
  process.exit(1);
}
console.log("E2E_PASS");
