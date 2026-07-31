import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type BrandAsset,
  type EditorDocument,
  type EditorLayer,
  sortLayers,
} from "@/lib/editor-types";

function pctX(value: number): number {
  return (value / 100) * CANVAS_WIDTH;
}

function pctY(value: number): number {
  return (value / 100) * CANVAS_HEIGHT;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function applyBrandAsset(ctx: CanvasRenderingContext2D, asset: BrandAsset): void {
  const safe = (asset.safeAreaPercent / 100) * Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.01;
  const size = (asset.sizePercent / 100) * CANVAS_WIDTH;
  const margin = safe + 12;

  let x = margin;
  let y = margin;
  if (asset.corner.includes("right")) x = CANVAS_WIDTH - size - margin;
  if (asset.corner.includes("bottom")) y = CANVAS_HEIGHT - size - margin;

  ctx.save();
  ctx.globalAlpha = asset.opacity;
  const img = (ctx as unknown as { __brandImg?: HTMLImageElement }).__brandImg;
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  }
  ctx.restore();
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: Extract<EditorLayer, { type: "text" }>): void {
  const x = pctX(layer.x);
  const y = pctY(layer.y);
  const w = pctX(layer.width);
  const h = pctY(layer.height);
  const fontSize = (layer.font.size / 100) * CANVAS_HEIGHT;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.font = `${layer.font.weight} ${fontSize}px ${layer.font.family}`;
  ctx.textAlign = layer.font.align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = layer.font.fill;
  ctx.strokeStyle = layer.font.stroke;
  ctx.lineWidth = layer.font.strokeWidth;
  ctx.shadowColor = layer.font.shadowColor;
  ctx.shadowBlur = layer.font.shadowBlur;
  ctx.shadowOffsetX = layer.font.shadowOffsetX;
  ctx.shadowOffsetY = layer.font.shadowOffsetY;
  ctx.letterSpacing = `${layer.font.letterSpacing ?? 4}px`;

  const lines = layer.text.split("\n");
  const lineHeight = fontSize * 1.1;
  const startY = -((lines.length - 1) * lineHeight) / 2;
  const anchorX = layer.font.align === "left" ? -w / 2 + 8 : layer.font.align === "right" ? w / 2 - 8 : 0;

  for (let i = 0; i < lines.length; i++) {
    const lineY = startY + i * lineHeight;
    if (layer.font.strokeWidth > 0) ctx.strokeText(lines[i], anchorX, lineY);
    ctx.fillText(lines[i], anchorX, lineY);
  }
  ctx.restore();
}

function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: Extract<EditorLayer, { type: "image" | "watermark" }>,
  image: HTMLImageElement
): void {
  const x = pctX(layer.x);
  const y = pctY(layer.y);
  const w = pctX(layer.width);
  const h = pctY(layer.height);

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);

  if (layer.fit === "cover") {
    const scale = Math.max(w / image.width, h / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  } else {
    const scale = Math.min(w / image.width, h / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();
}

function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: Extract<EditorLayer, { type: "shape" }>): void {
  const x = pctX(layer.x);
  const y = pctY(layer.y);
  const w = pctX(layer.width);
  const h = pctY(layer.height);

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.fillStyle = layer.fill;
  ctx.strokeStyle = layer.stroke;
  ctx.lineWidth = layer.strokeWidth;

  if (layer.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (layer.strokeWidth > 0) ctx.stroke();
  } else {
    const r = layer.cornerRadius;
    const left = -w / 2;
    const top = -h / 2;
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.quadraticCurveTo(left + w, top, left + w, top + r);
    ctx.lineTo(left + w, top + h - r);
    ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
    ctx.lineTo(left + r, top + h);
    ctx.quadraticCurveTo(left, top + h, left, top + h - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
    ctx.fill();
    if (layer.strokeWidth > 0) ctx.stroke();
  }
  ctx.restore();
}

function drawArrowLayer(ctx: CanvasRenderingContext2D, layer: Extract<EditorLayer, { type: "arrow" }>): void {
  const x = pctX(layer.x);
  const y = pctY(layer.y);
  const w = pctX(layer.width);
  const h = pctY(layer.height);
  const cy = y + h / 2;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(x, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.strokeStyle = layer.color;
  ctx.fillStyle = layer.color;
  ctx.lineWidth = layer.strokeWidth;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w - layer.headSize, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w - layer.headSize, -layer.headSize * 0.6);
  ctx.lineTo(w - layer.headSize, layer.headSize * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBadgeLayer(ctx: CanvasRenderingContext2D, layer: Extract<EditorLayer, { type: "badge" }>): void {
  const x = pctX(layer.x);
  const y = pctY(layer.y);
  const w = pctX(layer.width);
  const h = pctY(layer.height);
  const fontSize = (layer.fontSize / 100) * CANVAS_HEIGHT;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.fillStyle = layer.fill;
  const radius = Math.min(w, h) * 0.2;
  const left = -w / 2;
  const top = -h / 2;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(left + w - radius, top);
  ctx.quadraticCurveTo(left + w, top, left + w, top + radius);
  ctx.lineTo(left + w, top + h - radius);
  ctx.quadraticCurveTo(left + w, top + h, left + w - radius, top + h);
  ctx.lineTo(left + radius, top + h);
  ctx.quadraticCurveTo(left, top + h, left, top + h - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = layer.textColor;
  ctx.font = `700 ${fontSize}px Montserrat, Helvetica Neue, Arial, sans-serif`;
  ctx.letterSpacing = "2px";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(layer.label, 0, 0);
  ctx.restore();
}

export async function renderEditorDocument(doc: EditorDocument): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  if (doc.backgroundImage) {
    const bg = await loadImage(doc.backgroundImage);
    ctx.drawImage(bg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  const imageCache = new Map<string, HTMLImageElement>();
  for (const layer of sortLayers(doc.layers)) {
    if (!layer.visible) continue;
    if (layer.type === "image" || layer.type === "watermark") {
      const src = layer.storageUrl || layer.src;
      if (!imageCache.has(src)) imageCache.set(src, await loadImage(src));
    }
  }

  if (doc.brandAsset?.previewUrl || doc.brandAsset?.storageUrl) {
    const brandSrc = doc.brandAsset.storageUrl || doc.brandAsset.previewUrl;
    (ctx as unknown as { __brandImg?: HTMLImageElement }).__brandImg = await loadImage(brandSrc);
  }

  for (const layer of sortLayers(doc.layers)) {
    if (!layer.visible) continue;
    switch (layer.type) {
      case "text":
        drawTextLayer(ctx, layer);
        break;
      case "image":
      case "watermark": {
        const src = layer.storageUrl || layer.src;
        const img = imageCache.get(src);
        if (img) drawImageLayer(ctx, layer, img);
        break;
      }
      case "shape":
        drawShapeLayer(ctx, layer);
        break;
      case "arrow":
        drawArrowLayer(ctx, layer);
        break;
      case "badge":
        drawBadgeLayer(ctx, layer);
        break;
      default:
        break;
    }
  }

  if (doc.brandAsset) applyBrandAsset(ctx, doc.brandAsset);

  return canvas.toDataURL("image/png");
}
