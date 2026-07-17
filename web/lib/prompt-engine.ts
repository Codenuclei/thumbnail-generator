import type { StyleBrief } from "@/lib/style-intelligence";
import type { InspirationVideo, ThumbnailFeedback } from "@/lib/inspiration";
import type { GenerationMediaIntelligence } from "@/lib/video-intelligence-types";
import type { BrandLanguage } from "@/lib/brand-language";
import { brandLanguagePromptBlock } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";
import { channelProfilePromptBlock } from "@/lib/channel-profile";
import {
  COMPOSITION_FACTORS_PROMPT_BLOCK,
  compositionFactorsPrompt,
} from "@/lib/composition-factors";

/** Rotating camera / film looks — one per variant so generations don't share the same filter. */
export const CAMERA_FILTERS = [
  {
    id: "portra-35",
    label: "Portra 35mm",
    prompt:
      "Camera: Canon EOS R5, 35mm f/2. Lens character of Kodak Portra 400 — warm skin, soft contrast, minor film grain. Natural window lighting, shallow depth of field.",
  },
  {
    id: "tri-x-flash",
    label: "Tri-X flash",
    prompt:
      "Camera: Leica M6 feel, 28mm, harsh direct on-camera flash like documentary reportage. Kodak Tri-X 400 grain, high contrast blacks, slight motion blur on secondary action.",
  },
  {
    id: "fuji-golden",
    label: "Fuji golden hour",
    prompt:
      "Camera: Fujifilm X-T5, 50mm f/1.8. Fuji Superia / classic chrome response. Golden hour side light, long soft shadows, slight optical softness at edges.",
  },
  {
    id: "cinestill-night",
    label: "CineStill tungsten",
    prompt:
      "Camera: Sony A7IV, 40mm. CineStill 800T look — tungsten practicals, mild halation on bright lights, cool shadows, visible grain, imperfect real texture.",
  },
  {
    id: "ektar-day",
    label: "Ektar daylight",
    prompt:
      "Camera: Nikon Z6 II, 24mm. Kodak Ektar 100 — saturated but photographic color, hard midday sun or open shade, crisp edges without CGI sharpness.",
  },
  {
    id: "hp5-overcast",
    label: "HP5 overcast",
    prompt:
      "Camera: Contax G2 feel, 45mm. Ilford HP5 Plus mood translated to color — flat overcast sky, muted palette, soft contrast, documentary candid framing.",
  },
  {
    id: "disposable-flash",
    label: "Disposable flash",
    prompt:
      "Camera: cheap disposable / point-and-shoot flash look — direct flash, slight color cast, soft focus, imperfect exposure, candid street-photography energy.",
  },
  {
    id: "anamorphic-doc",
    label: "Doc anamorphic",
    prompt:
      "Camera: handheld documentary, 35mm with mild anamorphic flare only when lights hit the lens. Eye-level or slight low angle, natural practical hangar/factory light, real grit.",
  },
] as const;

export type CameraFilter = (typeof CAMERA_FILTERS)[number];

export function cameraFilterForIndex(index: number): CameraFilter {
  return CAMERA_FILTERS[index % CAMERA_FILTERS.length];
}

/** Editable quality / anti-slop master prompt shown in the UI. */
export const DEFAULT_MASTER_PROMPT = [
  "YouTube thumbnail, 16:9 landscape. No watermark.",
  "Shot like a real camera: prefer lens, film stock, and lighting language over AI quality bait words.",
  "Camera specifics: Shot on 35mm lens, Canon EOS R5, or Kodak Portra 400 film.",
  "Lighting: Natural window lighting, golden hour, or harsh direct flash — pick one coherent source.",
  "Composition: Candid street / documentary photography, shot from a low or eye-level angle, shallow depth of field where it helps.",
  "Imperfections: minor film grain, slight motion blur on secondary action, imperfect skin/fabric/metal texture.",
  "HOOK VISUAL: The thumbnail should read like the video's opening shot (first 1–2 seconds) — show what the viewer sees first, not a random mid-video still.",
  COMPOSITION_FACTORS_PROMPT_BLOCK,
  "ANTI-AI-SLOP (strict): Do NOT use or imply hyperrealistic, 8k, 4k ultra, unreal engine, octane render, ray tracing, masterpiece, best quality, highly detailed, ultra sharp, perfect symmetry, glowing neon HUD, holographic UI, plastic skin, over-smoothed surfaces, cinematic god-rays overload, or video-game concept art.",
  "Reference images are style DNA for layout, palette, and typography — match their real-photo energy, not synthetic polish.",
  "Professional but real: no clutter, one dominant hook, phone-readable text, zero cheap clickbait, zero AI-slop sheen.",
].join("\n");

const COMPOSITION_MAP: Record<string, string> = {
  center:
    "Composition: candid center hero — subject close, shot from a slight low angle, shallow depth of field, environment readable but not CGI-perfect.",
  split:
    "Composition: split comparison — two vertical panels like a real editorial layout; each side looks photographed, not symmetrically generated.",
  cutout:
    "Composition: subject cutout left or right over a real scene plate; cutout edge should feel like a photo edit, not a 3D render float.",
  data:
    "Composition: clean process/data overlay on a real photographed scene — thin lines and labels only; no glowing sci-fi screens.",
};

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
    /** Index into CAMERA_FILTERS — varies look across variants */
    cameraFilterIndex?: number;
    /** User-editable quality direction (defaults to DEFAULT_MASTER_PROMPT) */
    masterPrompt?: string;
    /** Selected composition factor ids (rule of thirds, diagonal, etc.) */
    compositionFactors?: string[];
    /** When true, attached refs include opening-shot frames from first 1–2s */
    useOpeningFrames?: boolean;
    /** Video upload provided — primary frame drives subject; refs are style-only */
    primaryVideoFrame?: boolean;
    /** Structured analysis grounded in supplied script, photos, frames, and YouTube context. */
    mediaIntelligence?: GenerationMediaIntelligence;
    /** Approved/avoided phrases and visual grammar. */
    brandLanguage?: BrandLanguage;
    /** Evidence-backed main channel visual language. */
    channelProfile?: ChannelProfile;
  }
): string {
  const hook = (options.hook || options.styleBrief?.suggestedHook || "").toUpperCase();
  const filter = cameraFilterForIndex(options.cameraFilterIndex ?? 0);
  const quality =
    (options.masterPrompt || "").trim() || DEFAULT_MASTER_PROMPT;

  const lines = [
    quality,
    filter.prompt,
    `Topic: ${topic.trim()}`,
  ];

  if (options.compositionFactors?.length) {
    lines.push(compositionFactorsPrompt(options.compositionFactors));
  }

  if (options.mediaIntelligence) {
    const media = options.mediaIntelligence;
    lines.push(
      "MEDIA INTELLIGENCE (ground the thumbnail in this evidence; do not invent unsupported subjects):",
      `Content summary: ${media.summary}`,
      `Audience: ${media.audience}`,
      `Primary subject: ${media.primarySubject}`,
      media.storyBeats.length ? `Story beats: ${media.storyBeats.slice(0, 6).join(" → ")}` : "",
      media.sceneTypes.length ? `Observed scene types: ${media.sceneTypes.join(", ")}` : "",
      `Visual depth: foreground=${media.depth.foreground}; midground=${media.depth.midground}; background=${media.depth.background}; focal subject=${media.depth.focalSubject}`,
      media.depth.depthCues.length
        ? `Depth cues: ${media.depth.depthCues.join(", ")}`
        : "",
      media.thumbnailOpportunities.length
        ? `Thumbnail opportunities: ${media.thumbnailOpportunities.join("; ")}`
        : "",
      `Measured media colors: ${media.colors.dominant.slice(0, 8).join(", ")}; preferred background ${media.colors.background}; readable text ${media.colors.text}`,
      `Evidence confidence: ${media.confidence.level} (${media.confidence.score}%). ${media.sourceSummary}`,
      media.confidence.limitations.length
        ? `EVIDENCE LIMITS: ${media.confidence.limitations.join("; ")}`
        : ""
    );
  }

  if (options.primaryVideoFrame) {
    lines.push(
      "PRIMARY VIDEO FRAME MODE: The first attached image is the user's uploaded video opening frame. It is the mandatory visual source — same subject, scene, framing, and energy. Research thumbnails are reference-only for colors and typography; they must NOT change who/what is in the image."
    );
  } else if (options.useOpeningFrames) {
    lines.push(
      "OPENING-FRAME MODE: Attached images include frames extracted from uploaded video clips (first 1–2 seconds). Match that opening-hook visual — subject, framing, and energy of the cold open — when composing the thumbnail."
    );
  }

  if (options.iterationNote) {
    lines.push(
      `ITERATION ${options.iterationIndex || 2}: Refine the previous thumbnail.`,
      `User edit request: ${options.iterationNote}`,
      "Keep the camera-real documentary look. Apply the edit precisely — do not add AI polish."
    );
  }

  if (hook) lines.push(`Bold hook text (phone-readable, ALL CAPS): "${hook}"`);

  if (options.brandLanguage) {
    lines.push(brandLanguagePromptBlock(options.brandLanguage));
  }

  if (options.channelProfile) {
    lines.push(channelProfilePromptBlock(options.channelProfile));
  }

  if (options.styleBrief) {
    lines.push(`Style from research: ${options.styleBrief.summary}`);
    lines.push(`Direction: ${options.styleBrief.creativeDirection}`);
    if (options.styleBrief.colorPalette?.length) {
      const colorLine = options.primaryVideoFrame
        ? `Colors (apply to primary video frame — palette from research, do not change subject): ${options.styleBrief.colorPalette
            .slice(0, 5)
            .join(", ")}`
        : options.mediaIntelligence
          ? `Colors (${options.mediaIntelligence.colors.source === "measured" ? "MUST match these hex measured from supplied media" : "fallback direction; adjust only if needed for faithful content"}): ${options.styleBrief.colorPalette
              .slice(0, 5)
              .join(", ")}`
          : `Colors (MUST match these hex from liked thumbnails): ${options.styleBrief.colorPalette
              .slice(0, 5)
              .join(", ")}`;
      lines.push(colorLine);
    }
    if (options.styleBrief.typography) {
      lines.push(`Typography: ${options.styleBrief.typography}`);
    }
    lines.push("Mood: trustworthy documentary — optimistic but grounded, not glossy ad CGI.");
    if (options.styleBrief.avoidList.length) {
      lines.push(`AVOID: ${options.styleBrief.avoidList.join("; ")}`);
    }
  }

  if (options.composition && COMPOSITION_MAP[options.composition]) {
    lines.push(COMPOSITION_MAP[options.composition]);
  }

  const liked = options.feedback?.filter((f) => f.rating === "like") || [];
  const disliked = options.feedback?.filter((f) => f.rating === "dislike") || [];

  if (liked.length) {
    const likedRefs = liked
      .map((f) => {
        const note = f.comment ? ` (user note: ${f.comment})` : "";
        return `"${f.title}" by ${f.channel}${note}`;
      })
      .join("; ");
    if (options.primaryVideoFrame) {
      lines.push(
        `Liked references (style hints only — do NOT override primary video frame): ${likedRefs}`
      );
    } else {
      lines.push(`STRONGLY match patterns from user-liked references: ${likedRefs}`);
    }
  }

  if (disliked.length) {
    const avoid = disliked
      .map((f) => {
        const note = f.comment ? ` because: ${f.comment}` : "";
        return `"${f.title}"${note}`;
      })
      .join("; ");
    lines.push(`Do NOT resemble user-disliked thumbnails: ${avoid}`);
  }

  if (options.inspirations?.length) {
    const refs = options.inspirations
      .slice(0, 6)
      .map((v) => `"${v.title}" (${v.channel})`)
      .join("; ");
    if (options.primaryVideoFrame) {
      lines.push(`Research thumbnails (palette/typography reference only): ${refs}`);
    } else {
      lines.push(`Additional references (layout/palette only): ${refs}`);
    }
  } else if (
    !options.mediaIntelligence &&
    !options.primaryVideoFrame &&
    !options.useOpeningFrames &&
    !options.iterationNote
  ) {
    lines.push(
      "SCRATCH MODE: No reference thumbnails provided. Invent a strong original YouTube thumbnail from the topic/hook alone — bold phone-readable text, clear subject, high contrast, 16:9 documentary energy. Do not copy a known channel's art."
    );
  }

  return lines.join("\n");
}
