export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export const FONT_FAMILIES = [
  "Montserrat, Helvetica Neue, Helvetica, Arial, sans-serif",
  "Helvetica Neue, Helvetica, Arial, sans-serif",
  "Oswald, Arial Narrow, sans-serif",
  "Bebas Neue, Arial Narrow, sans-serif",
  "Arial, Helvetica, sans-serif",
] as const;

export type TextAlign = "left" | "center" | "right";

export type FontStyle = {
  family: string;
  weight: number;
  size: number;
  align: TextAlign;
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  /** Canvas letterSpacing in px — open tracking by default. */
  letterSpacing: number;
};

export type LayerKind = "text" | "image" | "shape" | "arrow" | "badge" | "watermark";

export type LayerBase = {
  id: string;
  name: string;
  type: LayerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  zIndex: number;
};

export type TextLayer = LayerBase & {
  type: "text";
  text: string;
  font: FontStyle;
};

export type ImageLayer = LayerBase & {
  type: "image" | "watermark";
  src: string;
  storagePath?: string;
  storageUrl?: string;
  fit: "cover" | "contain";
};

export type ShapeLayer = LayerBase & {
  type: "shape";
  shape: "rect" | "ellipse";
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
};

export type ArrowLayer = LayerBase & {
  type: "arrow";
  color: string;
  strokeWidth: number;
  headSize: number;
};

export type BadgeLayer = LayerBase & {
  type: "badge";
  label: string;
  fill: string;
  textColor: string;
  fontSize: number;
};

export type EditorLayer = TextLayer | ImageLayer | ShapeLayer | ArrowLayer | BadgeLayer;

export type BrandCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type BrandAsset = {
  id: string;
  name: string;
  storagePath: string;
  storageUrl: string;
  previewUrl: string;
  mode: "logo" | "watermark";
  corner: BrandCorner;
  sizePercent: number;
  opacity: number;
  safeAreaPercent: number;
};

export type EditorDocument = {
  version: 1;
  backgroundImage: string | null;
  layers: EditorLayer[];
  brandAsset: BrandAsset | null;
  defaultFont: FontStyle;
};

export const DEFAULT_FONT: FontStyle = {
  family: FONT_FAMILIES[0],
  weight: 700,
  size: 8.5,
  align: "left",
  fill: "#ffffff",
  stroke: "transparent",
  strokeWidth: 0,
  shadowColor: "transparent",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  letterSpacing: 4,
};

export function createEmptyDocument(backgroundImage: string | null = null): EditorDocument {
  return {
    version: 1,
    backgroundImage,
    layers: [],
    brandAsset: null,
    defaultFont: { ...DEFAULT_FONT },
  };
}

export function createTextLayer(text: string, font: FontStyle = DEFAULT_FONT): TextLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Text",
    type: "text",
    text,
    font: { ...font },
    x: 8,
    y: 68,
    width: 84,
    height: 18,
    rotation: 0,
    opacity: 1,
    visible: true,
    zIndex: 10,
  };
}

export function createImageLayer(src: string, opts?: Partial<ImageLayer>): ImageLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Image",
    type: "image",
    src,
    fit: "contain",
    x: 10,
    y: 10,
    width: 30,
    height: 30,
    rotation: 0,
    opacity: 1,
    visible: true,
    zIndex: 5,
    ...opts,
  };
}

export function createShapeLayer(): ShapeLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Shape",
    type: "shape",
    shape: "rect",
    fill: "rgba(255,255,255,0.15)",
    stroke: "#ffffff",
    strokeWidth: 2,
    cornerRadius: 8,
    x: 5,
    y: 60,
    width: 40,
    height: 12,
    rotation: 0,
    opacity: 0.9,
    visible: true,
    zIndex: 3,
  };
}

export function createArrowLayer(): ArrowLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Arrow",
    type: "arrow",
    color: "#ffcc00",
    strokeWidth: 6,
    headSize: 18,
    x: 20,
    y: 40,
    width: 25,
    height: 8,
    rotation: 0,
    opacity: 1,
    visible: true,
    zIndex: 8,
  };
}

export function createBadgeLayer(label = "NEW"): BadgeLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Badge",
    type: "badge",
    label,
    fill: "#ff3b30",
    textColor: "#ffffff",
    fontSize: 4,
    x: 4,
    y: 6,
    width: 14,
    height: 8,
    rotation: 0,
    opacity: 1,
    visible: true,
    zIndex: 12,
  };
}

export function sortLayers(layers: EditorLayer[]): EditorLayer[] {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex);
}

export function reorderLayer(layers: EditorLayer[], id: string, direction: "up" | "down"): EditorLayer[] {
  const sorted = sortLayers(layers);
  const index = sorted.findIndex((l) => l.id === id);
  if (index < 0) return layers;
  const swap = direction === "up" ? index + 1 : index - 1;
  if (swap < 0 || swap >= sorted.length) return layers;
  const next = sorted.map((layer, i) => {
    if (i === index) return { ...layer, zIndex: sorted[swap].zIndex };
    if (i === swap) return { ...layer, zIndex: sorted[index].zIndex };
    return layer;
  });
  return next;
}
