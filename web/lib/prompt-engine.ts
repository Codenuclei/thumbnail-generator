import type { StyleBrief } from "@/lib/style-intelligence";
import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { GenerationMediaIntelligence } from "@/lib/video-intelligence-types";
import type { BrandLanguage } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";
import type { TopicContext } from "@/lib/gemini-filter";
import { type GenerationContextInput } from "@/lib/generation-context";
import {
  FONT_ENGINE_VARIANTS,
  fontEngineVariantForIndex,
} from "@/lib/font-engine";
import { adaptPromptForModel } from "@/lib/prompt-adapters";

export { DEFAULT_MASTER_PROMPT } from "@/lib/master-prompt";
export {
  CAMERA_FILTERS,
  cameraFilterForIndex,
  type CameraFilter,
} from "@/lib/camera-filters";

/**
 * Distinct hook-type treatments per variant — sourced from the standalone
 * font engine so bans/placement stay in one place.
 */
export const TYPOGRAPHY_VARIANTS = FONT_ENGINE_VARIANTS;

export type TypographyVariant = (typeof TYPOGRAPHY_VARIANTS)[number];

export function typographyVariantForIndex(index: number): TypographyVariant {
  return fontEngineVariantForIndex(index);
}

export function buildUltraPrompt(
  topic: string,
  options: {
    hook?: string;
    composition?: string;
    styleBrief?: StyleBrief;
    inspirations?: InspirationVideo[];
    feedback?: ThumbnailFeedback[];
    iterationNote?: string;
    iterationIndex?: number;
    cameraFilterIndex?: number;
    typographyVariantIndex?: number;
    masterPrompt?: string;
    compositionFactors?: string[];
    compositionFactorHint?: string;
    stagingRecipeIndex?: number;
    variantCount?: number;
    useOpeningFrames?: boolean;
    primaryVideoFrame?: boolean;
    mediaIntelligence?: GenerationMediaIntelligence;
    userBrief?: string;
    userMediaPhotoCount?: number;
    brandLanguage?: BrandLanguage;
    channelProfile?: ChannelProfile;
    topicContext?: TopicContext;
    selectedPalette?: GenerationContextInput["selectedPalette"];
    selectedRefCount?: number;
    seedVariantNote?: string;
    seedVariantLabel?: string;
    imageModel?: string;
    paletteLockedByUser?: boolean;
  }
): string {
  return adaptPromptForModel({
    topic,
    hook: options.hook,
    imageModel: options.imageModel,
    stagingIndex: options.stagingRecipeIndex ?? options.cameraFilterIndex ?? 0,
    variantCount: options.variantCount,
    cameraFilterIndex: options.cameraFilterIndex,
    typographyVariantIndex: options.typographyVariantIndex,
    composition: options.composition,
    selectedPalette: options.selectedPalette,
    channelProfile: options.channelProfile,
    brandLanguage: options.brandLanguage,
    userBrief: [options.userBrief, options.iterationNote]
      .filter(Boolean)
      .join(" · "),
    paletteLockedByUser: options.paletteLockedByUser,
    sceneNote:
      options.mediaIntelligence?.summary ||
      options.styleBrief?.summary ||
      "",
  });
}
