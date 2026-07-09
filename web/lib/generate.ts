const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_TIMEOUT_MS = 75_000;
const MAX_REF_IMAGES = 4;

export type GenerateResult = {
  imageBase64: string;
  backend: string;
  geminiError?: string;
};

export type ImageAsset = {
  mimeType: string;
  data: string;
  label?: string;
};

type InspirationInput = {
  thumbnailUrl: string;
  title?: string;
  channel?: string;
};

function extractImageBuffer(data: Record<string, unknown>): Buffer | null {
  const candidates = (data.candidates as Array<Record<string, unknown>>) || [];
  for (const candidate of candidates) {
    const parts = ((candidate.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>) || [];
    for (const part of parts) {
      const inline = (part.inlineData || part.inline_data) as { data?: string } | undefined;
      if (inline?.data) return Buffer.from(inline.data, "base64");
    }
  }
  return null;
}

function buildParts(prompt: string, assets: ImageAsset[]): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const asset of assets.slice(0, MAX_REF_IMAGES)) {
    parts.push({ inlineData: { mimeType: asset.mimeType, data: asset.data } });
    if (asset.label) {
      parts.push({ text: `Attached asset "${asset.label}" — incorporate or replace elements as instructed.` });
    }
  }
  parts.push({ text: prompt });
  return parts;
}

async function generateGemini(
  apiKey: string,
  prompt: string,
  model: string,
  imageSize: "1K" | "2K" | "4K" = "1K",
  assets: ImageAsset[] = []
): Promise<Buffer> {
  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: buildParts(prompt, assets) }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "16:9", imageSize },
      },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${raw.slice(0, 400)}`);

  const data = JSON.parse(raw) as Record<string, unknown>;
  const buf = extractImageBuffer(data);
  if (buf) return buf;

  const reason = (data.candidates as Array<Record<string, unknown>>)?.[0]?.finishReason;
  throw new Error(`Gemini returned no image (${reason || "unknown"})`);
}

export async function generateThumbnail(
  prompt: string,
  model?: string,
  _inspirations: InspirationInput[] = [],
  imageSize: "1K" | "2K" | "4K" = "1K",
  allowFallback = false,
  assets: ImageAsset[] = []
): Promise<GenerateResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const cohesivityKey = process.env.COH_APPLICATION_KEY;
  const geminiModel = model || DEFAULT_GEMINI_MODEL;

  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY missing — restart dev server.");
  }

  try {
    const buf = await generateGemini(geminiKey, prompt, geminiModel, imageSize, assets);
    return { imageBase64: buf.toString("base64"), backend: `gemini:${geminiModel}@${imageSize}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Gemini failed:", msg);
    if (!allowFallback || !cohesivityKey) {
      throw new Error(msg.includes("timeout") || msg.includes("aborted") ? `Gemini timed out — use 1K. ${msg}` : msg);
    }
    throw new Error(`Gemini failed and fallback disabled. ${msg}`);
  }
}
