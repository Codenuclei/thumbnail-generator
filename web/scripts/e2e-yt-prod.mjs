/**
 * E2E: YouTube stills → Gemini pick → video-intelligence analysis
 */
const BASE = process.env.E2E_BASE || "https://fleet-dolphin-gaining.cohesivity.app";
const YT = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

async function main() {
  console.log("BASE", BASE);
  let failed = false;

  const dl = await fetch(`${BASE}/api/youtube/download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "thumbnail-studio-e2e/1.0",
    },
    body: JSON.stringify({ url: YT }),
  });
  const dlJson = await dl.json();
  console.log("A youtube/download", dl.status, {
    frames: dlJson.frames?.length,
    labels: dlJson.frames?.map((f) => f.label),
    hasData: Boolean(dlJson.frames?.[0]?.data),
  });
  if (!dl.ok || (dlJson.frames?.length || 0) < 2) failed = true;

  const pick = await fetch(`${BASE}/api/opening-frames`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "thumbnail-studio-e2e/1.0",
    },
    body: JSON.stringify({
      label: dlJson.title || "yt",
      candidates: (dlJson.frames || []).map((f) => ({
        timestampSec: f.timestampSec,
        mimeType: f.mimeType || "image/jpeg",
        data: f.data,
      })),
    }),
  });
  const pickJson = await pick.json();
  console.log("B gemini/heuristic pick", pick.status, {
    pickSource: pickJson.pickSource,
    geminiPickIndex: pickJson.geminiPickIndex,
    hasData: Boolean(pickJson.data),
    error: pickJson.error,
  });
  if (!pick.ok || !pickJson.data) failed = true;

  const images = (dlJson.frames || []).slice(0, 6).map((f, i) => ({
    id: `f-${i}`,
    name: f.label,
    kind: "video-frame",
    mimeType: f.mimeType || "image/jpeg",
    data: f.data,
    timestampSec: f.timestampSec,
  }));

  const analysis = await fetch(`${BASE}/api/video-intelligence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "thumbnail-studio-e2e/1.0",
    },
    body: JSON.stringify({
      youtubeUrl: YT,
      images,
    }),
  });
  const analysisJson = await analysis.json();
  console.log("C video-intelligence", analysis.status, {
    error: analysisJson.error,
    hasResult: Boolean(analysisJson.result),
    hooks: analysisJson.result?.hooks?.length,
    confidence: analysisJson.result?.confidence?.level,
    summary: analysisJson.result?.summary?.slice?.(0, 80),
  });
  if (!analysis.ok || !analysisJson.result) failed = true;

  if (failed) {
    console.error("E2E_FAIL");
    process.exit(1);
  }
  console.log("E2E_PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
