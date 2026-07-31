import { NextRequest, NextResponse } from "next/server";
import {
  buildUltraPrompt,
  cameraFilterForIndex,
  typographyVariantForIndex,
} from "@/lib/prompt-engine";
import {
  DEFAULT_VARIANT_COUNT,
  generateThumbnailVariants,
  generateWithVerification,
} from "@/lib/generate";
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
import type { TopicContext } from "@/lib/gemini-filter";

import { runtimeEnv } from "@/lib/runtime-env";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Auto mode sticks to single-scene layouts — split/data collages only render
// when the user explicitly picks them (they read as odd, disjointed thumbs).
const VARIANT_COMPOSITIONS = ["center", "cutout"] as const;
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
    // Empty string means user cleared the hook — do not treat as "missing" for fallbacks.
    const hook =
      typeof body.hook === "string" ? String(body.hook).trim() : undefined;
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
    const variantCount = Math.min(
      DEFAULT_VARIANT_COUNT,
      Math.max(1, Number(body.variantCount) || DEFAULT_VARIANT_COUNT)
    );
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
    const explicitLikedTitles = Array.isArray(body.likedTitles)
      ? body.likedTitles.map(String).filter((t: string) => t.trim())
      : [];
    const mediaIntelligence = body.mediaIntelligence
      ? (body.mediaIntelligence as GenerationMediaIntelligence)
      : undefined;
    const brandLanguage = body.brandLanguage as BrandLanguage | undefined;
    const channelProfile = body.channelProfile as ChannelProfile | undefined;
    const userBrief = body.userBrief ? String(body.userBrief).trim() : "";
    const userMediaPhotoCount = Math.max(
      0,
      Math.min(8, Number(body.userMediaPhotoCount) || 0)
    );
    const topicContext = body.topicContext as TopicContext | undefined;
    const seedVariant = body.seedVariant as
      | { image?: string; label?: string; note?: string }
      | undefined;
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
    // If the user cleared the form hook, strip any stale suggestedHook before prompting.
    const briefForPrompt =
      briefWithPalette && !(hook && hook.length)
        ? { ...briefWithPalette, suggestedHook: undefined }
        : briefWithPalette;

    const pipeline = buildPipelineOverview({
      topic,
      hook: hook ?? "",
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

    // Iteration: single image edit — compress payloads to keep requests small and fast
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
        hook: hook ?? "",
        composition,
        styleBrief: briefForPrompt,
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
        userBrief: userBrief || undefined,
        userMediaPhotoCount: userMediaPhotoCount || undefined,
        topicContext,
        selectedPalette,
        selectedRefCount: selectedIds.size,
      });
      const result = await generateWithVerification(
        prompt,
        {
          hook: hook ?? "",
          topic,
          maxRepairs: 1,
          allowSplit: composition === "split",
          typographyZoneId: typographyVariantForIndex(0).zoneId,
        },
        { model, imageSize, assets: allAssets, budgetMs: 150_000 }
      );
      return NextResponse.json({
        image: result.imageBase64,
        images: [
          {
            id: "iter-1",
            image: result.imageBase64,
            label: `Iteration ${iterationIndex || 2}`,
            paletteId: selectedPalette?.id,
            composition: composition || "auto",
            verification: result.verification,
          },
        ],
        backend: result.backend,
        mimeType: "image/png",
        pipeline,
        promptPreview: prompt.slice(0, 500),
      });
    }

    // Attach liked thumbnail images as visual references (compressed — big refs timeout Gemini)
    const likedRaw = await likedThumbsAsAssets(refPool.slice(0, 3));
    const likedAssets = await compressAssetsForApi(likedRaw);

    // Pre-extracted opening frames (streamed + ffmpeg'd at upload time)
    const openingAssets =
      useOpeningFrames && openingFrames.length
        ? openingFramesAsAssets(openingFrames)
        : [];
    const hasPrimaryVideoFrame = openingAssets.length > 0;

    const compressedEditAssets = assets.length ? await compressAssetsForApi(assets) : [];

    let seedAssets: Array<{
      mimeType: string;
      data: string;
      label?: string;
      role?: "seed";
    }> = [];
    if (seedVariant?.image) {
      const raw = String(seedVariant.image).replace(/^data:[^;]+;base64,/, "");
      const compressed = await compressBase64Server(raw, "image/png");
      seedAssets = [
        {
          mimeType: compressed.mimeType,
          data: compressed.data,
          label: seedVariant.label
            ? `Generated variant seed: ${seedVariant.label}`
            : "Generated variant seed",
          role: "seed" as const,
        },
      ];
    }

    // User-supplied media has priority; seed variant next; liked thumbs fill remaining slots.
    const refSlots = Math.max(
      0,
      3 - openingAssets.length - compressedEditAssets.length - seedAssets.length
    );
    const likedRefs = likedAssets
      .slice(0, refSlots)
      .map((a) => ({ ...a, role: "reference" as const }));
    const sharedAssets = hasPrimaryVideoFrame
      ? [...openingAssets, ...compressedEditAssets, ...seedAssets, ...likedRefs].slice(0, 3)
      : [...compressedEditAssets, ...seedAssets, ...likedRefs].slice(0, 3);

    const factorPool =
      compositionFactors.length > 0 ? compositionFactors : DEFAULT_FACTOR_IDS;

    // Build 4 combinations: DISTINCT palette × layout × camera × type.
    // Subject activity stays optional and evidence-led inside buildUltraPrompt.
    // Never pad by repeating the same palette box — rotate accents if short.
    const palettesForVariants: ColorPaletteOption[] = [];
    if (selectedPalette) palettesForVariants.push(selectedPalette);
    for (const p of paletteOptions) {
      if (palettesForVariants.length >= variantCount) break;
      if (!palettesForVariants.some((x) => x.id === p.id)) palettesForVariants.push(p);
    }
    // If we still need more slots, derive rotated variants from existing ones
    let rotateIdx = 0;
    while (palettesForVariants.length < variantCount && palettesForVariants.length > 0) {
      const base = palettesForVariants[rotateIdx % palettesForVariants.length];
      const colors = [...base.colors];
      const rotated = [
        colors[(rotateIdx + 1) % colors.length],
        colors[(rotateIdx + 2) % colors.length],
        colors[(rotateIdx + 3) % colors.length],
        colors[rotateIdx % colors.length],
      ].filter(Boolean);
      // Ensure we didn't just clone the same order
      const sameAsBase =
        rotated.length === base.colors.length &&
        rotated.every((c, i) => c.toUpperCase() === base.colors[i]?.toUpperCase());
      palettesForVariants.push({
        ...base,
        id: `${base.id}-rot-${rotateIdx + 1}`,
        name: `${base.name} · alt ${rotateIdx + 1}`,
        colors: sameAsBase ? [...colors].reverse() : rotated,
        rationale: `${base.rationale} (rotated accents for variant diversity)`,
      });
      rotateIdx += 1;
    }

    const variantSpecs = Array.from({ length: variantCount }, (_, i) => {
      const palette = palettesForVariants[i];
      const comp =
        composition && composition !== "auto"
          ? composition
          : VARIANT_COMPOSITIONS[i % VARIANT_COMPOSITIONS.length];
      const cam = cameraFilterForIndex(i);
      const typeVariant = typographyVariantForIndex(i);
      const factorId = factorPool[i % factorPool.length];
      const factorMeta = COMPOSITION_FACTORS.find((f) => f.id === factorId);
      const brief = applyPaletteToBrief(styleBrief, palette);
      const briefClean =
        brief && !(hook && hook.length)
          ? { ...brief, suggestedHook: undefined }
          : brief;
      const prompt = buildUltraPrompt(topic, {
        hook: hook ?? "",
        composition: comp,
        styleBrief: briefClean,
        inspirations: sortedInspirations,
        feedback,
        cameraFilterIndex: i,
        typographyVariantIndex: i,
        masterPrompt,
        // Full menu + preferred hint — AI decides if the factor fits this case
        compositionFactors: factorPool,
        compositionFactorHint: factorId,
        useOpeningFrames: useOpeningFrames && openingAssets.length > 0,
        primaryVideoFrame: hasPrimaryVideoFrame,
        mediaIntelligence,
        brandLanguage,
        channelProfile,
        userBrief: userBrief || undefined,
        userMediaPhotoCount: userMediaPhotoCount || undefined,
        topicContext,
        selectedPalette: palette,
        selectedRefCount: selectedIds.size,
        seedVariantNote: seedVariant?.note,
        seedVariantLabel: seedVariant?.label,
      });
      return {
        id: `v${i + 1}`,
        label: `${palette?.name || "Combo"} · ${COMPOSITION_LAYOUT_LABELS[comp] || comp} · ${typeVariant.label}`,
        paletteId: palette?.id,
        paletteName: palette?.name,
        composition: comp,
        compositionLabel: COMPOSITION_LAYOUT_LABELS[comp] || comp,
        cameraFilter: cam.id,
        cameraFilterLabel: cam.label,
        compositionFactor: factorId,
        compositionFactorLabel: factorMeta?.label || factorId,
        typographyZoneId: typeVariant.zoneId,
        prompt,
      };
    });

    const images = await generateThumbnailVariants(variantSpecs, {
      model,
      imageSize,
      assets: sharedAssets,
      targetCount: variantCount,
      // Parallel 1K batch needs wall-clock room for 3 variants + titles.
      // 4×1K parallel needs headroom under maxDuration 300s + client 240s.
      budgetMs: imageSize === "1K" ? 200_000 : imageSize === "2K" ? 220_000 : 260_000,
      // LLM-ops QA loop: every variant is OCR'd + typography-scored by a
      // vision model; failures regenerate once with a targeted repair note.
      verify: {
        hook: hook ?? "",
        topic,
        maxRepairs: 1,
        typographyZoneId: undefined,
      },
    });

    if (!images.length) {
      throw new Error("All thumbnail variants failed — try 1K or default model");
    }

    // AI titles — prefer explicit likedTitles, then feedback likes, then research suggestions
    const likedTitles = [
      ...explicitLikedTitles,
      ...feedback.filter((f) => f.rating === "like").map((f) => f.title),
      ...titleSuggestions,
    ].filter((t, i, arr) => t.trim() && arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
    const dislikedTitles = feedback
      .filter((f) => f.rating === "dislike")
      .map((f) => f.title);

    const titleFallback = Object.fromEntries(
      images.map((img, i) => {
        const spec = variantSpecs.find((v) => v.id === img.id);
        return [
          img.id,
          `${topic}${hook ? `: ${hook}` : ""} — ${spec?.compositionFactorLabel || `Option ${i + 1}`}`,
        ];
      })
    );

    let titleMap: Record<string, string> = titleFallback;
    try {
      titleMap = await Promise.race([
        suggestTitlesForVariants({
          topic,
          hook: hook || undefined,
          likedTitles,
          dislikedTitles,
          variants: variantSpecs
            .filter((v) => images.some((img) => img.id === v.id))
            .map((v) => ({
              id: v.id,
              cameraFilter: v.cameraFilterLabel || "",
              composition: v.compositionLabel || "",
              compositionFactor: v.compositionFactorLabel || "",
              paletteName: v.paletteName,
            })),
        }),
        new Promise<Record<string, string>>((resolve) =>
          setTimeout(() => resolve(titleFallback), 8_000)
        ),
      ]);
    } catch {
      titleMap = titleFallback;
    }

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

    const verified = enriched.filter((img) => img.verification);
    const qaStats = {
      verified: verified.length,
      passed: verified.filter((img) => img.verification?.verdict === "pass").length,
      repaired: verified.filter((img) => (img.verification?.attempts || 1) > 1).length,
    };
    if (verified.length) {
      console.log(
        `Thumbnail QA: ${qaStats.passed}/${qaStats.verified} passed, ${qaStats.repaired} repaired`
      );
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
      qaStats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
