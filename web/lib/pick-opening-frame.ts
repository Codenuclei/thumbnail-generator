import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const PICK_MODEL = "gemini-2.5-flash";

export type FrameCandidate = {
  timestampSec: number;
  mimeType: string;
  data: string;
};

export type FramePickResult = {
  selectedIndex: number;
  reason: string;
  source: "gemini" | "heuristic";
};

export async function pickBestOpeningFrame(
  candidates: FrameCandidate[],
  options?: { topic?: string; clipName?: string }
): Promise<FramePickResult> {
  if (!candidates.length) {
    return { selectedIndex: 0, reason: "No frames extracted", source: "heuristic" };
  }
  if (candidates.length === 1) {
    return { selectedIndex: 0, reason: "Only one frame available", source: "heuristic" };
  }

  const apiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  if (!apiKey) return heuristicPick(candidates);

  const catalog = candidates
    .map((c, i) => `Frame ${i + 1} = ${c.timestampSec}s (image ${i + 1} below)`)
    .join("\n");

  const prompt = `Pick the best YouTube thumbnail KEY MOMENT from these candidate frames sampled across the video.

${options?.topic ? `Video topic: "${options.topic}"` : ""}
${options?.clipName ? `Clip / source: "${options.clipName}"` : ""}

${catalog}

Prefer iconic payoff / reaction / product-reveal / conflict / before-after clarity — anywhere in the runtime, not limited to the opening 1–2 seconds.
Prefer: hero subject fully visible, sharp focus, good lighting, readable action, emotion or clear object silhouette.
Avoid: black frames, title cards, end screens, logos-only, heavy motion blur, empty B-roll, watermark-only frames, letterbox bars, ugly UI chrome.
Do NOT bias toward the earliest timestamp unless it is clearly the strongest still.

Return ONLY JSON: {"selectedIndex": <0-based>, "reason": "<short sentence including why this moment beats others>"}`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];
  for (const c of candidates) {
    parts.push({ inlineData: { mimeType: c.mimeType, data: c.data } });
  }

  try {
    const res = await fetch(`${GEMINI_API_BASE}/${PICK_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return heuristicPick(candidates);

    const json = await res.json();
    const text =
      json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return heuristicPick(candidates);

    const parsed = JSON.parse(match[0]) as { selectedIndex?: number; reason?: string };
    const idx = Number(parsed.selectedIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= candidates.length) {
      return heuristicPick(candidates);
    }
    return {
      selectedIndex: idx,
      reason: String(parsed.reason || "Best product/content visibility"),
      source: "gemini",
    };
  } catch {
    return heuristicPick(candidates);
  }
}

function heuristicPick(candidates: FrameCandidate[]): FramePickResult {
  // Prefer a mid-pack sample so we don't always lock to the cold open.
  const idx = Math.min(
    Math.max(1, Math.floor(candidates.length / 2)),
    candidates.length - 1
  );
  return {
    selectedIndex: idx,
    reason: "Heuristic pick — mid-runtime key moment candidate",
    source: "heuristic",
  };
}
