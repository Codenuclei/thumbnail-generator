import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type EditorDocument,
  type EditorLayer,
  sortLayers,
} from "@/lib/editor-types";

export type FigmaImportLayer = {
  type: "TEXT" | "RECTANGLE" | "ELLIPSE" | "IMAGE" | "FRAME";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: "LEFT" | "CENTER" | "RIGHT";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  imageUrl?: string;
};

export type FigmaImportDocument = {
  version: 1;
  title: string;
  width: number;
  height: number;
  backgroundImageUrl?: string;
  layers: FigmaImportLayer[];
  metadata?: {
    topic?: string;
    hook?: string;
    exportedAt: string;
  };
};

function pctX(value: number): number {
  return Math.round((value / 100) * CANVAS_WIDTH);
}

function pctY(value: number): number {
  return Math.round((value / 100) * CANVAS_HEIGHT);
}

function pctW(value: number): number {
  return Math.round((value / 100) * CANVAS_WIDTH);
}

function pctH(value: number): number {
  return Math.round((value / 100) * CANVAS_HEIGHT);
}

function mapTextAlign(align: string): "LEFT" | "CENTER" | "RIGHT" {
  if (align === "left") return "LEFT";
  if (align === "right") return "RIGHT";
  return "CENTER";
}

function layerToFigma(layer: EditorLayer): FigmaImportLayer | null {
  const base = {
    name: layer.name,
    x: pctX(layer.x),
    y: pctY(layer.y),
    width: pctW(layer.width),
    height: pctH(layer.height),
    rotation: layer.rotation,
    opacity: layer.opacity,
  };

  switch (layer.type) {
    case "text":
      return {
        ...base,
        type: "TEXT",
        characters: layer.text,
        fontSize: Math.round((layer.font.size / 100) * CANVAS_HEIGHT),
        fontFamily: layer.font.family.split(",")[0]?.trim() || "Impact",
        fontWeight: layer.font.weight,
        textAlign: mapTextAlign(layer.font.align),
        fill: layer.font.fill,
        stroke: layer.font.stroke,
        strokeWidth: layer.font.strokeWidth,
      };
    case "image":
    case "watermark":
      return {
        ...base,
        type: "IMAGE",
        imageUrl: layer.storageUrl || layer.src,
      };
    case "shape":
      return {
        ...base,
        type: layer.shape === "ellipse" ? "ELLIPSE" : "RECTANGLE",
        fill: layer.fill,
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        cornerRadius: layer.cornerRadius,
      };
    case "badge":
      return {
        ...base,
        type: "FRAME",
        fill: layer.fill,
        characters: layer.label,
        fontSize: Math.round((layer.fontSize / 100) * CANVAS_HEIGHT),
        fontFamily: "Impact",
        fontWeight: 800,
        textAlign: "CENTER",
      };
    case "arrow":
      return {
        ...base,
        type: "RECTANGLE",
        fill: layer.color,
        cornerRadius: 2,
      };
    default:
      return null;
  }
}

export function buildFigmaImportDocument(input: {
  title: string;
  topic?: string;
  hook?: string;
  backgroundImageUrl?: string;
  editorDoc: EditorDocument;
}): FigmaImportDocument {
  const layers: FigmaImportLayer[] = [];

  for (const layer of sortLayers(input.editorDoc.layers)) {
    if (!layer.visible) continue;
    const mapped = layerToFigma(layer);
    if (mapped) layers.push(mapped);
  }

  if (input.editorDoc.brandAsset) {
    const asset = input.editorDoc.brandAsset;
    const size = Math.round((asset.sizePercent / 100) * CANVAS_WIDTH);
    const margin = Math.round((asset.safeAreaPercent / 100) * 40) + 12;
    let x = margin;
    let y = margin;
    if (asset.corner.includes("right")) x = CANVAS_WIDTH - size - margin;
    if (asset.corner.includes("bottom")) y = CANVAS_HEIGHT - size - margin;

    layers.push({
      type: "IMAGE",
      name: asset.mode === "watermark" ? "Watermark" : "Brand logo",
      x,
      y,
      width: size,
      height: size,
      opacity: asset.opacity,
      imageUrl: asset.storageUrl || asset.previewUrl,
    });
  }

  return {
    version: 1,
    title: input.title,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundImageUrl: input.backgroundImageUrl,
    layers,
    metadata: {
      topic: input.topic,
      hook: input.hook,
      exportedAt: new Date().toISOString(),
    },
  };
}
