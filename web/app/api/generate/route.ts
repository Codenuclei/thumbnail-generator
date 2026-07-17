import { NextRequest, NextResponse } from "next/server";
import { buildUltraPrompt, cameraFilterForIndex } from "@/lib/prompt-engine";
import { generateThumbnail, generateThumbnailVariants } from "@/lib/generate";
import { buildPipelineOverview } from "@/lib/pipeline-overview";
import {
  applyPaletteToBrief,
  likedThumbsAsAssets,
  type ColorPaletteOption,
} from "@/lib/palette-suggestions";
import { openingFramesAsAssets } from "@/lib/opening-frames";
import { COMPOSITION_FACTORS } from "@/lib/composition-factors";
import { suggestTitlesForVariants } from "@/lib/variant-titles";
import type { StyleBrief } from "@/lib/style-intelligence";
import type { ThumbnailFeedback, InspirationVideo } from "@/lib/inspiration";
import { compressAssetsForApi, compressBase64Server } from "@/lib/image-compress-server";
import type { GenerationMediaIntelligence } from "@/lib/video-intelligence-types";
import type { BrandLanguage } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";

import { runtimeEnv } from "@/lib/runtime-env";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const VARIANT_COMPOSITIONS = ["center", "cutout", "split", "data"] as const;
const COMPOSITION_LAYOUT_LABELS: Record<string, string> = {
  center: "Center hero",
  cutout: "Cutout + scene",
  split: "Split comparison",
  data: "Data overlay",
};
const DEFAULT_FACTOR_IDS = ["rule-of-thirds", "diagonal", "golden-spiral", "pyramid"];
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = String(body.topic || "").trim();
    const hook = body.hook ? String(body.hook).trim() : undefined;
    const composition = body.composition ? String(body.composition) : undefined;
    const model = body.model ? String(body.model) : undefined;
    const inspirations = Array.isArray(body.inspirations) ? body.inspirations : [];
    const feedback = Array.isArray(body.feedback) ? (body.feedback as ThumbnailFeedback[]) : [];
    const styleBrief = body.styleBrief as StyleBrief | undefined;
    const selectedPalette = body.selectedPalette as ColorPaletteOption | undefined;
    const paletteOptions = (Array.isArray(body.paletteOptions)
      ? body.paletteOptions
      : []) as ColorPaletteOption[];
    const imageSize = (body.imageSize as "1K" | "2K" | "4K") || "1K";
    const iterationNote = body.iterationNote ? String(body.iterationNote).trim() : undefined;
    const iterationIndex = body.iterationIndex ? Number(body.iterationIndex) : undefined;
    const masterPrompt = body.masterPrompt ? String(body.masterPrompt).trim() : undefined;
    const useOpeningFrames = Boolean(body.useOpeningFrames);
    const openingFrames = Array.isArray(body.openingFrames)
      ? body.openingFrames
          .map((f: { mimeType?: string; data?: string; label?: string }) => ({
            mimeType: String(f.mimeType || "image/jpeg"),
            data: String(f.data || "").replace(/^data:[^;]+;base64,/, ""),
            label: f.label ? String(f.label) : "Opening frame",
          }))
          .filter((f: { data: string }) => f.data)
      : [];
    const compositionFactors = Array.isArray(body.compositionFactors)
      ? body.compositionFactors.map(String)
      : [];
    const variantCount = Math.min(4, Math.max(1, Number(body.variantCount) || 2));
    const assets = Array.isArray(body.assets)
      ? body.assets
          .map((a: { mimeType?: string; data?: string; label?: string }) => ({
            mimeType: String(a.mimeType || "image/png"),
            data: String(a.data || "").replace(/^data:[^;]+;base64,/, ""),
            label: a.label ? String(a.label) : undefined,
          }))
          .filter((a: { data: string }) => a.data)
      : [];
    const baseImage = body.baseImage
      ? String(body.baseImage).replace(/^data:[^;]+;base64,/, "")
      : undefined;
    const titleSuggestions = Array.isArray(body.titleSuggestions)
      ? body.titleSuggestions.map(String)
      : [];
    const mediaIntelligence = body.mediaIntelligence
      ? (body.mediaIntelligence as GenerationMediaIntelligence)
      : undefined;
    const brandLanguage = body.brandLanguage as BrandLanguage | undefined;
    const channelProfile = body.channelProfile as ChannelProfile | undefined;
    const selectedIds = new Set<string>(
      inspirations.map((i: InspirationVideo) => i.videoId)
    );

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    if (!runtimeEnv("GEMINI_API_KEY") && !runtimeEnv("GOOGLE_API_KEY")) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not available on the server. Generation cannot run — check Railway env.",
        },
        { status: 503 }
      );
    }

    // References / media analysis are optional — topic alone is enough for scratch generation.

    const likedIds = new Set(feedback.filter((f) => f.rating === "like").map((f) => f.videoId));
    const sortedInspirations = [...inspirations].sort((a, b) => {
      const aLiked = likedIds.has(a.videoId) ? 1 : 0;
      const bLiked = likedIds.has(b.videoId) ? 1 : 0;
      return bLiked - aLiked;
    });

    const likedVideos = sortedInspirations.filter((v) => likedIds.has(v.videoId));
    const refPool = likedVideos.length ? likedVideos : sortedInspirations;

    const briefWithPalette = applyPaletteToBrief(styleBrief, selectedPalette);

    const pipeline = buildPipelineOverview({
      topic,
      hook: hook || "",
      composition: composition || "",
      imageSize,
      model: model || "",
      inspirations: sortedInspirations,
      selectedIds,
      feedback,
      styleBrief: briefWithPalette,
      titleSuggestions,
      iterationNote,
      iterationIndex,
    });

    // Iteration: single image edit — compress payloads to stay under Vercel body limits
    if (iterationNote) {
      const compressedBase = baseImage
        ? await compressBase64Server(baseImage, "image/png")
        : null;
      const compressedAssets = await compressAssetsForApi(assets);
      const allAssets = [
        ...(compressedBase
          ? [{ mimeType: compressedBase.mimeType, data: compressedBase.data, label: "Current thumbnail to edit" }]
          : []),
        ...compressedAssets,
      ];
      const prompt = buildUltraPrompt(topic, {
        hook,
        composition,
        styleBrief: briefWithPalette,
        inspirations: sortedInspirations,
        feedback,
        iterationNote,
        iterationIndex,
        masterPrompt,
        compositionFactors,
        useOpeningFrames,
        mediaIntelligence,
        brandLanguage,
        channelProfile,
      });
      const result = await generateThumbnail(prompt, model, [], imageSize, false, allAssets);
      return NextResponse.json({
        image: result.imageBase64,
        images: [
          {
            id: "iter-1",
            image: result.imageBase64,
            label: `Iteration ${iterationIndex || 2}`,
            paletteId: selectedPalette?.id,
            composition: composition || "auto",
          },
        ],
        backend: result.backend,
        mimeType: "image/png",
        pipeline,
        promptPreview: prompt.slice(0, 500),
      });
    }

    // Attach liked thumbnail images as visual references
    const likedAssets = await likedThumbsAsAssets(refPool);

    // Pre-extracted opening frames (streamed + ffmpeg'd at upload time)
    const openingAssets =
      useOpeningFrames && openingFrames.length
        ? openingFramesAsAssets(openingFrames)
        : [];
    const hasPrimaryVideoFrame = openingAssets.length > 0;

    const compressedEditAssets = assets.length ? await compressAssetsForApi(assets) : [];
    // User-supplied media has priority; liked thumbs fill only remaining style-reference slots.
    const refSlots = Math.max(
      0,
      4 - openingAssets.length - compressedEditAssets.length
    );
    const likedRefs = likedAssets
      .slice(0, refSlots)
      .map((a) => ({ ...a, role: "reference" as const }));
    const sharedAssets = hasPrimaryVideoFrame
      ? [...openingAssets, ...compressedEditAssets, ...likedRefs].slice(0, 4)
      : [...compressedEditAssets, ...likedAssets].slice(0, 4);

    const factorPool =
      compositionFactors.length > 0 ? compositionFactors : DEFAULT_FACTOR_IDS;

    // Build 4 combinations: palette × layout × camera × one composition factor each
    const palettesForVariants: Array<ColorPaletteOption | undefined> = [];
    if (selectedPalette) palettesForVariants.push(selectedPalette);
    for (const p of paletteOptions) {
      if (palettesForVariants.length >= variantCount) break;
      if (!palettesForVariants.some((x) => x?.id === p.id)) palettesForVariants.push(p);
    }
    while (palettesForVariants.length < variantCount) {
      palettesForVariants.push(selectedPalette || paletteOptions[0]);
    }

    const variantSpecs = Array.from({ length: variantCount }, (_, i) => {
      const palette = palettesForVariants[i];
      const comp =
        composition && composition !== "auto"
          ? composition
          : VARIANT_COMPOSITIONS[i % VARIANT_COMPOSITIONS.length];
      const cam = cameraFilterForIndex(i);
      const factorId = factorPool[i % factorPool.length];
      const factorMeta = COMPOSITION_FACTORS.find((f) => f.id === factorId);
      const brief = applyPaletteToBrief(styleBrief, palette);
      const prompt = buildUltraPrompt(topic, {
        hook,
        composition: comp,
        styleBrief: brief,
        inspirations: sortedInspirations,
        feedback,
        cameraFilterIndex: i,
        masterPrompt,
        compositionFactors: [factorId],
        useOpeningFrames: useOpeningFrames && openingAssets.length > 0,
        primaryVideoFrame: hasPrimaryVideoFrame,
        mediaIntelligence,
        brandLanguage,
        channelProfile,
      });
      return {
        id: `v${i + 1}`,
        label: `${palette?.name || "Combo"} · ${COMPOSITION_LAYOUT_LABELS[comp] || comp}`,
        paletteId: palette?.id,
        paletteName: palette?.name,
        composition: comp,
        compositionLabel: COMPOSITION_LAYOUT_LABELS[comp] || comp,
        cameraFilter: cam.id,
        cameraFilterLabel: cam.label,
        compositionFactor: factorId,
        compositionFactorLabel: factorMeta?.label || factorId,
        prompt,
      };
    });

    const images = await generateThumbnailVariants(variantSpecs, {
      model,
      imageSize,
      assets: sharedAssets,
      targetCount: variantCount,
    });

    if (!images.length) {
      throw new Error("All thumbnail variants failed — try 1K or default model");
    }

    // AI titles — one unique title per variant, inspired by refs but not copied
    const likedTitles = feedback
      .filter((f) => f.rating === "like")
      .map((f) => f.title);
    const dislikedTitles = feedback
      .filter((f) => f.rating === "dislike")
      .map((f) => f.title);

    const titleMap = await suggestTitlesForVariants({
      topic,
      hook,
      likedTitles,
      dislikedTitles,
      variants: variantSpecs
        .filter((v) => images.some((img) => img.id === v.id))
        .map((v) => ({
          id: v.id,
          cameraFilter: v.cameraFilterLabel,
          composition: v.compositionLabel,
          compositionFactor: v.compositionFactorLabel,
          paletteName: v.paletteName,
        })),
    });

    const enriched = images.map((img) => {
      const spec = variantSpecs.find((v) => v.id === img.id);
      const suggestedTitle = titleMap[img.id] || `${topic} — ${spec?.compositionFactorLabel || "Variant"}`;
      return {
        ...img,
        suggestedTitle,
        cameraFilter: spec?.cameraFilter,
        cameraFilterLabel: spec?.cameraFilterLabel,
        compositionFactor: spec?.compositionFactor,
        compositionFactorLabel: spec?.compositionFactorLabel,
        compositionLabel: spec?.compositionLabel,
        paletteName: spec?.paletteName,
        label: suggestedTitle,
      };
    });

    if (enriched.length < variantCount) {
      console.warn(`Only ${enriched.length}/${variantCount} variants succeeded`);
    }

    return NextResponse.json({
      image: enriched[0].image,
      images: enriched,
      backend: enriched[0].backend,
      mimeType: "image/png",
      pipeline,
      promptPreview: variantSpecs[0].prompt.slice(0, 500),
      openingFramesUsed: openingAssets.length,
      variantStats: { requested: variantCount, succeeded: enriched.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
