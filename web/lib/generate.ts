import { runtimeEnv } from "@/lib/runtime-env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image";
/** Keep under Railway/proxy patience — 4×150s was hanging users for 10+ minutes. */
const GEMINI_TIMEOUT_MS = 55_000;
const MAX_REF_IMAGES = 4;
const MAX_RETRIES = 2;
const BETWEEN_VARIANT_MS = 400;
const RETRY_ROUND_DELAY_MS = 800;

export type GenerateResult = {
  imageBase64: string;
  backend: string;
  geminiError?: string;
};

export type ImageAsset = {
  mimeType: string;
  data: string;
  label?: string;
  /** When "primary", this uploaded video frame anchors the output. "reference" = style hints only. */
  role?: "primary" | "reference";
};

type InspirationInput = {
  thumbnailUrl: string;
  title?: string;
  channel?: string;
};

export type VariantSpec = {
  id: string;
  prompt: string;
  label: string;
  paletteId?: string;
  paletteName?: string;
  composition: string;
  compositionLabel?: string;
  cameraFilter?: string;
  cameraFilterLabel?: string;
  compositionFactor?: string;
  compositionFactorLabel?: string;
  suggestedTitle?: string;
};

export type VariantImage = {
  id: string;
  image: string;
  label: string;
  paletteId?: string;
  paletteName?: string;
  composition: string;
  compositionLabel?: string;
  cameraFilter?: string;
  cameraFilterLabel?: string;
  compositionFactor?: string;
  compositionFactorLabel?: string;
  suggestedTitle?: string;
  backend: string;
};

function extractImageBuffer(data: Record<string, unknown>): Buffer | null {
  const candidates = (data.candidates as Array<Record<string, unknown>>) || [];
  for (const candidate of candidates) {
    const parts =
      ((candidate.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>) ||
      [];
    for (const part of parts) {
      const inline = (part.inlineData || part.inline_data) as { data?: string } | undefined;
      if (inline?.data) return Buffer.from(inline.data, "base64");
    }
  }
  return null;
}

function assetInstruction(asset: ImageAsset): string {
  if (asset.role === "primary") {
    return `PRIMARY SOURCE — uploaded video opening frame "${asset.label || "video clip"}". This image defines the subject, scene, pose, framing, and visual anchor. Build the thumbnail FROM this frame. Preserve what is in this image; enhance for 16:9 YouTube — do NOT replace it with reference thumbnails.`;
  }
  if (asset.role === "reference") {
    return `REFERENCE ONLY — suggested thumbnail "${asset.label || "ref"}". Use for color mood, typography, and layout hints only. Do NOT copy its subject or override the primary video frame.`;
  }
  return `Attached asset "${asset.label || "asset"}" — incorporate or replace elements as instructed.`;
}

function buildParts(
  prompt: string,
  assets: ImageAsset[]
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const asset of assets.slice(0, MAX_REF_IMAGES)) {
    parts.push({ inlineData: { mimeType: asset.mimeType, data: asset.data } });
    parts.push({ text: assetInstruction(asset) });
  }
  parts.push({ text: prompt });
  return parts;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(msg: string): boolean {
  return (
    /timed out|aborted|timeout|429|500|503|INTERNAL|UNAVAILABLE|Resource exhausted|rate/i.test(
      msg
    )
  );
}

async function generateGeminiOnce(
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

async function generateGemini(
  apiKey: string,
  prompt: string,
  model: string,
  imageSize: "1K" | "2K" | "4K" = "1K",
  assets: ImageAsset[] = []
): Promise<Buffer> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateGeminiOnce(apiKey, prompt, model, imageSize, assets);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const retry = attempt < MAX_RETRIES && isRetryable(lastErr.message);
      console.error(`Gemini attempt ${attempt}/${MAX_RETRIES} failed:`, lastErr.message);
      if (!retry) break;
      await sleep(1800 * attempt + Math.floor(Math.random() * 600));
    }
  }
  throw lastErr || new Error("Gemini failed");
}

export async function generateThumbnail(
  prompt: string,
  model?: string,
  _inspirations: InspirationInput[] = [],
  imageSize: "1K" | "2K" | "4K" = "1K",
  allowFallback = false,
  assets: ImageAsset[] = []
): Promise<GenerateResult> {
  const geminiKey = runtimeEnv("GEMINI_API_KEY") || runtimeEnv("GOOGLE_API_KEY");
  const cohesivityKey = runtimeEnv("COH_APPLICATION_KEY");
  const geminiModel = model || DEFAULT_GEMINI_MODEL;

  if (!geminiKey) {
    throw new Error(
      "GEMINI_API_KEY missing on server — thumbnail generation cannot run."
    );
  }

  try {
    const buf = await generateGemini(geminiKey, prompt, geminiModel, imageSize, assets);
    return {
      imageBase64: buf.toString("base64"),
      backend: `gemini:${geminiModel}@${imageSize}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Gemini failed:", msg);
    if (!allowFallback || !cohesivityKey) {
      throw new Error(
        msg.includes("timeout") || msg.includes("aborted")
          ? `Gemini timed out — use 1K. ${msg}`
          : msg
      );
    }
    throw new Error(`Gemini failed and fallback disabled. ${msg}`);
  }
}

async function generateOneVariant(
  v: VariantSpec,
  options: {
    model?: string;
    imageSize?: "1K" | "2K" | "4K";
    assets?: ImageAsset[];
  }
): Promise<VariantImage> {
  const result = await generateThumbnail(
    v.prompt,
    options.model,
    [],
    options.imageSize || "1K",
    false,
    options.assets || []
  );
  return {
    id: v.id,
    image: result.imageBase64,
    label: v.label,
    paletteId: v.paletteId,
    paletteName: v.paletteName,
    composition: v.composition,
    compositionLabel: v.compositionLabel,
    cameraFilter: v.cameraFilter,
    cameraFilterLabel: v.cameraFilterLabel,
    compositionFactor: v.compositionFactor,
    compositionFactorLabel: v.compositionFactorLabel,
    suggestedTitle: v.suggestedTitle,
    backend: result.backend,
  };
}

/**
 * Generate every variant sequentially (Gemini 3 rate-limits parallel image calls).
 * Retries failed slots in extra rounds until all succeed or rounds exhausted.
 */
export async function generateThumbnailVariants(
  variants: VariantSpec[],
  options: {
    model?: string;
    imageSize?: "1K" | "2K" | "4K";
    assets?: ImageAsset[];
    /** Target count — defaults to all variants */
    targetCount?: number;
  }
): Promise<VariantImage[]> {
  const target = options.targetCount ?? variants.length;
  const succeeded = new Map<string, VariantImage>();

  async function attemptVariant(v: VariantSpec) {
    if (succeeded.has(v.id)) return;
    const img = await generateOneVariant(v, options);
    succeeded.set(v.id, img);
    console.log(`Variant ${v.id} ok (${succeeded.size}/${target})`);
  }

  // Pass 1–2: sequential short attempts (stop as soon as we have target)
  for (let round = 0; round < 2 && succeeded.size < target; round++) {
    if (round > 0) await sleep(RETRY_ROUND_DELAY_MS);
    for (let i = 0; i < variants.length; i++) {
      if (succeeded.size >= target) break;
      const v = variants[i];
      if (succeeded.has(v.id)) continue;
      try {
        if (succeeded.size > 0 || i > 0) await sleep(BETWEEN_VARIANT_MS);
        await attemptVariant(v);
      } catch (err) {
        console.error(
          `Variant ${v.id} round${round + 1} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  return variants
    .filter((v) => succeeded.has(v.id))
    .map((v) => succeeded.get(v.id)!);
}
