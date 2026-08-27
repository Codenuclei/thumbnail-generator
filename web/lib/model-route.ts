import { resolveImageModelId } from "@/lib/image-models";
import { stagingRecipeForIndex } from "@/lib/staging-recipes";

export const STACK = {
  flux: "black-forest-labs/flux.2-pro",
  face: "google/gemini-3-pro-image",
  place: "bytedance-seed/seedream-5-0-pro",
  type: "openai/gpt-image-2",
  graphic: "recraft/recraft-v4.1-pro",
} as const;

const STAGING_TO_STACK: Record<string, string> = {
  "object-hero": STACK.flux,
  "pov-hands": STACK.flux,
  "mid-action": STACK.face,
  "low-punch": STACK.face,
  "place-scale": STACK.place,
  "reveal-clash": STACK.place,
};

export function isAutoStackModel(raw?: string | null): boolean {
  const t = (raw || "").trim().toLowerCase();
  return (
    !t ||
    t === "default" ||
    t === "openrouter/auto" ||
    t === "openrouter/auto-beta"
  );
}

export function modelForStagingRecipe(recipeId: string): string {
  return STAGING_TO_STACK[recipeId] || STACK.face;
}

export function modelForStagingIndex(index: number): string {
  return modelForStagingRecipe(stagingRecipeForIndex(index).id);
}

export function resolveSlotModel(
  rawModel: string | undefined,
  stagingIndex: number
): string {
  if (isAutoStackModel(rawModel)) return modelForStagingIndex(stagingIndex);
  return resolveImageModelId(rawModel);
}

export type PromptFamily =
  | "gemini"
  | "flux"
  | "gpt"
  | "recraft"
  | "seedream"
  | "default";

export function promptFamilyForModel(raw?: string | null): PromptFamily {
  const id = resolveImageModelId(raw);
  if (id.startsWith("black-forest-labs/") || id.includes("flux")) return "flux";
  if (id.startsWith("recraft/")) return "recraft";
  if (id.startsWith("bytedance-seed/") || id.includes("seedream")) return "seedream";
  if (id.startsWith("openai/") && id.includes("image")) return "gpt";
  if (id.startsWith("google/") || id.includes("gemini")) return "gemini";
  return "default";
}
