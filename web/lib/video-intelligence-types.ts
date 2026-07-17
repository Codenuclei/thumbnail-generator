import type { ColorPaletteOption } from "@/lib/palette-types";
import type { StyleBrief } from "@/lib/style-intelligence";

export type MediaImageKind = "video-frame" | "photo" | "youtube-thumbnail";

export type MediaImageInput = {
  id: string;
  name: string;
  kind: MediaImageKind;
  mimeType: string;
  data: string;
  previewUrl?: string;
  timestampSec?: number;
};

export type PersistedMediaPhoto = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
};

export type YouTubeVideoContext = {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  description: string;
  durationSec: number;
  thumbnailUrl: string;
  transcript: string;
  transcriptSource: "captions" | "description" | "unavailable";
  transcriptDurationSec: number;
  visualEvidence: "public-thumbnail-only";
};

export type HookCandidate = {
  text: string;
  rationale: string;
  clarity: number;
  curiosity: number;
  fidelity: number;
};

export type VideoDepthAnalysis = {
  foreground: string;
  midground: string;
  background: string;
  focalSubject: string;
  depthCues: string[];
};

export type VideoColorStrategy = {
  source: "measured" | "fallback";
  dominant: string[];
  background: string;
  accents: string[];
  text: string;
  rationale: string;
};

export type IntelligenceConfidence = {
  level: "high" | "medium" | "low";
  score: number;
  evidence: string[];
  limitations: string[];
};

export type VideoIntelligenceResult = {
  recommendedTopic: string;
  summary: string;
  audience: string;
  primarySubject: string;
  entities: string[];
  storyBeats: string[];
  sceneTypes: string[];
  emotionalTone: string;
  relatedContexts: string[];
  depth: VideoDepthAnalysis;
  thumbnailOpportunities: string[];
  hooks: HookCandidate[];
  colors: VideoColorStrategy;
  confidence: IntelligenceConfidence;
  sourceSummary: string;
  scriptSource: "user" | "youtube-captions" | "youtube-description" | "none";
  youtube?: YouTubeVideoContext;
  palettes: ColorPaletteOption[];
  styleBrief: StyleBrief;
  analyzedAt: number;
};

export type VideoIntelligenceRequest = {
  topic?: string;
  youtubeUrl?: string;
  script?: string;
  images?: MediaImageInput[];
};

export type GenerationMediaIntelligence = Pick<
  VideoIntelligenceResult,
  | "recommendedTopic"
  | "summary"
  | "audience"
  | "primarySubject"
  | "storyBeats"
  | "sceneTypes"
  | "emotionalTone"
  | "relatedContexts"
  | "depth"
  | "thumbnailOpportunities"
  | "colors"
  | "confidence"
  | "sourceSummary"
>;

export function intelligenceForGeneration(
  result: VideoIntelligenceResult | null
): GenerationMediaIntelligence | undefined {
  if (!result) return undefined;
  return {
    recommendedTopic: result.recommendedTopic,
    summary: result.summary,
    audience: result.audience,
    primarySubject: result.primarySubject,
    storyBeats: result.storyBeats,
    sceneTypes: result.sceneTypes,
    emotionalTone: result.emotionalTone,
    relatedContexts: result.relatedContexts,
    depth: result.depth,
    thumbnailOpportunities: result.thumbnailOpportunities,
    colors: result.colors,
    confidence: result.confidence,
    sourceSummary: result.sourceSummary,
  };
}

