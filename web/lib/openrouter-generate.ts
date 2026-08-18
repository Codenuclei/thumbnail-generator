/**
 * OpenRouter image generation.
 *
 * Image-only models (FLUX, Recraft, Seedream, …) go through POST /images.
 * Gemini / GPT-5 Image stay on chat completions with modalities ["image","text"].
 * Each path falls back to the other on 404 / modality mismatch.
 */

import { runtimeEnv } from "@/lib/runtime-env";
import {
  DEFAULT_IMAGE_MODEL,
  isChatTextImageModel,
  openRouterChatModalities,
  resolveImageModelId,
} from "@/lib/image-models";

export type OpenRouterImageAsset = {
  mimeType: string;
  data: string;
  label?: string;
  role?: "primary" | "reference" | "seed";
};

const MAX_REF_IMAGES = 12;

function openRouterBase(): string {
  return (
    runtimeEnv("OPENROUTER_BASE_URL")?.replace(/\/$/, "") ||
    "https://openrouter.ai/api/v1"
  );
}

export function openRouterConfigured(): boolean {
  return Boolean(runtimeEnv("OPENROUTER_API_KEY"));
}

function orHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer":
      runtimeEnv("PUBLIC_APP_URL") ||
      "https://fleet-dolphin-gaining.cohesivity.app",
    "X-Title": "Thumbnail Studio",
  };
}

function assetInstruction(asset: OpenRouterImageAsset): string {
  if (asset.role === "primary") {
    return `KEY SOURCE STILL — "${asset.label || "video still"}". Use this as a plate: pull the best person, object, OR background for a YouTube thumbnail. Crop/reframe freely; do not force a full-frame paste. Keep real likeness/product identity if that element is chosen. Do not swap in a different invented person/product.`;
  }
  if (asset.role === "reference") {
    return `STYLE SAMPLE ONLY — "${asset.label || "ref"}". Borrow font energy, case, open tracking, color mood, and layout RHYTHM. FORBIDDEN: same subject pose, same crop, same background layout, same text block placement, or a near-identical remake. Paint only the user's exact hook from the main prompt; never copy wording, outline, stroke, border, frame, plate, neon, glow, or shadow from this image. Invent a clearly different original scene.`;
  }
  if (asset.role === "seed") {
    return `GENERATED VARIANT SEED — "${asset.label || "variant seed"}". This is a prior output the user liked. Generate a sibling in the same story direction — match palette energy, subject scale, hook placement, and venue. Vary camera look and type variant per prompt. Improve phone-readability; do not pixel-copy. The result must NOT be a 1:1 replica of this seed image — change composition, staging, or framing enough that it is a new, similar-but-distinct thumbnail. No border/frame around the canvas edges.`;
  }
  if ((asset.label || "").toLowerCase().includes("media photo")) {
    return `USER PHOTO — "${asset.label}". Optional ingredient: use as person likeness, product/object, or background plate if it serves the topic; otherwise ignore.`;
  }
  return `Attached asset "${asset.label || "asset"}" — use only if it improves the thumbnail story.`;
}

const ORIGINALITY_PREAMBLE =
  "CRITICAL BEFORE ANY ATTACHED IMAGES: Competitor/liked thumbnails are STYLE SAMPLES only (fonts, color energy, layout rhythm). You MUST invent a NEW scene — different camera angle, different crop, different subject staging/pose, and different background arrangement than any attached reference. If the result could be mistaken for a reference thumb at a glance, it is a hard failure. Topic context and the user's brief outrank copying a reference.";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function dataUrl(asset: OpenRouterImageAsset): string {
  const mime = asset.mimeType || "image/png";
  return `data:${mime};base64,${asset.data}`;
}

function buildUserContent(
  prompt: string,
  assets: OpenRouterImageAsset[]
): ContentPart[] {
  const parts: ContentPart[] = [];
  const hasRefs = assets.some((a) => a.role === "reference" || a.role === "seed");
  if (hasRefs) {
    parts.push({ type: "text", text: ORIGINALITY_PREAMBLE });
  }
  for (const asset of assets.slice(0, MAX_REF_IMAGES)) {
    parts.push({
      type: "image_url",
      image_url: { url: dataUrl(asset) },
    });
    parts.push({ type: "text", text: assetInstruction(asset) });
  }
  parts.push({ type: "text", text: prompt });
  return parts;
}

function buildTextPrompt(
  prompt: string,
  assets: OpenRouterImageAsset[]
): string {
  const chunks: string[] = [];
  const hasRefs = assets.some((a) => a.role === "reference" || a.role === "seed");
  if (hasRefs) chunks.push(ORIGINALITY_PREAMBLE);
  for (const asset of assets.slice(0, MAX_REF_IMAGES)) {
    chunks.push(assetInstruction(asset));
  }
  chunks.push(prompt);
  return chunks.join("\n\n");
}

function extractChatImageBase64(data: Record<string, unknown>): Buffer | null {
  const choices = (data.choices as Array<Record<string, unknown>>) || [];
  const message = (choices[0]?.message as Record<string, unknown>) || {};
  const images = message.images as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(images)) {
    for (const img of images) {
      const imageUrl = img.image_url;
      const url =
        typeof imageUrl === "string"
          ? imageUrl
          : (imageUrl as { url?: string } | undefined)?.url;
      if (typeof url === "string" && url.startsWith("data:")) {
        const b64 = url.replace(/^data:[^;]+;base64,/, "");
        if (b64) return Buffer.from(b64, "base64");
      }
    }
  }
  const content = message.content;
  if (typeof content === "string") {
    const match = content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/);
    if (match) {
      const b64 = match[0].replace(/^data:[^;]+;base64,/, "");
      return Buffer.from(b64, "base64");
    }
  }
  if (Array.isArray(content)) {
    for (const part of content as Array<Record<string, unknown>>) {
      const url =
        typeof part.image_url === "string"
          ? part.image_url
          : (part.image_url as { url?: string } | undefined)?.url;
      if (typeof url === "string" && url.startsWith("data:")) {
        return Buffer.from(url.replace(/^data:[^;]+;base64,/, ""), "base64");
      }
    }
  }
  return null;
}

function extractImagesApiBase64(data: Record<string, unknown>): Buffer | null {
  const rows = data.data as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    const b64 = row.b64_json;
    if (typeof b64 === "string" && b64.length > 32) {
      return Buffer.from(b64, "base64");
    }
    const url = row.url;
    if (typeof url === "string" && url.startsWith("data:")) {
      return Buffer.from(url.replace(/^data:[^;]+;base64,/, ""), "base64");
    }
  }
  return null;
}

async function parseJsonResponse(
  res: Response,
  raw: string,
  label: string
): Promise<Record<string, unknown>> {
  if (!res.ok) {
    throw new Error(`${label} ${res.status}: ${raw.slice(0, 400)}`);
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`${label} returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

function isUnsupportedParamError(msg: string): boolean {
  return /does not support|not supported|requested parameter/i.test(msg);
}

function isChatEndpointMismatch(msg: string): boolean {
  return /cannot be used with the chat\/completions endpoint|Use the \/api\/v1\/images/i.test(
    msg
  );
}

async function postImages(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const res = await fetch(`${openRouterBase()}/images`, {
    method: "POST",
    headers: orHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.floor(timeoutMs)),
  });
  const raw = await res.text();
  return parseJsonResponse(res, raw, "OpenRouter /images");
}

async function generateViaImagesApi(options: {
  apiKey: string;
  model: string;
  prompt: string;
  imageSize: "1K" | "2K" | "4K";
  assets: OpenRouterImageAsset[];
  timeoutMs: number;
}): Promise<{ buffer: Buffer; model: string }> {
  const refs = options.assets.slice(0, MAX_REF_IMAGES).map((asset) => ({
    type: "image_url",
    image_url: { url: dataUrl(asset) },
  }));
  let prompt = buildTextPrompt(options.prompt, options.assets);
  if (prompt.length > 8_000) prompt = prompt.slice(0, 8_000);
  const extras: Array<Record<string, unknown>> = [
    { aspect_ratio: "16:9", resolution: options.imageSize },
    { aspect_ratio: "16:9" },
    { aspect_ratio: "3:2" },
    {},
  ];

  let lastErr: Error | null = null;
  for (const withRefs of refs.length ? [true, false] : [false]) {
    for (const extra of extras) {
      const body: Record<string, unknown> = {
        model: options.model,
        prompt,
        ...extra,
      };
      if (withRefs) body.input_references = refs;
      try {
        const data = await postImages(options.apiKey, body, options.timeoutMs);
        const buf = extractImagesApiBase64(data);
        if (!buf) {
          throw new Error(
            `OpenRouter /images returned no image (${(data.model as string) || options.model})`
          );
        }
        return { buffer: buf, model: String(data.model || options.model) };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message;
        if (isUnsupportedParamError(msg) || /prompt length/i.test(msg)) continue;
        throw lastErr;
      }
    }
  }
  throw lastErr || new Error(`OpenRouter /images failed (${options.model})`);
}

async function generateViaChatCompletions(options: {
  apiKey: string;
  model: string;
  prompt: string;
  imageSize: "1K" | "2K" | "4K";
  assets: OpenRouterImageAsset[];
  timeoutMs: number;
}): Promise<{ buffer: Buffer; model: string }> {
  const modalities = openRouterChatModalities(options.model);
  const body: Record<string, unknown> = {
    model: options.model,
    messages: [
      {
        role: "user",
        content: buildUserContent(options.prompt, options.assets),
      },
    ],
    modalities,
    image_config: {
      aspect_ratio: "16:9",
      image_size: options.imageSize,
    },
  };

  const res = await fetch(`${openRouterBase()}/chat/completions`, {
    method: "POST",
    headers: orHeaders(options.apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.floor(options.timeoutMs)),
  });
  const raw = await res.text();
  const data = await parseJsonResponse(res, raw, "OpenRouter");
  const buf = extractChatImageBase64(data);
  if (!buf) {
    throw new Error(
      `OpenRouter returned no image (${(data.model as string) || options.model})`
    );
  }
  return { buffer: buf, model: String(data.model || options.model) };
}

export async function generateOpenRouterImage(options: {
  prompt: string;
  model?: string;
  imageSize?: "1K" | "2K" | "4K";
  assets?: OpenRouterImageAsset[];
  timeoutMs?: number;
}): Promise<{ buffer: Buffer; model: string; backend: string }> {
  const apiKey = runtimeEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY missing on server");
  }

  const model = resolveImageModelId(options.model || DEFAULT_IMAGE_MODEL);
  const assets = options.assets || [];
  const timeoutMs = options.timeoutMs ?? 70_000;
  const imageSize = options.imageSize || "1K";
  const shared = { apiKey, model, prompt: options.prompt, imageSize, assets, timeoutMs };

  const imagesFirst = !isChatTextImageModel(model);
  const attempts = imagesFirst
    ? [generateViaImagesApi, generateViaChatCompletions]
    : [generateViaChatCompletions, generateViaImagesApi];

  const errors: string[] = [];
  for (const run of attempts) {
    try {
      const result = await run(shared);
      const size = imageSize;
      return {
        buffer: result.buffer,
        model: result.model,
        backend: `openrouter:${result.model}@${size}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.warn(`[openrouter] ${run.name} failed for ${model}:`, msg.slice(0, 240));
      if (run === generateViaImagesApi && isChatEndpointMismatch(msg)) {
        continue;
      }
      if (run === generateViaChatCompletions && isChatEndpointMismatch(msg)) {
        break;
      }
    }
  }

  throw new Error(errors[errors.length - 1] || `OpenRouter failed (${model})`);
}
