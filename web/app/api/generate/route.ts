import { NextRequest, NextResponse } from "next/server";
import { buildUltraPrompt } from "@/lib/prompt-engine";
import { generateThumbnail } from "@/lib/generate";
import { buildPipelineOverview } from "@/lib/pipeline-overview";
import {
  applyPaletteToBrief,
  likedThumbsAsAssets,
  type ColorPaletteOption,
} from "@/lib/palette-suggestions";
import type { StyleBrief } from "@/lib/style-intelligence";
import type { ThumbnailFeedback, InspirationVideo } from "@/lib/inspiration";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const VARIANT_COMPOSITIONS = ["center", "cutout", "split", "data"] as const;

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
    const variantCount = Math.min(4, Math.max(1, Number(body.variantCount) || 4));
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
    const selectedIds = new Set<string>(
      inspirations.map((i: InspirationVideo) => i.videoId)
    );

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    if (!inspirations.length && !iterationNote) {
      return NextResponse.json(
        { error: "Select at least one reference thumbnail for generation" },
        { status: 400 }
      );
    }

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

    // Iteration: single image edit
    if (iterationNote) {
      const allAssets = [
        ...(baseImage
          ? [{ mimeType: "image/png", data: baseImage, label: "Current thumbnail to edit" }]
          : []),
        ...assets,
      ];
      const prompt = buildUltraPrompt(topic, {
        hook,
        composition,
        styleBrief: briefWithPalette,
        inspirations: sortedInspirations,
        feedback,
        iterationNote,
        iterationIndex,
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
    const sharedAssets = [...likedAssets, ...assets];

    // Build 3–4 combinations: mix palettes × compositions, anchored on liked DNA
    const palettesForVariants: Array<ColorPaletteOption | undefined> = [];
    if (selectedPalette) palettesForVariants.push(selectedPalette);
    for (const p of paletteOptions) {
      if (palettesForVariants.length >= variantCount) break;
      if (!palettesForVariants.some((x) => x?.id === p.id)) palettesForVariants.push(p);
    }
    while (palettesForVariants.length < variantCount) {
      palettesForVariants.push(selectedPalette || paletteOptions[0]);
    }

    const variants = Array.from({ length: variantCount }, (_, i) => {
      const palette = palettesForVariants[i];
      const comp =
        composition && composition !== "auto"
          ? composition
          : VARIANT_COMPOSITIONS[i % VARIANT_COMPOSITIONS.length];
      const brief = applyPaletteToBrief(styleBrief, palette);
      const prompt = buildUltraPrompt(topic, {
        hook,
        composition: comp,
        styleBrief: brief,
        inspirations: sortedInspirations,
        feedback,
      });
      return {
        id: `v${i + 1}`,
        label: palette
          ? `${palette.name} · ${comp}`
          : `Combo ${i + 1} · ${comp}`,
        paletteId: palette?.id,
        composition: comp,
        prompt,
      };
    });

    const settled = await Promise.allSettled(
      variants.map((v) =>
        generateThumbnail(v.prompt, model, [], imageSize, false, sharedAssets)
      )
    );

    const images = settled
      .map((result, i) => {
        if (result.status !== "fulfilled") return null;
        return {
          id: variants[i].id,
          image: result.value.imageBase64,
          label: variants[i].label,
          paletteId: variants[i].paletteId,
          composition: variants[i].composition,
          backend: result.value.backend,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      image: string;
      label: string;
      paletteId?: string;
      composition: string;
      backend: string;
    }>;

    if (!images.length) {
      const firstErr = settled.find((s) => s.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      throw new Error(
        firstErr?.reason instanceof Error
          ? firstErr.reason.message
          : "All thumbnail variants failed"
      );
    }

    return NextResponse.json({
      image: images[0].image,
      images,
      backend: images[0].backend,
      mimeType: "image/png",
      pipeline,
      promptPreview: variants[0].prompt.slice(0, 500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
