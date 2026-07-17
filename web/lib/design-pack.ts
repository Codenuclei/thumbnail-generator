import type { GeneratedVariant } from "@/components/GenerationCanvas";
import type { BrandLanguage } from "@/lib/brand-language";
import type { ChannelProfile } from "@/lib/channel-profile";
import type { EditorDocument } from "@/lib/editor-types";
import type { VideoIntelligenceResult } from "@/lib/video-intelligence-types";
import { renderEditorDocument } from "@/lib/editor-canvas";

export type DesignPackMetadata = {
  version: 1;
  exportedAt: string;
  topic: string;
  hook: string;
  palette: {
    id?: string;
    name?: string;
    colors: string[];
  };
  fontIntent: EditorDocument["defaultFont"];
  sceneBrief?: string;
  sourceNotes: string[];
  channelProfile?: Pick<
    ChannelProfile,
    "channelName" | "summary" | "colorPalette" | "typography" | "motifs"
  >;
  brandLanguage?: BrandLanguage;
  variants: Array<{
    id: string;
    label: string;
    suggestedTitle?: string;
    composition?: string;
    paletteName?: string;
  }>;
  editor: {
    layerCount: number;
    hasBrandAsset: boolean;
    layers: Array<{ id: string; type: string; name: string; visible: boolean }>;
  };
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

export async function buildDesignPackMetadata(input: {
  topic: string;
  hook: string;
  paletteColors: string[];
  paletteId?: string;
  paletteName?: string;
  editorDoc: EditorDocument;
  mediaIntelligence?: VideoIntelligenceResult | null;
  channelProfile?: ChannelProfile | null;
  brandLanguage?: BrandLanguage | null;
  variants: GeneratedVariant[];
}): Promise<DesignPackMetadata> {
  const sourceNotes: string[] = [];
  if (input.mediaIntelligence?.sourceSummary) {
    sourceNotes.push(input.mediaIntelligence.sourceSummary);
  }
  if (input.mediaIntelligence?.confidence.limitations.length) {
    sourceNotes.push(...input.mediaIntelligence.confidence.limitations);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    topic: input.topic,
    hook: input.hook,
    palette: {
      id: input.paletteId,
      name: input.paletteName,
      colors: input.paletteColors,
    },
    fontIntent: input.editorDoc.defaultFont,
    sceneBrief: input.mediaIntelligence?.summary,
    sourceNotes,
    channelProfile: input.channelProfile
      ? {
          channelName: input.channelProfile.channelName,
          summary: input.channelProfile.summary,
          colorPalette: input.channelProfile.colorPalette,
          typography: input.channelProfile.typography,
          motifs: input.channelProfile.motifs,
        }
      : undefined,
    brandLanguage: input.brandLanguage || undefined,
    variants: input.variants.map((v) => ({
      id: v.id,
      label: v.label,
      suggestedTitle: v.suggestedTitle,
      composition: v.compositionLabel || v.composition,
      paletteName: v.paletteName,
    })),
    editor: {
      layerCount: input.editorDoc.layers.length,
      hasBrandAsset: Boolean(input.editorDoc.brandAsset),
      layers: input.editorDoc.layers.map((layer) => ({
        id: layer.id,
        type: layer.type,
        name: layer.name,
        visible: layer.visible,
      })),
    },
  };
}

export async function exportDesignPack(input: {
  topic: string;
  hook: string;
  activeImage: string | null;
  paletteColors: string[];
  paletteId?: string;
  paletteName?: string;
  editorDoc: EditorDocument;
  mediaIntelligence?: VideoIntelligenceResult | null;
  channelProfile?: ChannelProfile | null;
  brandLanguage?: BrandLanguage | null;
  variants: GeneratedVariant[];
}): Promise<{ metadata: DesignPackMetadata; flattenedImage?: string }> {
  const stamp = Date.now();
  const slug = (input.topic || "thumbnail").replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "thumbnail";
  const metadata = await buildDesignPackMetadata(input);

  let flattenedImage: string | undefined;
  if (input.editorDoc.layers.length > 0 || input.editorDoc.brandAsset) {
    flattenedImage = await renderEditorDocument({
      ...input.editorDoc,
      backgroundImage: input.editorDoc.backgroundImage || input.activeImage,
    });
    downloadBlob(dataUrlToBlob(flattenedImage), `${slug}-edited-${stamp}.png`);
  } else if (input.activeImage) {
    const dataUrl = await fetchImageAsDataUrl(input.activeImage);
    downloadBlob(dataUrlToBlob(dataUrl), `${slug}-active-${stamp}.png`);
  }

  for (const variant of input.variants) {
    const dataUrl = await fetchImageAsDataUrl(variant.image);
    const label = variant.label.replace(/[^a-z0-9]+/gi, "-").slice(0, 24) || variant.id;
    downloadBlob(dataUrlToBlob(dataUrl), `${slug}-${label}-${stamp}.png`);
  }

  downloadBlob(
    new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" }),
    `${slug}-design-pack-${stamp}.json`
  );

  return { metadata, flattenedImage };
}

export async function uploadDesignPackToStorage(
  metadata: DesignPackMetadata,
  imageDataUrl?: string
): Promise<{ metadataUrl?: string; imageUrl?: string }> {
  const stamp = Date.now();
  const results: { metadataUrl?: string; imageUrl?: string } = {};

  const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json",
  });
  const metaForm = new FormData();
  metaForm.append("folder", "design-packs");
  metaForm.append("file", metaBlob, `design-pack-${stamp}.json`);
  const metaRes = await fetch("/api/storage/upload", { method: "POST", body: metaForm });
  if (metaRes.ok) {
    const data = (await metaRes.json()) as { url?: string };
    results.metadataUrl = data.url;
  }

  if (imageDataUrl) {
    const imageBlob = dataUrlToBlob(imageDataUrl);
    const imageForm = new FormData();
    imageForm.append("folder", "design-packs");
    imageForm.append("file", imageBlob, `thumbnail-${stamp}.png`);
    const imageRes = await fetch("/api/storage/upload", { method: "POST", body: imageForm });
    if (imageRes.ok) {
      const data = (await imageRes.json()) as { url?: string };
      results.imageUrl = data.url;
    }
  }

  return results;
}
