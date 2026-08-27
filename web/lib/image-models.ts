/**
 * Image-generation model catalog for OpenRouter.
 *
 * Prefer live data from GET /api/image-models
 * (`/models?output_modalities=image` — same as
 * https://openrouter.ai/models?output_modalities=image).
 * IMAGE_MODELS is the offline fallback.
 *
 * Snapshot: 45 models · 2026-08-18T10:53:15.536901+00:00
 */

export type ImageModelOption = {
  value: string;
  label: string;
  /** Short hint for compact pickers / per-direction rows */
  shortLabel?: string;
};

/** Default when the picker is "default" / empty. */
export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";

/** Fallback used when a selected model keeps failing under load. */
export const FALLBACK_IMAGE_MODEL = DEFAULT_IMAGE_MODEL;

/** Offline curated list from OpenRouter output_modalities=image. */
export const IMAGE_MODELS: ImageModelOption[] = [
  {
    value: "default",
    label: "Nano Banana 2 (default)",
    shortLabel: "Default",
  },
  {
    value: "black-forest-labs/flux.2-flex",
    label: "Black Forest Labs: FLUX.2 Flex",
    shortLabel: "FLUX.2 Flex",
  },
  {
    value: "black-forest-labs/flux.2-klein-4b",
    label: "Black Forest Labs: FLUX.2 Klein 4B",
    shortLabel: "FLUX.2 Klein 4B",
  },
  {
    value: "black-forest-labs/flux.2-max",
    label: "Black Forest Labs: FLUX.2 Max",
    shortLabel: "FLUX.2 Max",
  },
  {
    value: "black-forest-labs/flux.2-pro",
    label: "Black Forest Labs: FLUX.2 Pro",
    shortLabel: "FLUX.2 Pro",
  },
  {
    value: "bytedance-seed/seedream-4.5",
    label: "ByteDance Seed: Seedream 4.5",
    shortLabel: "Seedream 4.5",
  },
  {
    value: "bytedance-seed/seedream-5-0-lite",
    label: "ByteDance Seed: Seedream 5.0 Lite",
    shortLabel: "Seedream 5.0 Lite",
  },
  {
    value: "bytedance-seed/seedream-5-0-pro",
    label: "ByteDance Seed: Seedream 5.0 Pro",
    shortLabel: "Seedream 5.0 Pro",
  },
  {
    value: "google/gemini-2.5-flash-image",
    label: "Google: Nano Banana (Gemini 2.5 Flash Image)",
    shortLabel: "Nano Banana (Gemini 2.5 Flash Image)",
  },
  {
    value: "google/gemini-3-pro-image",
    label: "Google: Nano Banana Pro (Gemini 3 Pro Image)",
    shortLabel: "Nano Banana Pro (Gemini 3 Pro Image)",
  },
  {
    value: "google/gemini-3-pro-image-preview",
    label: "Google: Nano Banana Pro (Gemini 3 Pro Image Preview)",
    shortLabel: "Nano Banana Pro (Gemini 3 Pro Image Preview)",
  },
  {
    value: "google/gemini-3.1-flash-image",
    label: "Google: Nano Banana 2 (Gemini 3.1 Flash Image)",
    shortLabel: "Nano Banana 2 (Gemini 3.1 Flash Image)",
  },
  {
    value: "google/gemini-3.1-flash-image-preview",
    label: "Google: Nano Banana 2 (Gemini 3.1 Flash Image Preview)",
    shortLabel: "Nano Banana 2 (Gemini 3.1 Flash Image Preview)",
  },
  {
    value: "google/gemini-3.1-flash-lite-image",
    label: "Google: Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)",
    shortLabel: "Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)",
  },
  {
    value: "krea/krea-2-large",
    label: "Krea: Krea 2 Large",
    shortLabel: "Krea 2 Large",
  },
  {
    value: "krea/krea-2-medium",
    label: "Krea: Krea 2 Medium",
    shortLabel: "Krea 2 Medium",
  },
  {
    value: "krea/krea-2-medium-turbo",
    label: "Krea: Krea 2 Medium Turbo",
    shortLabel: "Krea 2 Medium Turbo",
  },
  {
    value: "microsoft/mai-image-2.5",
    label: "Microsoft: MAI-Image-2.5",
    shortLabel: "MAI-Image-2.5",
  },
  {
    value: "microsoft/mai-image-2.5-pro",
    label: "Microsoft: MAI-Image-2.5 Pro",
    shortLabel: "MAI-Image-2.5 Pro",
  },
  {
    value: "openai/gpt-5-image",
    label: "OpenAI: GPT-5 Image",
    shortLabel: "GPT-5 Image",
  },
  {
    value: "openai/gpt-5-image-mini",
    label: "OpenAI: GPT-5 Image Mini",
    shortLabel: "GPT-5 Image Mini",
  },
  {
    value: "openai/gpt-5.4-image-2",
    label: "OpenAI: GPT-5.4 Image 2",
    shortLabel: "GPT-5.4 Image 2",
  },
  {
    value: "openai/gpt-image-1",
    label: "OpenAI: GPT Image 1",
    shortLabel: "GPT Image 1",
  },
  {
    value: "openai/gpt-image-1-mini",
    label: "OpenAI: GPT Image 1 Mini",
    shortLabel: "GPT Image 1 Mini",
  },
  {
    value: "openai/gpt-image-2",
    label: "OpenAI: GPT Image 2",
    shortLabel: "GPT Image 2",
  },
  {
    value: "openrouter/auto",
    label: "Auto Router",
    shortLabel: "Auto Router",
  },
  {
    value: "openrouter/auto-beta",
    label: "Auto Router (Beta)",
    shortLabel: "Auto Router (Beta)",
  },
  {
    value: "qwen/qwen-image-3",
    label: "Qwen: Qwen Image 3",
    shortLabel: "Qwen Image 3",
  },
  {
    value: "qwen/qwen-image-3-pro",
    label: "Qwen: Qwen Image 3 Pro",
    shortLabel: "Qwen Image 3 Pro",
  },
  {
    value: "recraft/recraft-v3",
    label: "Recraft: Recraft V3",
    shortLabel: "Recraft V3",
  },
  {
    value: "recraft/recraft-v4",
    label: "Recraft: Recraft V4",
    shortLabel: "Recraft V4",
  },
  {
    value: "recraft/recraft-v4-pro",
    label: "Recraft: Recraft V4 Pro",
    shortLabel: "Recraft V4 Pro",
  },
  {
    value: "recraft/recraft-v4-pro-vector",
    label: "Recraft: Recraft V4 Pro Vector",
    shortLabel: "Recraft V4 Pro Vector",
  },
  {
    value: "recraft/recraft-v4-vector",
    label: "Recraft: Recraft V4 Vector",
    shortLabel: "Recraft V4 Vector",
  },
  {
    value: "recraft/recraft-v4.1",
    label: "Recraft: Recraft V4.1",
    shortLabel: "Recraft V4.1",
  },
  {
    value: "recraft/recraft-v4.1-pro",
    label: "Recraft: Recraft V4.1 Pro",
    shortLabel: "Recraft V4.1 Pro",
  },
  {
    value: "recraft/recraft-v4.1-pro-vector",
    label: "Recraft: Recraft V4.1 Pro Vector",
    shortLabel: "Recraft V4.1 Pro Vector",
  },
  {
    value: "recraft/recraft-v4.1-utility",
    label: "Recraft: Recraft V4.1 Utility",
    shortLabel: "Recraft V4.1 Utility",
  },
  {
    value: "recraft/recraft-v4.1-utility-pro",
    label: "Recraft: Recraft V4.1 Utility Pro",
    shortLabel: "Recraft V4.1 Utility Pro",
  },
  {
    value: "recraft/recraft-v4.1-vector",
    label: "Recraft: Recraft V4.1 Vector",
    shortLabel: "Recraft V4.1 Vector",
  },
  {
    value: "sourceful/riverflow-v2-fast",
    label: "Sourceful: Riverflow V2 Fast",
    shortLabel: "Riverflow V2 Fast",
  },
  {
    value: "sourceful/riverflow-v2-pro",
    label: "Sourceful: Riverflow V2 Pro",
    shortLabel: "Riverflow V2 Pro",
  },
  {
    value: "sourceful/riverflow-v2.5-fast",
    label: "Sourceful: Riverflow V2.5 Fast",
    shortLabel: "Riverflow V2.5 Fast",
  },
  {
    value: "sourceful/riverflow-v2.5-pro",
    label: "Sourceful: Riverflow V2.5 Pro",
    shortLabel: "Riverflow V2.5 Pro",
  },
  {
    value: "x-ai/grok-imagine-image-2.0",
    label: "xAI: Grok Imagine Image 2.0",
    shortLabel: "Grok Imagine Image 2.0",
  },
  {
    value: "x-ai/grok-imagine-image-quality",
    label: "SpaceXAI: Grok Imagine Image Quality",
    shortLabel: "Grok Imagine Image Quality",
  },
];

/** Value used in DirectionsPanel for “follow global picker”. */
export const DIRECTION_MODEL_GLOBAL = "global";

const LEGACY_BARE_GEMINI = new Set([
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
]);

/**
 * Normalize UI / draft / API model strings to an OpenRouter id.
 * Empty / "default" → DEFAULT_IMAGE_MODEL.
 */
export function resolveImageModelId(raw?: string | null): string {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed === "default") return DEFAULT_IMAGE_MODEL;
  if (LEGACY_BARE_GEMINI.has(trimmed)) return `google/${trimmed}`;
  return trimmed;
}

/** Gemini (and LLM-backed GPT-5 Image) emit text+image on chat completions. */
export function isChatTextImageModel(raw?: string | null): boolean {
  const id = resolveImageModelId(raw);
  if (id.startsWith("google/") || id.includes("gemini")) return true;
  if (/^openai\/gpt-5/.test(id) && id.includes("image")) return true;
  return false;
}

/**
 * Chat Completions `modalities`. Image-only models (FLUX, Recraft, Seedream)
 * 404 if you ask for `["image","text"]`.
 */
export function openRouterChatModalities(
  raw?: string | null
): Array<"image" | "text"> {
  return isChatTextImageModel(raw) ? ["image", "text"] : ["image"];
}

export function imageModelLabel(
  id: string,
  catalog: ImageModelOption[] = IMAGE_MODELS
): string {
  const resolved = resolveImageModelId(id);
  const hit = catalog.find(
    (m) =>
      m.value === id ||
      m.value === resolved ||
      resolveImageModelId(m.value) === resolved
  );
  return hit?.label || resolved;
}
